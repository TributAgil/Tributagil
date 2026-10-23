// api/lu.js
//
// Chatbot RAG "Lu" — assistente jurídico do TributÁgil, disponível depois que
// o parecer de um caso é emitido. Responde SOMENTE com base em:
//   1. Documentos daquele caso específico (retrieval escopado por `caso_id`,
//      nunca mistura casos de usuários diferentes).
//   2. O parecer da consulta e o resumo da última peça gerada (lidos do banco
//      com o token do próprio usuário, nunca enviados pelo navegador).
//   3. Base de legislação/jurisprudência tributária (global, curada).
//
// Citações: o contexto vai em blocos numerados ([D#] documento, [P#] parecer,
// [A#] peça, [L#] legislação). O modelo cita por esses identificadores e o
// código confere (api/_lu-citacoes.js): identificador inventado é apagado, e
// resposta sem nenhuma citação válida volta marcada "sem fonte conferida" e
// não desconta da cota. As perguntas prontas da tela não passam por aqui.
//
// Se a busca não retornar nada com boa correspondência em nenhuma das duas
// bases, devolve um "não sei" explícito SEM chamar o modelo de geração —
// garante o comportamento por código, não só por prompt.
//
// Cota: cada CONSULTA DE ANÁLISE (linha de `analises` — a original e cada
// reanálise, já que cada uma consome 1 crédito próprio) tem direito a 5
// perguntas com IA ao Lu (`analises.perguntas_lu_disponiveis`), nunca
// compartilhada com outras versões do mesmo caso. Só uma pergunta
// RESPONDIDA COM SUCESSO desconta da cota — um "não sei" por falta de
// contexto ou qualquer erro do sistema não descontam (o decremento só
// acontece no fim do caminho feliz, depois de já ter gerado a resposta).
//
// Exigência de fonte do caso: só gera resposta quando há pelo menos 1 fonte do
// CASO (trecho de documento com boa correspondência, o parecer ou o resumo da
// peça) — legislação sozinha não é suficiente (evita virar uma busca de
// legislação genérica desvinculada do caso, gastando a cota à toa).
//
// Runtime: Node (mesmo padrão de autenticação de api/gemini.js).

import { rateLimit, ipDoRequest } from './_ratelimit.js';
import { gerarEmbedding } from './_embeddings.js';
import { chatbotLiberadoParaPerfil } from './_chatbot-acesso.js';
import { chamarGemini, ErroGemini } from './_gemini-resiliente.js';
import { montarContextoLu, fonteParaCliente } from './_lu-contexto.js';
import { conferirCitacoes } from './_lu-citacoes.js';

const GEMINI = 'https://generativelanguage.googleapis.com';
// Supabase: SOMENTE do ambiente do servidor — NUNCA aceitos do corpo da
// requisição. Ver o mesmo comentário, mais detalhado, em api/gemini.js: um
// fallback para body.supabaseUrl permite que o cliente aponte para o
// PRÓPRIO projeto Supabase dele, passe na checagem de auth trivialmente e
// vire um proxy de IA aberto (embeddings + chat Gemini de graça).
const SUPABASE_URL_ENV = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_ENV = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;

const LIMITE_PERGUNTAS = 5;
const RL_LIMITE = 20;
const RL_JANELA_MS = 60_000;
const K_DOCUMENTOS = 6;
const K_LEGISLACAO = 6;
// Limiar conservador (cosseno): abaixo disso, trata como "sem correspondência".
// Ponto de partida deliberadamente básico — ajuste fino fica para depois de
// observar o comportamento real (decisão confirmada por Luan).
const LIMIAR_SIMILARIDADE = Number.parseFloat(process.env.LU_LIMIAR_SIMILARIDADE ?? '0.6');
const RESPOSTA_NAO_SEI =
  'Não encontrei essa informação nos documentos nem no parecer deste caso. Não vou responder com base só na ' +
  'legislação, sem nenhuma fonte do caso relacionada. Confira diretamente nos autos ou reformule a pergunta.';
const RESPOSTA_LIMITE_ATINGIDO =
  'Você já usou as 5 perguntas com IA disponíveis para esta consulta. As perguntas prontas continuam liberadas, ' +
  'e uma reanálise deste caso (nova consulta) dá outras 5.';

const SYSTEM_LU = `Você é Lu, o assistente jurídico do TributÁgil. Trate o usuário com cordialidade profissional, no tratamento masculino ao se referir a si mesmo.

Você é o melhor assistente possível para um advogado tributarista: conhece a fundo a legislação tributária sobre prescrição e decadência e os documentos DESTE caso específico — e nada além disso. Tom técnico e direto, sem enrolação; seja didático quando o usuário pedir uma explicação mais simples.

REGRAS INEGOCIÁVEIS:
1. Responda apenas com base no contexto fornecido: parecer do caso, resumo da peça, documentos do caso e legislação cadastrada, todos anexados nesta mensagem. Nunca utilize conhecimento geral fora desse contexto.
2. Se a informação ou a lei consultada não estiver presente no contexto fornecido, declare explicitamente que não possui essa informação, em vez de inferir ou complementar.
3. Nunca misture ou mencione informações de outro caso, você só enxerga o contexto anexado a esta mensagem.
4. Cada afirmação deve terminar com a citação do bloco de onde veio, usando EXATAMENTE o identificador do bloco entre colchetes, como [D1], [P2], [A1] ou [L3]. Para duas fontes, [D1][P2]. Nunca invente um identificador e nunca cite um bloco que não esteja no contexto.
5. Documentos do caso são os blocos [D#] (a citação já indica documento e página). O parecer são os blocos [P#]. O resumo da peça são os blocos [A#]. Legislação são os blocos [L#].
6. NÃO escreva uma seção "Fontes consultadas": a tela já mostra as fontes a partir das suas citações.
7. Se a peça não foi gerada (aviso no contexto), diga isso quando perguntarem sobre ela.
8. Nunca use travessão. Seja direto.`;

export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'GEMINI_API_KEY não configurada.' }, 500);

  const acesso = chatbotLiberadoParaPerfil();
  if (!acesso.liberado) {
    return json({ error: acesso.motivo || 'O Lu não está disponível para o seu plano.' }, 403);
  }

  const rl = await rateLimit(`lu:${ipDoRequest(request)}`, RL_LIMITE, RL_JANELA_MS);
  if (!rl.ok) {
    return json({ error: 'Muitas perguntas em sequência. Aguarde um minuto.' }, 429);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const { casoId, analiseId, userToken } = body || {};
  const pergunta = String(body?.pergunta || '').trim();
  const historico = Array.isArray(body?.historico) ? body.historico.slice(-6) : [];
  const supabaseUrl = SUPABASE_URL_ENV;
  const supabaseAnonKey = SUPABASE_ANON_ENV;

  if (!SUPABASE_URL_RE.test(supabaseUrl) || !supabaseAnonKey) {
    console.error('[api/lu] SUPABASE_URL/SUPABASE_ANON_KEY ausentes ou inválidas nas Environment Variables da Vercel.');
    return json({ error: 'Configuração do servidor ausente. Contate o suporte.' }, 500);
  }
  if (!casoId) return json({ error: 'Informe o caso (casoId).' }, 400);
  if (!analiseId) return json({ error: 'Informe a consulta (analiseId).' }, 400);
  if (!pergunta) return json({ error: 'Escreva uma pergunta.' }, 400);
  if (pergunta.length > 2000) return json({ error: 'Pergunta muito longa (máx. 2000 caracteres).' }, 400);
  if (!userToken) return json({ error: 'Sessão ausente. Faça login novamente.' }, 401);

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
  const { disponiveis: disponiveisAntes, resultado, pecaResumo } = await lerAnalise({ supabaseUrl, supabaseAnonKey, userToken, analiseId });
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

  // ---- Contexto numerado (parecer, peça, documentos, legislação) ----------
  const contexto = montarContextoLu({ docs, legislacao, resultado, pecaResumo });

  // Exige pelo menos 1 fonte do CASO (documento, parecer ou peça): "não sei"
  // explícito, sem gastar geração, se não houver. Legislação sozinha (mesmo com
  // correspondência) não basta. Não desconta da cota: só resposta gerada consome.
  if (!contexto.temFonteDoCaso) {
    return json({ resposta: RESPOSTA_NAO_SEI, fontes: [], perguntasDisponiveis: disponiveisAntes }, 200);
  }

  const contents = [
    ...historico
      .filter((m) => m?.papel && m?.texto)
      .map((m) => ({ role: m.papel === 'lu' ? 'model' : 'user', parts: [{ text: String(m.texto).slice(0, 2000) }] })),
    {
      role: 'user',
      parts: [{ text: `Contexto recuperado para esta pergunta:\n\n${contexto.texto}\n\n--- PERGUNTA ---\n${pergunta}` }],
    },
  ];

  // ---- Geração ------------------------------------------------------------
  const modelo = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  const temperatura = Number.parseFloat(process.env.GEMINI_TEMPERATURE ?? '0.2');

  try {
    const { resp } = await chamarGemini({
      montarUrl: (m) => `${GEMINI}/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`,
      corpo: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_LU }] },
        contents,
        generationConfig: { temperature: Number.isFinite(temperatura) ? temperatura : 0.2 },
      }),
      modelo,
      rotulo: 'lu',
    });

    const data = await resp.json();
    const texto = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('') || '';
    if (!texto.trim()) {
      return json({ error: 'A IA não retornou uma resposta. Tente reformular a pergunta.' }, 502);
    }

    // ---- Conferência das citações em código ----
    const conferida = conferirCitacoes(texto, contexto.blocos);
    if (conferida.semFonte) {
      // Nenhuma citação válida: a resposta aparece marcada e NÃO desconta da cota
      return json({ resposta: conferida.texto, fontes: [], semFonteConferida: true, perguntasDisponiveis: disponiveisAntes }, 200);
    }
    const fontes = conferida.usados.map((b, i) => fonteParaCliente(b, i + 1));

    // ---- Só AQUI, com a resposta já gerada e conferida, desconta 1 pergunta da cota ----
    const perguntasDisponiveis = await decrementarPerguntas({ supabaseUrl, supabaseAnonKey, userToken, analiseId, disponiveisAntes });

    return json({ resposta: conferida.texto, fontes, perguntasDisponiveis }, 200);
  } catch (err) {
    if (err instanceof ErroGemini) return json({ error: err.mensagemUsuario }, err.statusHttp);
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
 * Lê da consulta (`analises`), numa só chamada e com o token do usuário (RLS): a cota de perguntas com IA, o parecer
 * (`resultado`) e o resumo da última peça (`peca_resumo`). É por CONSULTA, não por caso: uma reanálise tem cota própria.
 * `disponiveis` vem limitado a LIMITE_PERGUNTAS (consultas antigas nasceram com 10). `null` = desconhecido (migração
 * pendente): o chamador não bloqueia. Se a coluna `peca_resumo` ainda não existe, repete a leitura sem ela.
 */
async function lerAnalise({ supabaseUrl, supabaseAnonKey, userToken, analiseId }) {
  const ler = async (colunas) => {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/analises?id=eq.${encodeURIComponent(analiseId)}&select=${colunas}&limit=1`,
      { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` } },
    );
    if (!resp.ok) return undefined;
    return (await resp.json().catch(() => []))?.[0] || null;
  };
  try {
    let linha = await ler('perguntas_lu_disponiveis,resultado,peca_resumo');
    if (linha === undefined) linha = await ler('perguntas_lu_disponiveis,resultado'); // migração do resumo ainda pendente
    if (!linha) return { disponiveis: null, resultado: null, pecaResumo: null };
    const v = linha.perguntas_lu_disponiveis;
    return {
      disponiveis: Number.isFinite(v) ? Math.min(v, LIMITE_PERGUNTAS) : null,
      resultado: linha.resultado || null,
      pecaResumo: linha.peca_resumo || null,
    };
  } catch (err) {
    console.warn('[api/lu] Falha ao ler a análise:', err.message);
    return { disponiveis: null, resultado: null, pecaResumo: null };
  }
}

/**
 * Desconta 1 pergunta da cota desta CONSULTA (analise_id), de forma atômica
 * (RPC `decrementar_pergunta_lu` — nunca deixa o saldo passar de 0, mesmo
 * sob concorrência). Chamada só depois que a resposta já foi gerada — uma
 * falha aqui não pode fazer a pergunta já respondida "sumir" para o
 * usuário, então nunca lança: na pior hipótese, devolve uma estimativa
 * best-effort.
 */
async function decrementarPerguntas({ supabaseUrl, supabaseAnonKey, userToken, analiseId, disponiveisAntes }) {
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/decrementar_pergunta_lu`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_analise_id: analiseId }),
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
