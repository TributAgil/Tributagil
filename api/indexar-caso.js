// api/indexar-caso.js
//
// Extrai o texto dos documentos de um caso, quebra em chunks (por página) e
// grava os embeddings em `documento_chunks` — a base vetorial que o chatbot
// "Lu" consulta, sempre escopada por `caso_id` (nunca mistura casos de
// usuários diferentes).
//
// Disparado pelo frontend de forma "fire-and-forget" (best-effort, não
// bloqueia a exibição do parecer) em dois momentos:
//   1. Logo após a PRIMEIRA análise de um caso novo ser salva (todos os docs).
//   2. Ao confirmar o upload de um documento COMPLEMENTAR numa reanálise
//      (só o(s) arquivo(s) novo(s) — os antigos já foram indexados antes).
//
// Runtime: Node (mesmo runtime de api/gemini.js), reaproveita o padrão de
// autenticação + leitura do Storage via RLS.

import { rateLimit, ipDoRequest } from './_ratelimit.js';
import { gerarEmbedding } from './_embeddings.js';

const SUPABASE_URL_ENV = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_ENV = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
const BUCKET = 'documentos';
const MAX_DOCS = 20;
const MAX_BYTES_POR_DOC = 12 * 1024 * 1024;
const TAMANHO_CHUNK = 1500; // caracteres

const RL_LIMITE = 10;
const RL_JANELA_MS = 60_000;

export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'GEMINI_API_KEY não configurada.' }, 500);

  const rl = rateLimit(`indexar-caso:${ipDoRequest(request)}`, RL_LIMITE, RL_JANELA_MS);
  if (!rl.ok) return json({ error: 'Muitas requisições. Aguarde um minuto.' }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const { casoId, userToken } = body || {};
  const documentos = Array.isArray(body?.documentos) ? body.documentos.slice(0, MAX_DOCS) : [];
  const supabaseUrl = SUPABASE_URL_ENV || String(body?.supabaseUrl || '');
  const supabaseAnonKey = SUPABASE_ANON_ENV || String(body?.supabaseAnonKey || '');

  if (!casoId || documentos.length === 0) {
    return json({ error: 'Informe casoId e ao menos 1 documento.' }, 400);
  }
  if (!SUPABASE_URL_RE.test(supabaseUrl) || !supabaseAnonKey || !userToken) {
    return json({ error: 'Sessão ou configuração do Supabase ausente.' }, 401);
  }

  // ---- Autenticação + posse do caso (RLS garante que só o dono acessa) ----
  try {
    const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` },
    });
    if (!authResp.ok) return json({ error: 'Sessão inválida ou expirada.' }, 401);
  } catch (err) {
    console.error('[api/indexar-caso] Falha ao validar sessão:', err);
    return json({ error: 'Não foi possível validar sua sessão.' }, 502);
  }

  let totalChunks = 0;
  const erros = [];

  for (const doc of documentos) {
    const storagePath = String(doc?.storage_path || '').replace(/^\/+/, '');
    if (!storagePath) continue;

    try {
      // 1. Baixa o arquivo do Storage (respeitando RLS, como em api/gemini.js).
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
        erros.push(`${doc?.nome || storagePath}: excede o limite para indexação.`);
        continue;
      }
      const mime = doc?.mime_type || arqResp.headers.get('content-type') || 'application/octet-stream';

      // 2. Extrai o texto integral, página a página, via Gemini.
      const paginas = await extrairPaginas({ apiKey, mime, base64: Buffer.from(buffer).toString('base64') });

      // 3. Quebra cada página em chunks, gera embedding e grava via RPC
      //    (SECURITY DEFINER — só grava no próprio caso do usuário chamador).
      for (const pagina of paginas) {
        const pedacos = quebrarEmChunks(pagina.texto, TAMANHO_CHUNK);
        for (const pedaco of pedacos) {
          if (!pedaco.trim()) continue;
          const embedding = await gerarEmbedding(pedaco);
          const rpcResp = await fetch(`${supabaseUrl}/rest/v1/rpc/inserir_documento_chunk`, {
            method: 'POST',
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${userToken}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              p_caso_id: casoId,
              p_documento_nome: doc?.nome || null,
              p_storage_path: storagePath,
              p_pagina: pagina.pagina,
              p_conteudo: pedaco,
              p_embedding: embedding,
            }),
          });
          if (rpcResp.ok) {
            totalChunks += 1;
          } else {
            const detalhe = await rpcResp.text().catch(() => '');
            erros.push(`${doc?.nome || storagePath} (pág. ${pagina.pagina}): ${detalhe.slice(0, 200)}`);
          }
        }
      }
    } catch (err) {
      console.error('[api/indexar-caso] Falha ao indexar documento:', doc?.nome, err);
      erros.push(`${doc?.nome || storagePath}: ${err.message}`);
    }
  }

  return json({ ok: true, chunks_indexados: totalChunks, erros: erros.length ? erros : undefined }, 200);
}

/**
 * Pede ao Gemini o texto integral de cada página do documento, sem resumir
 * nem comentar — é extração, não análise. `responseMimeType: application/json`
 * garante um JSON estruturado e fácil de parsear.
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
              'considere cada página física do arquivo como uma unidade. Responda APENAS com um JSON no formato ' +
              '{"paginas":[{"pagina":1,"texto":"..."}]}.',
          },
          { inline_data: { mime_type: mime, data: base64 } },
        ],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  });

  const resp = await fetch(
    `${GEMINI}/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo },
  );
  if (!resp.ok) {
    throw new Error(`Falha na extração de texto (HTTP ${resp.status}).`);
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

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
