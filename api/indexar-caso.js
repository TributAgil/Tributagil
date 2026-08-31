// api/indexar-caso.js
//
// Extrai o texto dos documentos de um caso, quebra em chunks (por página) e
// grava os embeddings em `documento_chunks` — a base vetorial que o chatbot
// "Lu" consulta, sempre escopada por `caso_id` (nunca mistura casos de
// usuários diferentes).
//
// Desenho pensado para ser IDEMPOTENTE E RESUMÍVEL, adaptado ao que este
// projeto já tem (Vercel serverless sem fila externa, Supabase, Gemini):
//   1. Pula documento já indexado (`documentos_caso.indexado`) ANTES de
//      gastar qualquer chamada de IA — reindexar (retry, clique duplicado,
//      botão manual "Reindexar") é seguro e barato.
//   2. Embeddings de TODOS os chunks de um documento numa única chamada a
//      :batchEmbedContents, não uma por chunk.
//   3. Gravação de todos os chunks de um documento numa única RPC, que só
//      marca `indexado = true` depois de gravar — unidade atômica por
//      documento; se falhar no meio, o documento continua "não indexado" e
//      a próxima chamada tenta de novo do zero, sem estado parcial.
//   4. Rede de segurança final: `unique (caso_id, storage_path, pagina,
//      chunk_index)` + `on conflict do nothing` no banco — mesmo duas
//      chamadas em paralelo não duplicam linha.
//
// Disparado pelo frontend de forma "fire-and-forget" com `keepalive: true`
// (sobrevive a uma navegação rápida), em três momentos:
//   1. Logo após a PRIMEIRA análise de um caso novo ser salva (todos os docs).
//   2. Ao confirmar o upload de um documento COMPLEMENTAR numa reanálise.
//   3. Manualmente, pelo botão "Reindexar documentos" na aba do Lu.
//
// Runtime: Node (mesmo runtime de api/gemini.js), reaproveita o padrão de
// autenticação + leitura do Storage via RLS.

import { rateLimit, ipDoRequest } from './_ratelimit.js';
import { gerarEmbeddingsLote } from './_embeddings.js';
import { chatbotLiberadoParaPerfil } from './_chatbot-acesso.js';

const SUPABASE_URL_ENV = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_ENV = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
const BUCKET = 'documentos';
const MAX_DOCS = 20;
// Alinhado com api/gemini.js e com o teto real de processamento da IA
// (inline_data ~20 MB de request) — ver README, "tabelado a 12 MB".
const MAX_BYTES_POR_DOC = 12 * 1024 * 1024;
const TAMANHO_CHUNK = 1500; // caracteres

const RL_LIMITE = 10;
const RL_JANELA_MS = 60_000;

export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'GEMINI_API_KEY não configurada.' }, 500);

  const acesso = chatbotLiberadoParaPerfil();
  if (!acesso.liberado) {
    return json({ error: acesso.motivo || 'Indexação não disponível para este perfil.' }, 403);
  }

  const rl = rateLimit(`indexar-caso:${ipDoRequest(request)}`, RL_LIMITE, RL_JANELA_MS);
  if (!rl.ok) return json({ error: 'Muitas requisições. Aguarde um minuto.' }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const { casoId, userToken, manual } = body || {};
  const documentos = Array.isArray(body?.documentos) ? body.documentos.slice(0, MAX_DOCS) : [];
  const supabaseUrl = SUPABASE_URL_ENV || String(body?.supabaseUrl || '');
  const supabaseAnonKey = SUPABASE_ANON_ENV || String(body?.supabaseAnonKey || '');

  if (!casoId || documentos.length === 0) {
    return json({ error: 'Informe casoId e ao menos 1 documento.' }, 400);
  }
  if (!SUPABASE_URL_RE.test(supabaseUrl) || !supabaseAnonKey || !userToken) {
    return json({ error: 'Sessão ou configuração do Supabase ausente.' }, 401);
  }

  // ---- Autenticação (RLS garante que só o dono acessa) --------------------
  try {
    const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` },
    });
    if (!authResp.ok) return json({ error: 'Sessão inválida ou expirada.' }, 401);
  } catch (err) {
    console.error('[api/indexar-caso] Falha ao validar sessão:', err);
    return json({ error: 'Não foi possível validar sua sessão.' }, 502);
  }

  const headersSupabase = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${userToken}`,
    'Content-Type': 'application/json',
  };

  let totalChunks = 0;
  let pulados = 0;
  const erros = [];

  for (const doc of documentos) {
    const storagePath = String(doc?.storage_path || '').replace(/^\/+/, '');
    if (!storagePath) continue;

    try {
      // 1. Pula se já indexado — não gasta NENHUMA chamada de IA neste caso.
      //    Exceção: reindexação MANUAL (botão "Tentar reindexar") reprocessa
      //    um documento que ficou marcado indexado=true com ZERO chunks —
      //    esse estado significa "a extração rodou e não achou nada", que
      //    hoje é permanente por design (evita retentar um documento
      //    GENUINAMENTE em branco a cada análise futura). Mas quando o
      //    usuário pede reindexação explicitamente, "não retenta nunca mais"
      //    vira uma armadilha sem saída se a causa foi transitória (erro de
      //    extração, não documento realmente vazio) — ver 3 abaixo.
      const jaIndexado = await documentoJaIndexado({
        supabaseUrl,
        headersSupabase,
        casoId,
        storagePath,
        permitirRetentativaSeVazio: manual === true,
      });
      if (jaIndexado) {
        pulados += 1;
        continue;
      }

      // 2. Baixa o arquivo do Storage (respeitando RLS, como em api/gemini.js).
      const objetoUrl =
        `${supabaseUrl}/storage/v1/object/${BUCKET}/` +
        storagePath.split('/').map(encodeURIComponent).join('/');
      const arqResp = await fetch(objetoUrl, {
        headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` },
      });
      if (!arqResp.ok) {
        erros.push(`${doc?.nome || storagePath}: falha ao ler do Storage (HTTP ${arqResp.status})`);
        continue;
      }
      const buffer = await arqResp.arrayBuffer();
      if (buffer.byteLength > MAX_BYTES_POR_DOC) {
        erros.push(`${doc?.nome || storagePath}: excede ${mb(MAX_BYTES_POR_DOC)} MB, não indexado.`);
        continue;
      }
      const mime = doc?.mime_type || arqResp.headers.get('content-type') || 'application/octet-stream';

      // 3. Extrai o texto integral, página a página, via Gemini.
      const paginas = await extrairPaginas({ apiKey, mime, base64: Buffer.from(buffer).toString('base64') });

      // 4. Quebra cada página em chunks (pagina + chunk_index, sem gerar embedding ainda).
      const chunks = [];
      for (const pagina of paginas) {
        quebrarEmChunks(pagina.texto, TAMANHO_CHUNK).forEach((conteudo, chunkIndex) => {
          if (conteudo.trim()) chunks.push({ pagina: pagina.pagina, chunk_index: chunkIndex, conteudo });
        });
      }

      // 5. Embeddings de TODOS os chunks deste documento numa (ou poucas) chamada(s).
      //    Documento sem texto extraível (em branco/ilegível): `chunks` fica
      //    vazio e simplesmente pulamos a etapa de embedding — a gravação
      //    (passo 6) roda igual, com lista vazia, e a RPC ainda assim marca
      //    `indexado = true`. Sem isso, um documento assim seria retentado
      //    (gastando extração de novo) a cada indexação futura, para sempre.
      let chunksParaGravar = [];
      if (chunks.length > 0) {
        const embeddings = await gerarEmbeddingsLote(chunks.map((c) => c.conteudo));
        chunksParaGravar = chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));
      } else {
        erros.push(`${doc?.nome || storagePath}: nenhum texto extraído (documento em branco ou ilegível?) — não será tentado de novo.`);
      }

      // 6. Grava tudo numa única RPC — atômico por documento, idempotente no
      //    banco. Com lista vazia, só marca `indexado = true` (0 chunks).
      const rpcResp = await fetch(`${supabaseUrl}/rest/v1/rpc/inserir_documento_chunks_lote`, {
        method: 'POST',
        headers: headersSupabase,
        body: JSON.stringify({
          p_caso_id: casoId,
          p_storage_path: storagePath,
          p_documento_nome: doc?.nome || null,
          p_chunks: chunksParaGravar,
        }),
      });

      if (rpcResp.ok) {
        const inseridos = await rpcResp.json().catch(() => 0);
        totalChunks += Number(inseridos) || 0;
      } else {
        const detalhe = await rpcResp.text().catch(() => '');
        erros.push(`${doc?.nome || storagePath}: ${detalhe.slice(0, 200)}`);
      }
    } catch (err) {
      console.error('[api/indexar-caso] Falha ao indexar documento:', doc?.nome, err);
      erros.push(`${doc?.nome || storagePath}: ${err.message}`);
    }
  }

  return json(
    { ok: true, chunks_indexados: totalChunks, documentos_pulados: pulados, erros: erros.length ? erros : undefined },
    200,
  );
}

/**
 * Consulta `documentos_caso` para o par (caso, storage_path) — barato, sem IA.
 * `permitirRetentativaSeVazio` (reindexação manual): um documento marcado
 * indexado=true com chunks_gerados=0 significa "a extração rodou e não
 * achou nada" — pode ser um documento genuinamente em branco, ou pode ter
 * sido uma falha transitória da extração (ver extrairPaginas). Sem essa
 * exceção, esse estado é permanente por design (nunca reprocessa sozinho) e
 * o botão "Tentar reindexar" virava um no-op silencioso para esses casos.
 */
async function documentoJaIndexado({ supabaseUrl, headersSupabase, casoId, storagePath, permitirRetentativaSeVazio = false }) {
  const url =
    `${supabaseUrl}/rest/v1/documentos_caso?select=indexado,chunks_gerados` +
    `&caso_id=eq.${encodeURIComponent(casoId)}&storage_path=eq.${encodeURIComponent(storagePath)}&limit=1`;
  const resp = await fetch(url, { headers: headersSupabase });
  if (!resp.ok) return false; // migração pendente ou linha ainda não existe: segue e tenta indexar
  const linhas = await resp.json().catch(() => []);
  const linha = Array.isArray(linhas) ? linhas[0] : null;
  if (!linha || linha.indexado !== true) return false;
  if (permitirRetentativaSeVazio && Number(linha.chunks_gerados) === 0) return false;
  return true;
}

// Esquema ESTÁTICO (não construído dinamicamente por requisição — ao
// contrário da mutação de schema que quebrou api/gemini.js hoje em produção
// com HTTP 400. Este aqui é escrito uma vez, igual ao que já funciona em
// _schema-parecer.js / _schema-extracao.js). `minItems: 1` é o ponto real
// da correção: achado real em produção — para 2 documentos que o motor
// principal extraiu com fartura de conteúdo (30+ eventos cada, no fluxo de
// api/gemini.js), esta função devolveu `paginas: []`, sem nenhum erro HTTP.
// Sem responseSchema, nada obrigava o modelo a de fato tentar enumerar as
// páginas — o resultado era interpretado como "documento em branco" e
// gravado como tal PARA SEMPRE (ver documentoJaIndexado).
const ESQUEMA_PAGINAS = {
  type: 'OBJECT',
  required: ['paginas'],
  properties: {
    paginas: {
      type: 'ARRAY',
      minItems: 1,
      items: {
        type: 'OBJECT',
        required: ['pagina', 'texto'],
        properties: {
          pagina: { type: 'INTEGER' },
          texto: { type: 'STRING' },
        },
      },
    },
  },
};

/**
 * Pede ao Gemini o texto integral de cada página do documento, sem resumir
 * nem comentar — é extração, não análise. `responseSchema` garante que o
 * modelo pelo menos tente devolver 1 página, em vez de poder degenerar para
 * uma lista vazia sem nenhum sinal de erro.
 */
async function extrairPaginas({ apiKey, mime, base64 }) {
  const GEMINI = 'https://generativelanguage.googleapis.com';
  const modelo = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

  const corpo = JSON.stringify({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'Extraia o texto integral e literal de cada página deste documento, na ordem em que aparecem, ' +
              'sem resumir, sem comentar, sem corrigir ortografia. Se o documento não tiver páginas numeradas, ' +
              'considere cada página física do arquivo como uma unidade. Se realmente não houver texto legível ' +
              'em nenhuma página, devolva mesmo assim 1 item com "texto" vazio — nunca a lista vazia.',
          },
          { inline_data: { mime_type: mime, data: base64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: ESQUEMA_PAGINAS },
  });

  // Retry só para erro transitório (429/500/503) — mesma janela curta já
  // usada em api/gemini.js. Sem isso, um rate limit passageiro da API
  // marcava o documento como "sem texto" para sempre (ver acima).
  const ESPERAS_MS = [2000, 5000];
  let resp;
  for (let tentativa = 0; ; tentativa++) {
    resp = await fetch(
      `${GEMINI}/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo },
    );
    if (resp.ok) break;
    const transitorio = [429, 500, 503].includes(resp.status);
    if (!transitorio || tentativa >= ESPERAS_MS.length) {
      throw new Error(`Falha na extração de texto (HTTP ${resp.status}).`);
    }
    await new Promise((r) => setTimeout(r, ESPERAS_MS[tentativa]));
  }

  const data = await resp.json();
  const texto = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('') || '{}';
  let parsed;
  try {
    parsed = JSON.parse(texto);
  } catch {
    return [{ pagina: 1, texto }];
  }
  const paginas = Array.isArray(parsed?.paginas) ? parsed.paginas : [];
  return paginas.length > 0 ? paginas : [{ pagina: 1, texto: '' }];
}

/** Quebra um texto em pedaços de até `tamanho` caracteres, preferindo cortar em quebras de parágrafo. */
function quebrarEmChunks(texto, tamanho) {
  const limpo = String(texto || '').trim();
  if (limpo.length <= tamanho) return limpo ? [limpo] : [];

  const paragrafos = limpo.split(/\n{2,}/);
  const chunks = [];
  let atual = '';

  for (const p of paragrafos) {
    if ((atual + '\n\n' + p).length > tamanho && atual) {
      chunks.push(atual.trim());
      atual = p;
    } else {
      atual = atual ? `${atual}\n\n${p}` : p;
    }
    // Parágrafo sozinho maior que o tamanho do chunk: corta na força bruta.
    while (atual.length > tamanho) {
      chunks.push(atual.slice(0, tamanho).trim());
      atual = atual.slice(tamanho);
    }
  }
  if (atual.trim()) chunks.push(atual.trim());
  return chunks;
}

function mb(bytes) {
  return Math.round(bytes / (1024 * 1024));
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
