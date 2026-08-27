// api/gemini.js
//
// Proxy seguro para o Google Gemini.
//
//   navegador ──(upload direto)──> Supabase Storage
//   navegador ──(paths + token)──> ESTA FUNÇÃO
//   ESTA FUNÇÃO ──(baixa via RLS)──> Storage
//   ESTA FUNÇÃO ──(inline_data + stream SSE)──> navegador
//
// Os arquivos vêm do Storage (não do corpo da request), então não esbarram no
// limite de ~4 MB de uma Function. Eles são embutidos como `inline_data` na
// chamada ao Gemini — o limite passa a ser o da própria API (~20 MB de request).
//
// Autenticação: header `X-goog-api-key` (formato mostrado pelo cURL de início
// rápido do Google, tanto para chaves `AIzaSy...` quanto para as novas `AQ...`).
//
// Runtime: Node. `maxDuration` configurado em vercel.json.

import { MOTOR_TRIBUTAGIL } from './_motor-tributagil.js';

const GEMINI = 'https://generativelanguage.googleapis.com';
const MODELO_PADRAO = 'gemini-2.5-flash-lite';
const THINKING_BUDGET_PADRAO = 512;
const TIMEOUT_GERACAO_MS = 280_000;
const MAX_DOCS = 20;
const MAX_BYTES_POR_DOC = 12 * 1024 * 1024;
const MAX_BYTES_TOTAL = 13 * 1024 * 1024; // base64 ~17 MB de request — abaixo do teto do Gemini
const BUCKET = 'documentos';
const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;

// No runtime Node da Vercel o `export default` só aceita `(req, res)`.
// Um método HTTP nomeado recebe `Request` e devolve `Response` (com streaming).
export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: 'GEMINI_API_KEY não configurada nas Environment Variables da Vercel.' }, 500);
  }

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

  // ---- 2. Baixa cada doc do Storage e embute como inline_data --------------
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
        return json(
          { error: `Total de documentos excede ${mb(MAX_BYTES_TOTAL)} MB. Reduza a quantidade ou o tamanho.` },
          413,
        );
      }

      const mime = d?.mime_type || arqResp.headers.get('content-type') || 'application/octet-stream';
      if (d?.nome) parts.push({ text: `--- Documento anexado: ${String(d.nome).slice(0, 200)} ---` });
      parts.push({
        inline_data: { mime_type: mime, data: Buffer.from(buffer).toString('base64') },
      });
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
      `${GEMINI}/v1beta/models/${modelo}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey,
        },
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

function mb(bytes) {
  return Math.round(bytes / (1024 * 1024));
}
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
