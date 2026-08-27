// api/gemini.js
//
// Proxy seguro para o Google Gemini — arquitetura "Storage + Files API":
//
//   navegador ──(upload direto)──> Supabase Storage
//   navegador ──(paths + token)──> ESTA FUNÇÃO
//   ESTA FUNÇÃO ──(baixa via RLS)──> Storage
//   ESTA FUNÇÃO ──(sobe)──> Gemini Files API ──> file_uri
//   ESTA FUNÇÃO ──(stream SSE)──> navegador
//
// Assim os documentos (que podem ter dezenas de MB / centenas de páginas)
// nunca passam pelo corpo de uma request de Function.
//
// Runtime: Node (não Edge) — precisa de mais tempo/memória para a cadeia
// download → upload → geração. maxDuration configurado em vercel.json.
//
// Segredo: apenas GEMINI_API_KEY (server-side). A URL e a anon key do Supabase
// são públicas (já estão no bundle) e chegam no corpo da request; o token do
// usuário garante, via RLS, que só a pasta dele é lida.

import { MOTOR_TRIBUTAGIL } from './_motor-tributagil.js';

const GEMINI = 'https://generativelanguage.googleapis.com';
const MODELO_PADRAO = 'gemini-2.5-flash-lite';
const THINKING_BUDGET_PADRAO = 512;
const TIMEOUT_GERACAO_MS = 280_000;
const MAX_DOCS = 20;
const MAX_BYTES_POR_DOC = 30 * 1024 * 1024;
const MAX_BYTES_TOTAL = 50 * 1024 * 1024;
const BUCKET = 'documentos';
const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;

// A credencial do Gemini pode chegar em dois formatos:
//   - API key clássica "AIzaSy..."  -> vai em ?key= na URL
//   - Token novo / OAuth "AQ..." / "ya29..." -> vai em Authorization: Bearer
// (os endpoints do generativelanguage não aceitam os dois de forma intercambiável.)
function gAuth(apiKey) {
  if (/^AIza/.test(apiKey)) {
    return { qs: `key=${encodeURIComponent(apiKey)}`, headers: {} };
  }
  return { qs: '', headers: { Authorization: `Bearer ${apiKey}` } };
}
const withQs = (url, qs) => (qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url);

// IMPORTANTE: no runtime Node da Vercel, o `export default` só funciona com a
// assinatura `(req, res)`. Para receber um `Request` e devolver um `Response`
// (com streaming), é preciso exportar um método HTTP nomeado — `POST` aqui.
export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: 'GEMINI_API_KEY não configurada nas Environment Variables da Vercel.' }, 500);
  }
  const auth = gAuth(apiKey);

  // ---- 1. Entrada -------------------------------------------------------------
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido — envie um JSON.' }, 400);
  }

  const { prompt, supabaseUrl, supabaseAnonKey, userToken } = body || {};
  const documentos = Array.isArray(body?.documentos) ? body.documentos : [];

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return json({ error: 'O campo "prompt" é obrigatório.' }, 400);
  }
  if (!SUPABASE_URL_RE.test(String(supabaseUrl || ''))) {
    return json({ error: 'supabaseUrl inválida.' }, 400);
  }
  if (!supabaseAnonKey || !userToken) {
    return json({ error: 'Credenciais de acesso ao Storage ausentes.' }, 400);
  }
  if (documentos.length > MAX_DOCS) {
    return json({ error: `Máximo de ${MAX_DOCS} documentos por análise.` }, 413);
  }

  // ---- 2. Baixa cada doc do Storage e sobe para a Files API do Gemini -------
  const parts = [{ text: prompt }];
  let bytesTotal = 0;

  try {
    for (const d of documentos) {
      const storagePath = String(d?.storage_path || '').replace(/^\/+/, '');
      if (!storagePath) continue;

      const objetoUrl =
        `${supabaseUrl}/storage/v1/object/${BUCKET}/` +
        storagePath.split('/').map(encodeURIComponent).join('/');

      const arqResp = await fetch(objetoUrl, {
        headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` },
      });
      if (!arqResp.ok) {
        return json(
          { error: `Não foi possível ler um documento no Storage (HTTP ${arqResp.status}).` },
          502,
        );
      }

      const buffer = await arqResp.arrayBuffer();
      if (buffer.byteLength > MAX_BYTES_POR_DOC) {
        return json({ error: `Um documento excede ${mb(MAX_BYTES_POR_DOC)} MB.` }, 413);
      }
      bytesTotal += buffer.byteLength;
      if (bytesTotal > MAX_BYTES_TOTAL) {
        return json({ error: `Total de documentos excede ${mb(MAX_BYTES_TOTAL)} MB.` }, 413);
      }

      const mime = d?.mime_type || arqResp.headers.get('content-type') || 'application/octet-stream';
      const fileUri = await subirParaGeminiFiles(auth, buffer, mime, d?.nome);

      if (d?.nome) parts.push({ text: `--- Documento anexado: ${String(d.nome).slice(0, 200)} ---` });
      parts.push({ file_data: { mime_type: mime, file_uri: fileUri } });
    }
  } catch (err) {
    console.error('[api/gemini] Preparação de documentos falhou:', err);
    return json({ error: err.message || 'Falha ao preparar os documentos para a IA.' }, 502);
  }

  // ---- 3. Geração (streaming) ----------------------------------------------
  const modelo = process.env.GEMINI_MODEL || MODELO_PADRAO;
  const thinkingBudget = Number.parseInt(
    process.env.GEMINI_THINKING_BUDGET ?? String(THINKING_BUDGET_PADRAO),
    10,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_GERACAO_MS);

  try {
    const upstream = await fetch(
      withQs(`${GEMINI}/v1beta/models/${modelo}:streamGenerateContent?alt=sse`, auth.qs),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth.headers },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: MOTOR_TRIBUTAGIL }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            ...(Number.isFinite(thinkingBudget) ? { thinkingConfig: { thinkingBudget } } : {}),
          },
          // Sem `tools`: nada de Google Search / acesso externo.
        }),
      },
    );

    if (!upstream.ok || !upstream.body) {
      const detalhe = await upstream.text().catch(() => '');
      return json(
        { error: `Falha na API do Gemini (HTTP ${upstream.status}).`, detalhe: detalhe.slice(0, 600) },
        502,
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err) {
    const abortado = err?.name === 'AbortError';
    console.error('[api/gemini] Erro na geração:', err);
    return json(
      { error: abortado ? 'Tempo limite excedido ao aguardar a IA.' : 'Erro ao conectar com a IA.' },
      abortado ? 504 : 502,
    );
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Files API do Gemini — protocolo "resumable" (2 passos), com a chave em ?key=
// (o endpoint /upload NÃO aceita o header x-goog-api-key → responde 401).
// ---------------------------------------------------------------------------
async function subirParaGeminiFiles(auth, arrayBuffer, mimeType, displayName) {
  const numBytes = arrayBuffer.byteLength;

  // Passo 1 — inicia o upload e recebe a URL de destino.
  const start = await fetch(withQs(`${GEMINI}/upload/v1beta/files`, auth.qs), {
    method: 'POST',
    headers: {
      ...auth.headers,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(numBytes),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: asciiSafe(displayName || 'documento') } }),
  });
  if (!start.ok) {
    const t = await start.text().catch(() => '');
    throw new Error(`Files API (início) falhou (HTTP ${start.status}). ${t.slice(0, 200)}`);
  }
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Files API não retornou a URL de upload.');

  // Passo 2 — envia os bytes e finaliza.
  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: arrayBuffer,
  });
  if (!up.ok) {
    const t = await up.text().catch(() => '');
    throw new Error(`Files API (upload) falhou (HTTP ${up.status}). ${t.slice(0, 200)}`);
  }

  const data = await up.json().catch(() => ({}));
  let file = data.file || data;

  // PDFs/imagens costumam já vir ACTIVE; se estiver PROCESSING, aguarda.
  let tentativas = 0;
  while (file?.state === 'PROCESSING' && file?.name && tentativas < 12) {
    await sleep(1500);
    const chk = await fetch(withQs(`${GEMINI}/v1beta/${file.name}`, auth.qs), {
      headers: { ...auth.headers },
    });
    file = await chk.json().catch(() => file);
    tentativas += 1;
  }

  if (!file?.uri || (file.state && file.state !== 'ACTIVE')) {
    throw new Error(`Documento não ficou pronto na Files API (state=${file?.state || 'desconhecido'}).`);
  }
  return file.uri;
}

function asciiSafe(s) {
  return String(s).replace(/[^\x20-\x7E]/g, '_').slice(0, 120);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
