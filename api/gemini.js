// api/gemini.js
//
// Proxy seguro para a API do Google Gemini.
//
// - Edge Runtime + streaming (SSE): a resposta chega em pedaços, mantendo a
//   conexão viva; evita o 504 da Vercel em respostas longas de IA.
// - A API key só existe aqui, no servidor (header x-goog-api-key).
// - System instruction "Motor TributÁgil" injetada em toda requisição.
// - Documentos do usuário entram como `inline_data` (o Gemini faz OCR nativo).
// - Sem `tools`: o modelo NÃO tem Google Search nem acesso externo — fica
//   restrito ao conteúdo dos anexos.

import { MOTOR_TRIBUTAGIL } from './_motor-tributagil.js';

export const config = { runtime: 'edge' };

// Modelo padrão: pinado num ID que sabemos existir. Para "sempre o Flash mais
// barato do momento", defina GEMINI_MODEL=gemini-flash-lite-latest na Vercel.
const MODELO_PADRAO = 'gemini-2.5-flash-lite';
const THINKING_BUDGET_PADRAO = 512; // "pouco espaço para delírio"; 0 desliga
const TIMEOUT_MS = 55_000;
const MAX_DOCS = 12;
const MAX_BYTES_INLINE_TOTAL = 14 * 1024 * 1024; // teto prático do inline_data

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido. Use POST.' }, 405);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: 'GEMINI_API_KEY não configurada nas Environment Variables da Vercel.' }, 500);
  }

  // ---- 1. Validação de entrada ---------------------------------------------
  let prompt;
  let documentos;
  try {
    const body = await req.json();
    prompt = body?.prompt;
    documentos = Array.isArray(body?.documentos) ? body.documentos : [];
  } catch {
    return json({ error: 'Corpo da requisição inválido — envie um JSON.' }, 400);
  }
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return json({ error: 'O campo "prompt" é obrigatório.' }, 400);
  }
  if (documentos.length > MAX_DOCS) {
    return json({ error: `Máximo de ${MAX_DOCS} documentos por análise.` }, 413);
  }

  // ---- 2. Monta as "parts": texto + cada documento como inline_data -------
  const parts = [{ text: prompt }];
  let bytesInline = 0;
  for (const d of documentos) {
    const b64 = typeof d?.data_base64 === 'string' ? d.data_base64.trim() : '';
    const mime = typeof d?.mime_type === 'string' ? d.mime_type : '';
    if (!b64 || !mime) continue;

    bytesInline += Math.floor((b64.length * 3) / 4);
    if (bytesInline > MAX_BYTES_INLINE_TOTAL) {
      return json({ error: 'Documentos excedem o limite total. Reduza a quantidade ou o tamanho.' }, 413);
    }

    if (d.nome) parts.push({ text: `--- Documento anexado: ${String(d.nome).slice(0, 200)} ---` });
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
  }

  const modelo = process.env.GEMINI_MODEL || MODELO_PADRAO;
  const thinkingBudget = Number.parseInt(
    process.env.GEMINI_THINKING_BUDGET ?? String(THINKING_BUDGET_PADRAO),
    10,
  );

  // ---- 3. Chamada ao Gemini com timeout controlado -----------------------
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: MOTOR_TRIBUTAGIL }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.1, // máxima aderência às instruções
            responseMimeType: 'application/json', // força JSON válido na saída
            ...(Number.isFinite(thinkingBudget)
              ? { thinkingConfig: { thinkingBudget } }
              : {}),
          },
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

    // ---- 4. Repassa o stream SSE do Google direto ao cliente -------------
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const abortado = err?.name === 'AbortError';
    console.error('[api/gemini] Erro:', err);
    return json(
      { error: abortado ? 'Tempo limite excedido ao aguardar a IA.' : 'Erro ao conectar com a IA.' },
      abortado ? 504 : 502,
    );
  } finally {
    clearTimeout(timer);
  }
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
