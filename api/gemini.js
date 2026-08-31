// api/gemini.js
//
// Proxy seguro para o Google Gemini — em DUAS chamadas (extração + raciocínio).
//
//   navegador ──(upload direto)──> Supabase Storage
//   navegador ──(paths + token)──> ESTA FUNÇÃO
//   ESTA FUNÇÃO ──(baixa via RLS)──> Storage
//   ESTA FUNÇÃO ──(inline_data)──> Gemini [FASE 1: extração, sem streaming]
//   ESTA FUNÇÃO ──(tabela extraída como texto)──> Gemini [FASE 2: raciocínio, streamed]
//   ESTA FUNÇÃO ──(stream SSE, formato idêntico ao de antes)──> navegador
//
// POR QUE DUAS CHAMADAS: uma única chamada que extrai TUDO dos documentos E
// aplica os módulos de decadência/prescrição ao mesmo tempo sobrecarrega a
// tarefa. Testado com o mesmo processo real rodado várias vezes já com
// temperatura 0 + responseSchema + regra de enumeração: uma execução devolveu
// ZERO pagamentos — a categoria de fato que decide a maior parte do valor da
// causa. Prompt-only bateu no teto.
//
// A fase de extração (api/_schema-extracao.js) só lista o que está escrito —
// zero julgamento jurídico. A fase de raciocínio (_motor-tributagil.js +
// _schema-parecer.js, ambos inalterados por esta mudança) recebe essa tabela
// como TEXTO, não mais os documentos brutos: raciocina sobre uma base fixa,
// em vez de garimpar datas e aplicar direito ao mesmo tempo. Isso não zera a
// variação (nenhuma chamada a um LLM é determinística, nem a temperatura 0),
// mas separa a variação de EXTRAÇÃO (que muda os fatos — perigosa) da
// variação de ênfase na fase de raciocínio (tolerável).
//
// O formato que chega ao navegador não muda: a fase 2 ainda é
// streamGenerateContent com o mesmo ESQUEMA_PARECER de antes, encaminhado
// como SSE bruto igual sempre foi. O frontend não precisou mudar.
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
// Runtime: Node. `maxDuration` configurado em vercel.json (300s, dividido
// entre as duas fases — ver TIMEOUT_EXTRACAO_MS / TIMEOUT_RACIOCINIO_MS).

import { MOTOR_TRIBUTAGIL } from './_motor-tributagil.js';
import { rateLimit, ipDoRequest } from './_ratelimit.js';
import { ESQUEMA_PARECER } from './_schema-parecer.js';
import { ESQUEMA_EXTRACAO, PROMPT_EXTRACAO } from './_schema-extracao.js';

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
// Orçamento de tempo dividido entre as duas fases, dentro do teto de 300s da
// function (vercel.json). 130s+130s=260s deixa ~40s de folga para
// download/auth/créditos, que rodam ANTES deste timer começar.
const TIMEOUT_EXTRACAO_MS = 130_000;
const TIMEOUT_GERACAO_MS = 130_000;
const MAX_DOCS = 20;
// Abaixo disso, com documentos de verdade anexados, a extração falhou — ver
// validarExtracao(). Não é um número mágico: é o piso do próprio
// ESQUEMA_EXTRACAO (minItems), mantido igual aqui para a mensagem de erro
// citar o mesmo número que o esquema exige.
const EXTRACAO_MIN_EVENTOS = 4;
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
  const docParts = [];
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
      if (d?.nome) docParts.push({ text: `--- Documento anexado: ${String(d.nome).slice(0, 200)} ---` });
      docParts.push({
        inline_data: { mime_type: mime, data: Buffer.from(buffer).toString('base64') },
      });
    }
  } catch (err) {
    console.error('[api/gemini] Preparação de documentos falhou:', err);
    return json({ error: err.message || 'Falha ao preparar os documentos para a IA.' }, 502);
  }

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

  const temperaturaFinal = Number.isFinite(temperatura) ? temperatura : TEMPERATURA_PADRAO;

  // ---- 3. FASE 1 — extração (sem streaming) ---------------------------------
  // Lista todo evento datado dos documentos, sem julgamento jurídico. Ver
  // cabeçalho do arquivo e api/_schema-extracao.js para o porquê.
  let extracao;
  try {
    const corpoExtracao = JSON.stringify({
      systemInstruction: { parts: [{ text: PROMPT_EXTRACAO }] },
      contents: [{ role: 'user', parts: [{ text: 'Extraia todos os eventos datados dos documentos anexados abaixo.' }, ...docParts] }],
      generationConfig: {
        temperature: temperaturaFinal,
        responseMimeType: 'application/json',
        responseSchema: ESQUEMA_EXTRACAO,
        ...(thinkingConfig ? { thinkingConfig } : {}),
      },
    });
    const urlExtracao = `${GEMINI}/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const controllerExtracao = new AbortController();
    const timerExtracao = setTimeout(() => controllerExtracao.abort(), TIMEOUT_EXTRACAO_MS);
    let respostaExtracao;
    try {
      respostaExtracao = await fetchComRetry(urlExtracao, corpoExtracao, controllerExtracao.signal);
    } finally {
      clearTimeout(timerExtracao);
    }
    if (respostaExtracao.erro) return respostaExtracao.erro;

    const corpo = await respostaExtracao.resp.json();
    const textoJson = corpo?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    extracao = JSON.parse(textoJson);
  } catch (err) {
    const abortado = err?.name === 'AbortError';
    console.error('[api/gemini] Falha na fase de extração:', err);
    return json(
      { error: abortado ? 'Tempo limite excedido ao ler os documentos.' : 'Não foi possível ler os documentos anexados.' },
      abortado ? 504 : 502,
    );
  }

  // A fase de extração pode sinalizar documento ilegível sem travar tudo —
  // mas se sobrar praticamente nada extraído com documentos de verdade
  // anexados, é mais seguro travar aqui do que deixar a fase 2 raciocinar
  // sobre uma tabela vazia e produzir um parecer com base fática inexistente.
  const eventos = Array.isArray(extracao?.eventos) ? extracao.eventos : [];
  if (docParts.length > 0 && eventos.length < EXTRACAO_MIN_EVENTOS) {
    console.error('[api/gemini] Extração insuficiente:', eventos.length, 'eventos —', extracao?.alerta_ilegivel || '(sem alerta)');
    return json(
      {
        error:
          extracao?.alerta_ilegivel ||
          'A extração dos documentos não encontrou dados suficientes para a análise. Verifique se os arquivos estão legíveis e tente novamente.',
      },
      422,
    );
  }

  // ---- 4. FASE 2 — raciocínio jurídico (streaming) --------------------------
  // Recebe a tabela extraída como TEXTO — não mais os documentos brutos. O
  // motor (_motor-tributagil.js) e o esquema de saída (_schema-parecer.js)
  // são exatamente os de antes desta mudança, com UM ajuste dinâmico abaixo.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_GERACAO_MS);

  // A extração (fase 1) já fez a curadoria de "o que é um evento" — a fase 2
  // não deveria voltar a filtrar isso. Mas nada além do texto do prompt
  // impedia essa segunda seleção: numa bateria de teste real, uma execução
  // (com a tabela extraída já COMPLETA, 4 CDAs, 4 pagamentos, os 2 grupos de
  // SISPAR) devolveu um parecer de 3 páginas que agregou pagamentos de
  // inscrições diferentes num item só e resumiu "as demais CDAs" — o mesmo
  // padrão de omissão de antes, só que agora na composição da saída, não na
  // leitura dos documentos.
  //
  // TENTATIVA REVERTIDA: cheguei a elevar dinamicamente o `minItems` de
  // "fatos_importantes" no responseSchema desta chamada para o número real
  // de eventos extraídos. Em produção isso passou a devolver HTTP 400
  // "Request contains an invalid argument" do Gemini em toda análise — logo
  // após esse deploy, com timestamps que batem exatamente com o commit que
  // introduziu essa mutação (a versão anterior, sem ela, tinha acabado de
  // funcionar). Reveretido para não deixar a função inteira fora do ar por
  // uma otimização não comprovada contra a API real. O piso continua fixo
  // (ver _schema-parecer.js); o reforço abaixo, em texto no prompt, é a
  // mitigação que sobra por enquanto — sem risco de quebrar o formato da
  // requisição, porque é só prosa.
  const esquemaParecerDaChamada = ESQUEMA_PARECER;

  const corpoGemini = JSON.stringify({
    systemInstruction: { parts: [{ text: MOTOR_TRIBUTAGIL }] },
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        {
          text:
            '\n\n[TABELA DE FATOS JÁ EXTRAÍDA — FONTE DE VERDADE DESTA ANÁLISE]\n' +
            'Você NÃO tem acesso aos documentos originais nesta etapa. A extração abaixo já foi ' +
            `feita, com instrução de listar TODO evento sem seleção de relevância — são ${eventos.length} ` +
            'eventos. Aplique os módulos jurídicos exclusivamente sobre esta tabela; não presuma nem ' +
            'infira eventos que não constem dela.\n' +
            'IMPORTANTE sobre "fatos_importantes": a curadoria de relevância JÁ FOI FEITA nesta tabela — ' +
            'sua tarefa aqui é MAPEAR, não FILTRAR. Gere um item em "fatos_importantes" para CADA evento ' +
            'da tabela, na mesma granularidade (nunca agregue "Inscrições X e Y" num item só, nunca ' +
            'resuma "as demais CDAs" ou "os pagamentos subsequentes" — cada evento da tabela vira um ' +
            'item próprio). Você pode desdobrar um evento em mais de um fato quando a análise jurídica ' +
            'exigir, mas nunca devolver menos itens do que eventos existem na tabela.\n' +
            JSON.stringify(extracao),
        },
      ],
    }],
    generationConfig: {
      temperature: temperaturaFinal,
      responseMimeType: 'application/json',
      // Sem esquema, `application/json` garantia JSON válido mas não a FORMA:
      // o mesmo processo devolvia 4, 5 ou 6 fatos, com CDAs em uma execução e
      // ausentes na seguinte. Ver api/_schema-parecer.js. O piso de
      // "fatos_importantes" desta chamada é dinâmico — ver acima.
      responseSchema: esquemaParecerDaChamada,
      ...(thinkingConfig ? { thinkingConfig } : {}),
    },
    // Sem `tools`: nada de Google Search / acesso externo.
  });

  const urlGemini = `${GEMINI}/v1beta/models/${modelo}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  try {
    const { resp: upstream, erro } = await fetchComRetry(urlGemini, corpoGemini, controller.signal);
    if (erro) return erro;

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

// Retry só para erros transitórios: 429 (rate limit do free tier), 503 ("high
// demand"), 500. Backoff: 2s, 5s. Compartilhado pelas duas fases — a única
// diferença entre elas é a URL (generateContent x streamGenerateContent) e o
// corpo, ambos montados por quem chama.
async function fetchComRetry(url, body, signal) {
  const ESPERAS_MS = [2000, 5000];
  for (let tentativa = 0; ; tentativa++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body,
    });

    if (resp.ok && resp.body) return { resp };

    const transitorio = [429, 500, 503].includes(resp.status);
    if (!transitorio || tentativa >= ESPERAS_MS.length) {
      const detalhe = await resp.text().catch(() => '');
      console.error('[api/gemini] Gemini respondeu erro', resp.status, detalhe.slice(0, 600));
      const msg =
        resp.status === 429
          ? 'A IA está temporariamente sobrecarregada (limite de uso). Aguarde cerca de 1 minuto e tente de novo.'
          : `Falha na API do Gemini (HTTP ${resp.status}).`;
      return { erro: json({ error: msg }, resp.status === 429 ? 429 : 502) };
    }

    console.warn(`[api/gemini] HTTP ${resp.status} — retry ${tentativa + 1}/${ESPERAS_MS.length}`);
    await new Promise((r) => setTimeout(r, ESPERAS_MS[tentativa]));
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
