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
// Autenticação Gemini: `?key=` na URL (funciona tanto para chaves `AIzaSy...`
// quanto para as novas `AQ...` — o header `X-goog-api-key` NÃO funciona com as `AQ.`).
//
// Autenticação DO CHAMADOR: o endpoint valida o JWT do usuário (userToken)
// contra o Supabase Auth ANTES de gastar qualquer chamada ao Gemini. Sem isso o
// endpoint seria um proxy de IA aberto (abuso de custo).
//
// Runtime: Node. `maxDuration` configurado em vercel.json.

import { MOTOR_TRIBUTAGIL } from './_motor-tributagil.js';
import { rateLimit, ipDoRequest } from './_ratelimit.js';
import { ESQUEMA_PARECER } from './_schema-parecer.js';

const GEMINI = 'https://generativelanguage.googleapis.com';

// URL/anon key do Supabase: preferimos o ambiente do servidor; o corpo da
// request é só fallback (são valores públicos, mas não devem ser a fonte da verdade).
const SUPABASE_URL_ENV = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_ENV = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

// Rate limit: 12 análises por minuto por IP (a análise é cara).
const RL_LIMITE = 12;
const RL_JANELA_MS = 60_000;

// Padrões — todos sobrescrevíveis por Environment Variable na Vercel, SEM novo deploy.
// Para ligar o Pro depois de ativar o billing no Google Cloud:
//   GEMINI_MODEL = gemini-3.1-pro-preview
const MODELO_PADRAO = 'gemini-3.5-flash';   // GEMINI_MODEL
// Zero por padrão: perícia não pode variar entre execuções do mesmo processo.
// Ressalva: temperatura 0 reduz muito, mas não elimina a variação — modelos
// de linguagem não são plenamente determinísticos nem a zero.
const TEMPERATURA_PADRAO = 0;               // GEMINI_TEMPERATURE
const THINKING_LEVEL_PADRAO = 'high';       // GEMINI_THINKING_LEVEL: 'high' | 'low' | 'off'
const TIMEOUT_GERACAO_MS = 280_000;
const MAX_DOCS = 20;
// Tabelado em 12 MB — igual ao teto do frontend (prepararDocumentos.js) e ao
// de api/indexar-caso.js, pela mesma limitação de espaço/tempo de
// processamento da IA. Mantendo os três alinhados, o backend não rejeita
// (HTTP 413) um arquivo que a própria tela já deveria ter barrado no upload.
const MAX_BYTES_POR_DOC = 12 * 1024 * 1024;
const MAX_BYTES_TOTAL = 12 * 1024 * 1024;
const BUCKET = 'documentos';
const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;

// No runtime Node da Vercel o `export default` só aceita `(req, res)`.
// Um método HTTP nomeado recebe `Request` e devolve `Response` (com streaming).
export async function POST(request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: 'GEMINI_API_KEY não configurada nas Environment Variables da Vercel.' }, 500);
  }

  // ---- 0. Rate limit por IP -------------------------------------------------
  const rl = rateLimit(`gemini:${ipDoRequest(request)}`, RL_LIMITE, RL_JANELA_MS);
  if (!rl.ok) {
    return json(
      { error: 'Muitas análises em sequência. Aguarde um minuto e tente de novo.' },
      429,
      { 'Retry-After': String(Math.ceil((rl.retryMs || RL_JANELA_MS) / 1000)) },
    );
  }

  // ---- 1. Entrada -------------------------------------------------------------
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido — envie um JSON.' }, 400);
  }

  const { prompt, userToken } = body || {};
  const documentos = Array.isArray(body?.documentos) ? body.documentos : [];

  // URL/anon key: ambiente do servidor tem prioridade; corpo é só fallback.
  const supabaseUrl = SUPABASE_URL_ENV || String(body?.supabaseUrl || '');
  const supabaseAnonKey = SUPABASE_ANON_ENV || String(body?.supabaseAnonKey || '');

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return json({ error: 'O campo "prompt" é obrigatório.' }, 400);
  }
  if (!SUPABASE_URL_RE.test(supabaseUrl)) {
    return json({ error: 'Configuração do Supabase ausente ou inválida.' }, 500);
  }
  if (!supabaseAnonKey || !userToken) {
    return json({ error: 'Sessão ausente. Faça login novamente.' }, 401);
  }
  if (documentos.length > MAX_DOCS) {
    return json({ error: `Máximo de ${MAX_DOCS} documentos por análise.` }, 413);
  }

  // ---- 1b. AUTENTICAÇÃO: valida o JWT do usuário no Supabase Auth ----------
  // Impede que o endpoint seja usado como proxy de IA anônimo.
  try {
    const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` },
    });
    if (!authResp.ok) {
      return json({ error: 'Sessão inválida ou expirada. Faça login novamente.' }, 401);
    }
  } catch (err) {
    console.error('[api/gemini] Falha ao validar sessão:', err);
    return json({ error: 'Não foi possível validar sua sessão.' }, 502);
  }

  // ---- 1c. CRÉDITOS: consome 1 crédito de análise de forma atômica ---------
  // RPC `consumir_credito` (SECURITY DEFINER, ver README) — decrementa o saldo
  // do usuário chamador (auth.uid() vem do próprio userToken) e falha com
  // "SEM_CREDITOS" se o saldo já estiver zerado. É a barreira REAL contra
  // fraude: o cliente nunca decrementa o próprio saldo, só este backend.
  // Se a migração de créditos ainda não foi aplicada (função/tabela ausente),
  // falha ABERTO (não bloqueia) para não quebrar instalações existentes.
  try {
    const rpcResp = await fetch(`${supabaseUrl}/rest/v1/rpc/consumir_credito`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: '{}',
    });

    if (!rpcResp.ok) {
      if (rpcResp.status === 404) {
        console.warn('[api/gemini] RPC consumir_credito ausente — sistema de créditos ainda não migrado, seguindo sem bloquear.');
      } else {
        const detalhe = await rpcResp.json().catch(() => ({}));
        const msg = String(detalhe?.message || detalhe?.hint || '');
        if (/SEM_CREDITOS/i.test(msg)) {
          return json(
            { error: 'Você não possui créditos disponíveis. Renove seu plano ou adquira créditos avulsos para continuar.' },
            402,
          );
        }
        if (/PERFIL_NAO_ENCONTRADO/i.test(msg)) {
          return json({ error: 'Perfil de créditos não encontrado. Contate o suporte.' }, 402);
        }
        console.error('[api/gemini] Falha ao consumir crédito:', rpcResp.status, msg);
        return json({ error: 'Não foi possível validar seus créditos agora. Tente novamente.' }, 502);
      }
    }
  } catch (err) {
    console.error('[api/gemini] Erro de rede ao consumir crédito:', err);
    return json({ error: 'Não foi possível validar seus créditos agora. Tente novamente.' }, 502);
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

  const temperatura = Number.parseFloat(
    process.env.GEMINI_TEMPERATURE ?? String(TEMPERATURA_PADRAO),
  );

  // "Thinking": os modelos Gemini 3.x usam `thinkingLevel` ('high' | 'low');
  // os 2.5 usam `thinkingBudget` (número). Padrão = nível 'high'.
  //   GEMINI_THINKING_LEVEL = off        -> desliga o thinking
  //   GEMINI_THINKING_LEVEL = budget     + GEMINI_THINKING_BUDGET = 512 -> forma numérica (modelos 2.5)
  const nivelThinking = (process.env.GEMINI_THINKING_LEVEL || THINKING_LEVEL_PADRAO).toLowerCase();
  const budgetNumerico = Number.parseInt(process.env.GEMINI_THINKING_BUDGET ?? '', 10);

  let thinkingConfig;
  if (['off', 'none', 'disabled', 'false'].includes(nivelThinking)) {
    thinkingConfig = undefined;
  } else if (nivelThinking === 'budget' && Number.isFinite(budgetNumerico)) {
    thinkingConfig = budgetNumerico > 0 ? { thinkingBudget: budgetNumerico } : undefined;
  } else {
    thinkingConfig = { thinkingLevel: nivelThinking };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_GERACAO_MS);

  const corpoGemini = JSON.stringify({
    systemInstruction: { parts: [{ text: MOTOR_TRIBUTAGIL }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: Number.isFinite(temperatura) ? temperatura : TEMPERATURA_PADRAO,
      responseMimeType: 'application/json',
      // Sem esquema, `application/json` garantia JSON válido mas não a FORMA:
      // o mesmo processo devolvia 4, 5 ou 6 fatos, com CDAs em uma execução e
      // ausentes na seguinte. Ver api/_schema-parecer.js.
      responseSchema: ESQUEMA_PARECER,
      ...(thinkingConfig ? { thinkingConfig } : {}),
    },
    // Sem `tools`: nada de Google Search / acesso externo.
  });

  const urlGemini = `${GEMINI}/v1beta/models/${modelo}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  try {
    // Retry só para erros transitórios ANTES do stream começar:
    // 429 (rate limit do free tier), 503 ("high demand"), 500.
    // Backoff: 2s, 5s. Depois disso, devolve o erro.
    let upstream;
    const ESPERAS_MS = [2000, 5000];
    for (let tentativa = 0; ; tentativa++) {
      upstream = await fetch(urlGemini, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: corpoGemini,
      });

      if (upstream.ok && upstream.body) break;

      const transitorio = [429, 500, 503].includes(upstream.status);
      if (!transitorio || tentativa >= ESPERAS_MS.length) {
        const detalhe = await upstream.text().catch(() => '');
        console.error('[api/gemini] Gemini respondeu erro', upstream.status, detalhe.slice(0, 600));
        const msg =
          upstream.status === 429
            ? 'A IA está temporariamente sobrecarregada (limite de uso). Aguarde cerca de 1 minuto e tente de novo.'
            : `Falha na API do Gemini (HTTP ${upstream.status}).`;
        return json({ error: msg }, upstream.status === 429 ? 429 : 502);
      }

      console.warn(`[api/gemini] HTTP ${upstream.status} — retry ${tentativa + 1}/${ESPERAS_MS.length}`);
      await new Promise((r) => setTimeout(r, ESPERAS_MS[tentativa]));
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
function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(extraHeaders || {}) },
  });
}
