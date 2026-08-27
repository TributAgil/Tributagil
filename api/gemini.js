// api/gemini.js
//
// Proxy seguro para a API do Google Gemini.
//
// Por que Edge Runtime + streaming?
//   - No runtime Node "clássico" da Vercel, o plano Hobby derruba a função em ~10s
//     (504). Respostas de IA longas estouram esse limite com facilidade.
//   - O Edge Runtime não tem esse teto rígido e, como devolvemos a resposta em
//     STREAM (SSE), a conexão fica "viva" enviando bytes continuamente — a Vercel
//     não a considera travada e não a encerra.
//   - A API key nunca chega ao browser: ela só existe aqui, no servidor.

export const config = { runtime: 'edge' };

const MODELO_PADRAO = 'gemini-2.5-flash';
const TIMEOUT_MS = 55_000; // margem de segurança antes de qualquer teto da plataforma

export default async function handler(req) {
  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido. Use POST.' }, 405);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(
      { error: 'GEMINI_API_KEY não configurada nas Environment Variables da Vercel.' },
      500,
    );
  }

  // ---- 1. Validação de entrada -------------------------------------------------
  let prompt;
  try {
    const body = await req.json();
    prompt = body?.prompt;
  } catch {
    return json({ error: 'Corpo da requisição inválido — envie um JSON.' }, 400);
  }
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return json({ error: 'O campo "prompt" é obrigatório.' }, 400);
  }

  // ---- 2. Chamada ao Gemini com timeout controlado ---------------------------
  const modelo = process.env.GEMINI_MODEL || MODELO_PADRAO;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // A chave vai no header (recomendação atual do Google e obrigatório na
          // prática para as novas keys `AQ.…`). Nunca na URL — evita vazamento em log.
          'x-goog-api-key': apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2, // precisão jurídica > criatividade
            responseMimeType: 'text/plain',
          },
        }),
      },
    );

    if (!upstream.ok || !upstream.body) {
      const detalhe = await upstream.text().catch(() => '');
      return json(
        {
          error: `Falha na API do Gemini (HTTP ${upstream.status}).`,
          detalhe: detalhe.slice(0, 500),
        },
        502,
      );
    }

    // ---- 3. Repassa o stream SSE do Google direto ao cliente -----------------
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
