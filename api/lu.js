// api/lu.js
//
// Chatbot RAG "Lu" — assistente jurídico do TributÁgil, disponível depois que
// o parecer de um caso é emitido. Responde SOMENTE com base em:
//   1. Documentos daquele caso específico (retrieval escopado por `caso_id`,
//      nunca mistura casos de usuários diferentes).
//   2. Base de legislação/jurisprudência tributária (global, curada).
//
// Se a busca não retornar nada com boa correspondência em nenhuma das duas
// bases, devolve um "não sei" explícito SEM chamar o modelo de geração —
// garante o comportamento por código, não só por prompt.
//
// Cota: cada CASO (não cada versão) tem direito a 10 perguntas ao Lu
// (`casos.perguntas_lu_disponiveis`). Só uma pergunta RESPONDIDA COM
// SUCESSO desconta da cota — um "não sei" por falta de contexto ou
// qualquer erro do sistema não descontam (o decremento só acontece no fim
// do caminho feliz, depois de já ter gerado a resposta).
//
// Runtime: Node (mesmo padrão de autenticação de api/gemini.js).

import { rateLimit, ipDoRequest } from './_ratelimit.js';
import { gerarEmbedding } from './_embeddings.js';
import { chatbotLiberadoParaPerfil } from './_chatbot-acesso.js';

const GEMINI = 'https://generativelanguage.googleapis.com';
const SUPABASE_URL_ENV = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_ENV = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;

const RL_LIMITE = 20;
const RL_JANELA_MS = 60_000;
const K_DOCUMENTOS = 6;
const K_LEGISLACAO = 6;
// Limiar conservador (cosseno): abaixo disso, trata como "sem correspondência".
// Ponto de partida deliberadamente básico — ajuste fino fica para depois de
// observar o comportamento real (decisão confirmada por Luan).
const LIMIAR_SIMILARIDADE = Number.parseFloat(process.env.LU_LIMIAR_SIMILARIDADE ?? '0.6');
const RESPOSTA_NAO_SEI =
  'Não encontrei essa informação nos documentos deste caso nem na base de legislação cadastrada. ' +
  'Não vou inferir ou complementar — confira diretamente nos autos ou reformule a pergunta.';
const RESPOSTA_LIMITE_ATINGIDO =
  'Você já usou as 10 perguntas disponíveis para este caso. Para continuar investigando, reveja o ' +
  'parecer e os documentos diretamente, ou inicie uma nova análise (um caso novo tem outras 10 perguntas).';

const SYSTEM_LU = `Você é Lu, o assistente jurídico do TributÁgil. Trate o usuário com cordialidade profissional, no tratamento masculino ao se referir a si mesmo.

Você é o melhor assistente possível para um advogado tributarista: conhece a fundo a legislação tributária sobre prescrição e decadência e os documentos DESTE caso específico — e nada além disso. Tom técnico e direto, sem enrolação; seja didático quando o usuário pedir uma explicação mais simples.

REGRAS INEGOCIÁVEIS:
1. Responda apenas com base no contexto fornecido pelos documentos do caso e pela legislação cadastrada, ambos anexados nesta mensagem. Nunca utilize conhecimento geral fora desse contexto.
2. Se a informação ou a lei consultada não estiver presente nos documentos ou na base de legislação fornecida, declare explicitamente que não possui essa informação, em vez de inferir ou complementar.
3. Nunca misture ou mencione informações de outro caso — você só enxerga o contexto anexado a esta mensagem.
4. TODA resposta baseada em legislação deve indicar o artigo, parágrafo, súmula ou tema de recurso repetitivo exato utilizado (use o formato "[norma] [identificador]" já presente nos blocos de contexto).
5. TODA resposta baseada em documentos do caso deve indicar o documento de origem e a página (use o formato "[documento] pág. [página]" já presente nos blocos de contexto).
6. Encerre toda resposta com uma seção "Fontes consultadas", listando cada citação usada, uma por linha.
7. Se a resposta combinar mais de uma fonte, deixe rastreável qual afirmação vem de qual fonte.`;

export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'GEMINI_API_KEY não configurada.' }, 500);

  const acesso = chatbotLiberadoParaPerfil();
  if (!acesso.liberado) {
    return json({ error: acesso.motivo || 'O Lu não está disponível para o seu plano.' }, 403);
  }

  const rl = rateLimit(`lu:${ipDoRequest(request)}`, RL_LIMITE, RL_JANELA_MS);
  if (!rl.ok) {
    return json({ error: 'Muitas perguntas em sequência. Aguarde um minuto.' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const { casoId, userToken } = body || {};
  const pergunta = String(body?.pergunta || '').trim();
  const historico = Array.isArray(body?.historico) ? body.historico.slice(-6) : [];
  const supabaseUrl = SUPABASE_URL_ENV || String(body?.supabaseUrl || '');
  const supabaseAnonKey = SUPABASE_ANON_ENV || String(body?.supabaseAnonKey || '');

  if (!casoId) return json({ error: 'Informe o caso (casoId).' }, 400);
  if (!pergunta) return json({ error: 'Escreva uma pergunta.' }, 400);
  if (pergunta.length > 2000) return json({ error: 'Pergunta muito longa (máx. 2000 caracteres).' }, 400);
  if (!SUPABASE_URL_RE.test(supabaseUrl) || !supabaseAnonKey || !userToken) {
    return json({ error: 'Sessão ausente. Faça login novamente.' }, 401);
  }

  // ---- Autenticação -----------------------------------------------------
  try {
    const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` },
    });
    if (!authResp.ok) return json({ error: 'Sessão inválida ou expirada. Faça login novamente.' }, 401);
  } catch (err) {
    console.error('[api/lu] Falha ao validar sessão:', err);
    return json({ error: 'Não foi possível validar sua sessão.' }, 502);
  }

  // ---- Cota de perguntas: checagem BARATA antes de gastar qualquer IA -----
  // Lê o saldo atual; se já está em 0, nem gera embedding. Se a leitura
  // falhar (migração pendente), trata como "desconhecido" e segue sem
  // bloquear — mesma filosofia "nunca quebra" do resto do app.
  const disponiveisAntes = await lerPerguntasDisponiveis({ supabaseUrl, supabaseAnonKey, userToken, casoId });
  if (disponiveisAntes !== null && disponiveisAntes <= 0) {
    return json({ resposta: RESPOSTA_LIMITE_ATINGIDO, fontes: [], limiteAtingido: true, perguntasDisponiveis: 0 }, 200);
  }

  // ---- Retrieval (embedding da pergunta + busca nas duas bases) --------
  let embedding;
  try {
    embedding = await gerarEmbedding(pergunta);
  } catch (err) {
    console.error('[api/lu] Falha ao gerar embedding da pergunta:', err);
    return json({ error: 'Não foi possível processar sua pergunta agora. Tente novamente.' }, 502);
  }

  const chamarRpc = async (nome, params) => {
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/${nome}`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!resp.ok) {
      // Migração pendente (função/tabela ausente) ou caso sem chunks ainda —
      // degrada para "sem resultados" em vez de quebrar a conversa.
      console.warn(`[api/lu] RPC ${nome} falhou (HTTP ${resp.status}):`, await resp.text().catch(() => ''));
      return [];
    }
    return resp.json().catch(() => []);
  };

  const [docsRaw, legislacaoRaw] = await Promise.all([
    chamarRpc('buscar_documento_chunks', { p_caso_id: casoId, p_query_embedding: embedding, p_limite: K_DOCUMENTOS }),
    chamarRpc('buscar_legislacao_chunks', { p_query_embedding: embedding, p_limite: K_LEGISLACAO }),
  ]);

  const docs = (Array.isArray(docsRaw) ? docsRaw : []).filter((d) => d.similaridade >= LIMIAR_SIMILARIDADE);
  const legislacao = (Array.isArray(legislacaoRaw) ? legislacaoRaw : []).filter(
    (l) => l.similaridade >= LIMIAR_SIMILARIDADE,
  );

  // ---- Sem contexto relevante em nenhuma base: "não sei" explícito, sem gastar geração ----
  // Não desconta da cota — só uma resposta de fato gerada consome pergunta.
  if (docs.length === 0 && legislacao.length === 0) {
    return json({ resposta: RESPOSTA_NAO_SEI, fontes: [], perguntasDisponiveis: disponiveisAntes }, 200);
  }

  // ---- Monta o contexto recuperado + fontes estruturadas (backstop da UI) ----
  const blocosDocs = docs.map(
    (d) => `[DOCUMENTO: ${d.documento_nome || 'documento'} — pág. ${d.pagina ?? '—'}]\n${d.conteudo}`,
  );
  const blocosLegislacao = legislacao.map(
    (l) => `[LEI: ${l.norma} ${l.identificador}]\n${l.texto_integral}`,
  );

  const fontes = [
    ...docs.map((d) => ({
      tipo: 'documento',
      documento: d.documento_nome || 'documento',
      pagina: d.pagina ?? null,
      trecho: String(d.conteudo || '').slice(0, 280),
    })),
    ...legislacao.map((l) => ({
      tipo: 'legislacao',
      norma: l.norma,
      identificador: l.identificador,
    })),
  ];

  const contextoTexto =
    (blocosDocs.length ? `--- DOCUMENTOS DO CASO ---\n${blocosDocs.join('\n\n')}\n\n` : '') +
    (blocosLegislacao.length ? `--- LEGISLAÇÃO E JURISPRUDÊNCIA ---\n${blocosLegislacao.join('\n\n')}` : '');

  const contents = [
    ...historico
      .filter((m) => m?.papel && m?.texto)
      .map((m) => ({ role: m.papel === 'lu' ? 'model' : 'user', parts: [{ text: String(m.texto).slice(0, 2000) }] })),
    {
      role: 'user',
      parts: [{ text: `Contexto recuperado para esta pergunta:\n\n${contextoTexto}\n\n--- PERGUNTA ---\n${pergunta}` }],
    },
  ];

  // ---- Geração ------------------------------------------------------------
  const modelo = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const temperatura = Number.parseFloat(process.env.GEMINI_TEMPERATURE ?? '0.2');

  try {
    const resp = await fetch(
      `${GEMINI}/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_LU }] },
          contents,
          generationConfig: { temperature: Number.isFinite(temperatura) ? temperatura : 0.2 },
        }),
      },
    );

    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => '');
      console.error('[api/lu] Gemini respondeu erro:', resp.status, detalhe.slice(0, 500));
      return json({ error: `Falha ao gerar a resposta (HTTP ${resp.status}).` }, 502);
    }

    const data = await resp.json();
    const texto = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('') || '';
    if (!texto.trim()) {
      return json({ error: 'A IA não retornou uma resposta. Tente reformular a pergunta.' }, 502);
    }

    // ---- Só AQUI, com a resposta já gerada, desconta 1 pergunta da cota ----
    const perguntasDisponiveis = await decrementarPerguntas({ supabaseUrl, supabaseAnonKey, userToken, casoId, disponiveisAntes });

    return json({ resposta: texto, fontes, perguntasDisponiveis }, 200);
  } catch (err) {
    console.error('[api/lu] Erro ao gerar resposta:', err);
    return json({ error: 'Erro ao conectar com a IA.' }, 502);
  }
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * Lê `casos.perguntas_lu_disponiveis` (leitura simples, coberta pela mesma
 * policy de SELECT de `casos` — sem custo de IA). Devolve `null` se não der
 * para ler (migração pendente, coluna ausente) — nesse caso o chamador trata
 * como "desconhecido" e não bloqueia.
 */
async function lerPerguntasDisponiveis({ supabaseUrl, supabaseAnonKey, userToken, casoId }) {
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/casos?id=eq.${encodeURIComponent(casoId)}&select=perguntas_lu_disponiveis&limit=1`,
      { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` } },
    );
    if (!resp.ok) return null;
    const linhas = await resp.json().catch(() => []);
    const valor = linhas?.[0]?.perguntas_lu_disponiveis;
    return Number.isFinite(valor) ? valor : null;
  } catch (err) {
    console.warn('[api/lu] Falha ao ler a cota de perguntas:', err.message);
    return null;
  }
}

/**
 * Desconta 1 pergunta da cota do caso, de forma atômica (RPC
 * `decrementar_pergunta_lu` — nunca deixa o saldo passar de 0, mesmo sob
 * concorrência). Chamada só depois que a resposta já foi gerada — uma falha
 * aqui não pode fazer a pergunta já respondida "sumir" para o usuário, então
 * nunca lança: na pior hipótese, devolve uma estimativa best-effort.
 */
async function decrementarPerguntas({ supabaseUrl, supabaseAnonKey, userToken, casoId, disponiveisAntes }) {
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/decrementar_pergunta_lu`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_caso_id: casoId }),
    });
    if (resp.ok) {
      const restantes = await resp.json().catch(() => null);
      return Number.isFinite(restantes) ? restantes : disponiveisAntes;
    }
    const detalhe = await resp.text().catch(() => '');
    console.warn('[api/lu] Falha ao descontar pergunta:', detalhe);
    // Se o RPC diz explicitamente que a cota já estava zerada (corrida rara:
    // a checagem inicial não leu direito e só o decremento atômico pegou o
    // 0 real), devolve 0 de verdade — nunca `disponiveisAntes` aqui, senão
    // o frontend acha que ainda há margem e deixa perguntar de novo.
    if (/LIMITE_ATINGIDO/i.test(detalhe)) return 0;
  } catch (err) {
    console.warn('[api/lu] Erro de rede ao descontar pergunta:', err.message);
  }
  // Migração pendente ou falha de rede (não é "limite atingido"): estimativa
  // best-effort a partir do que já sabíamos antes da pergunta.
  return disponiveisAntes !== null ? Math.max(0, disponiveisAntes - 1) : null;
}
