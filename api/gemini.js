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

import { createHash } from 'node:crypto';
import { MOTOR_TRIBUTAGIL } from './_motor-tributagil.js';
import { rateLimit, ipDoRequest } from './_ratelimit.js';
import { ESQUEMA_PARECER, REGRA_ENUMERACAO } from './_schema-parecer.js';
import { ESQUEMA_EXTRACAO, PROMPT_EXTRACAO } from './_schema-extracao.js';
import { calcularPrescricaoIntercorrente, formatarMotorPrazosParaPrompt, validarConclusoesModulo4 } from './_motor-prazos.js';

const GEMINI = 'https://generativelanguage.googleapis.com';

// URL/anon key do Supabase: SOMENTE do ambiente do servidor — NUNCA aceitos
// do corpo da requisição. Havia um fallback para body.supabaseUrl/
// body.supabaseAnonKey "para quando a env não estivesse setada"; isso permitia
// que um cliente apontasse para o PRÓPRIO projeto Supabase dele, passasse na
// checagem de auth trivialmente (é o projeto dele) e pulasse o consumo de
// crédito (RPC `consumir_credito` ausente lá = fail-open) — abuso de custo e
// de receita reais, não só um proxy de IA aberto. Achado em auditoria.
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
// Piso de eventos abaixo do qual a extração é tratada como degenerada MESMO
// sem `alerta_ilegivel` — não existe processo de execução fiscal real com 0
// ou 1 evento datado, então isso só pode ser falha de leitura silenciosa.
// Antes disto, o gate era `eventos.length < 4` incondicional (calcado no
// minItems do ESQUEMA_EXTRACAO) — rejeitava (com 422, DEPOIS de já cobrar 1
// crédito) um processo simples e legítimo com só 2-3 eventos (ex.: sem
// ajuizamento ainda). O sinal correto de falha de leitura é
// `alerta_ilegivel` (o próprio modelo diz quando não conseguiu ler um
// documento) — esta constante é só a rede de segurança para quando nem isso
// veio preenchido.
const EXTRACAO_EVENTOS_DEGENERADO = 1;
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
//
// Wrapper fino só pra observabilidade: mede a duração total e loga UMA linha
// estruturada (JSON) por requisição, não importa por qual caminho ela saiu —
// sucesso ou qualquer um dos vários `return` de erro espalhados pelo corpo
// real (`processarAnalise`, abaixo). A Vercel já indexa `console.log` de
// JSON nos logs da function, pesquisável por campo (usuarioId, analiseId,
// fase, etc.) — sem precisar de Sentry nem de nenhuma dependência nova pra
// responder "qual usuário/documento causou esse custo".
export async function POST(request) {
  const inicio = Date.now();
  const ctx = {};
  let resposta;
  try {
    resposta = await processarAnalise(request, ctx);
    return resposta;
  } finally {
    console.log(JSON.stringify({
      evento: 'api_gemini',
      usuarioId: ctx.usuarioId || null,
      analiseId: ctx.analiseId || null,
      casoId: ctx.casoId || null,
      numDocumentos: ctx.numDocumentos ?? null,
      bytesTotal: ctx.bytesTotal ?? null,
      fase: ctx.fase || null,
      tokensExtracao: ctx.tokensExtracao ?? null,
      httpStatus: resposta?.status ?? null,
      duracaoMs: Date.now() - inicio,
    }));
  }
}

async function processarAnalise(request, ctx) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: 'GEMINI_API_KEY não configurada nas Environment Variables da Vercel.' }, 500);
  }

  ctx.fase = 'rate_limit';
  // ---- 0. Rate limit por IP -------------------------------------------------
  const rl = await rateLimit(`gemini:${ipDoRequest(request)}`, RL_LIMITE, RL_JANELA_MS);
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

  const { userToken, metadata } = body || {};
  const documentos = Array.isArray(body?.documentos) ? body.documentos : [];
  ctx.numDocumentos = documentos.length;
  ctx.analiseId = metadata?.analise_id || null;
  ctx.casoId = metadata?.caso_id || null;

  // Supabase: só o que o servidor conhece. Ver comentário no topo do arquivo.
  const supabaseUrl = SUPABASE_URL_ENV;
  const supabaseAnonKey = SUPABASE_ANON_ENV;

  if (!SUPABASE_URL_RE.test(supabaseUrl) || !supabaseAnonKey) {
    console.error('[api/gemini] SUPABASE_URL/SUPABASE_ANON_KEY ausentes ou inválidas nas Environment Variables da Vercel.');
    return json({ error: 'Configuração do servidor ausente. Contate o suporte.' }, 500);
  }
  if (!userToken) {
    return json({ error: 'Sessão ausente. Faça login novamente.' }, 401);
  }
  if (documentos.length > MAX_DOCS) {
    return json({ error: `Máximo de ${MAX_DOCS} documentos por análise.` }, 413);
  }

  // ---- 1b. AUTENTICAÇÃO: valida o JWT do usuário no Supabase Auth ----------
  // Impede que o endpoint seja usado como proxy de IA anônimo.
  ctx.fase = 'autenticacao';
  let usuarioId;
  try {
    const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` },
    });
    if (!authResp.ok) {
      return json({ error: 'Sessão inválida ou expirada. Faça login novamente.' }, 401);
    }
    const authUser = await authResp.json().catch(() => ({}));
    usuarioId = authUser?.id;
    ctx.usuarioId = usuarioId || null;
  } catch (err) {
    console.error('[api/gemini] Falha ao validar sessão:', err);
    return json({ error: 'Não foi possível validar sua sessão.' }, 502);
  }

  // ---- 1c2. IDEMPOTÊNCIA: impede cobrar 2 créditos pela MESMA submissão ----
  // Chave = hash(usuário + arquivos enviados), calculada aqui no servidor —
  // nunca confiada ao cliente. Cobre tanto duplo-clique (o botão "Analisar"
  // trava por estado do React, que tem uma corrida real: dois cliques antes
  // do primeiro re-render podem passar os dois) quanto reenvio depois de uma
  // queda de rede (usuário não viu a resposta e tenta de novo com os mesmos
  // arquivos). Janela de 5 min — cobre qualquer duplo-clique/retry real sem
  // travar para sempre um reenvio deliberado dos mesmos arquivos depois.
  // Fail-open se a RPC não existir (migração pendente) ou não houver
  // usuarioId (sessão não pôde ser lida) — mesma filosofia do resto do app.
  const chaveIdempotencia =
    usuarioId && documentos.length > 0
      ? `analise:${usuarioId}:${hashDocumentos(documentos)}`
      : null;

  ctx.fase = 'idempotencia';
  if (chaveIdempotencia) {
    try {
      const permitido = await idempotenciaReclamar(supabaseUrl, supabaseAnonKey, userToken, chaveIdempotencia);
      if (permitido === false) {
        return json(
          { error: 'Esta análise já foi enviada há poucos instantes. Aguarde a resposta anterior ou tente novamente em alguns minutos.' },
          409,
        );
      }
    } catch (err) {
      console.warn('[api/gemini] Falha ao checar idempotência (seguindo sem bloquear):', err?.message);
    }
  }

  // ---- 1c. CRÉDITOS: consome 1 crédito de análise de forma atômica ---------
  // RPC `consumir_credito` (SECURITY DEFINER, ver README) — decrementa o saldo
  // do usuário chamador (auth.uid() vem do próprio userToken) e falha com
  // "SEM_CREDITOS" se o saldo já estiver zerado. Cobrança na ENTRADA da
  // requisição (decisão deliberada, ver README seção "Créditos" — não é
  // cobrança pós-sucesso: essa variante foi tentada, corrigia a injustiça de
  // cobrar por falha do sistema, mas abria um vetor de abuso de custo real
  // — extração podia rodar de graça repetidamente sem nunca consumir
  // crédito. Revertido). Uma falha do SISTEMA (não do usuário) é tratada por
  // pedido manual de estorno — ver ModalSolicitarEstorno.jsx /
  // BotaoSinalizarErro.jsx, sempre com aprovação humana do suporte.
  // FAIL-CLOSED, não fail-open: cobrança é a única parte deste sistema onde
  // "nunca quebra" não se aplica — ver comentário dentro de consumirCredito()
  // (o caso de RPC ausente, 404) para o porquê. Rate limit e leitura de
  // saldo pra exibição continuam fail-open de propósito (são coisas
  // diferentes disfarçadas da mesma frase — achado em auditoria externa).
  ctx.fase = 'creditos';
  try {
    const resultadoConsumo = await consumirCredito(supabaseUrl, supabaseAnonKey, userToken);
    if (resultadoConsumo?.erro) {
      // Nada foi cobrado — libera a chave de idempotência pra um reenvio
      // legítimo não ficar preso esperando a janela expirar (ex.: usuário
      // sem crédito, compra mais e tenta de novo com os mesmos arquivos).
      if (chaveIdempotencia) await idempotenciaMarcar(supabaseUrl, supabaseAnonKey, userToken, chaveIdempotencia, 'falhou');
      return resultadoConsumo.erro;
    }
    // Crédito debitado com sucesso — a partir daqui, um reenvio com os
    // mesmos arquivos dentro da janela é bloqueado (é exatamente o que a
    // idempotência existe para evitar: cobrar de novo pela mesma submissão).
    if (chaveIdempotencia) await idempotenciaMarcar(supabaseUrl, supabaseAnonKey, userToken, chaveIdempotencia, 'concluida');
  } catch (err) {
    console.error('[api/gemini] Erro de rede ao consumir crédito:', err);
    if (chaveIdempotencia) await idempotenciaMarcar(supabaseUrl, supabaseAnonKey, userToken, chaveIdempotencia, 'falhou').catch(() => {});
    return json({ error: 'Não foi possível validar seus créditos agora. Tente novamente.' }, 502);
  }

  // ---- 2. Baixa cada doc do Storage e embute como inline_data --------------
  ctx.fase = 'download_storage';
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
      ctx.bytesTotal = bytesTotal;
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
  ctx.fase = 'extracao';
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
    ctx.tokensExtracao = corpo?.usageMetadata?.totalTokenCount ?? null;
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
  // mas travamos aqui quando (a) o próprio modelo sinalizou ilegibilidade
  // (`alerta_ilegivel`, o sinal confiável de falha de leitura) OU (b) a
  // contagem é degenerada (0-1 eventos, incompatível com QUALQUER processo
  // real, mesmo o mais simples). Uma contagem baixa mas plausível (2-3
  // eventos, sem alerta) NÃO bloqueia — é tratada como processo simples
  // legítimo, não como falha de extração. Ver comentário de
  // EXTRACAO_EVENTOS_DEGENERADO acima para o porquê da mudança.
  const eventos = Array.isArray(extracao?.eventos) ? extracao.eventos : [];
  const extracaoDegenerada = docParts.length > 0 && eventos.length <= EXTRACAO_EVENTOS_DEGENERADO;
  if (docParts.length > 0 && (extracao?.alerta_ilegivel || extracaoDegenerada)) {
    console.error('[api/gemini] Extração insuficiente:', eventos.length, 'eventos —', extracao?.alerta_ilegivel || '(sem alerta, contagem degenerada)');
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
  ctx.fase = 'geracao';
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

  // Módulo 4 (Prescrição Intercorrente) calculado deterministicamente em
  // código sobre a tabela extraída — ver api/_motor-prazos.js para o porquê
  // do escopo ser só este módulo. `anexoMotorPrazos` vira parte do prompt
  // (texto), igual à tabela de eventos; `motorPrazos` é reaproveitado depois
  // da geração para a validação pós-geração (não bloqueante, ver abaixo).
  const motorPrazos = calcularPrescricaoIntercorrente(eventos);
  const anexoMotorPrazos = formatarMotorPrazosParaPrompt(motorPrazos);

  // Instrução de formatação da fase 2 — construída INTEIRAMENTE no servidor.
  // Antes vinha do cliente (CerebroTributario.jsx montava e mandava como
  // `prompt` em texto livre): expunha REGRA_ENUMERACAO no bundle público E
  // permitia que qualquer um alterasse as instruções que pilotam o
  // raciocínio jurídico da própria análise, sem o servidor perceber — a
  // requisição continuava "válida" porque só valida token/créditos, não o
  // conteúdo do prompt. Achado em auditoria.
  const promptRaciocinio = `Execute a análise pericial completa conforme suas instruções de sistema (Motor TributÁgil), usando EXCLUSIVAMENTE os documentos anexados nesta mensagem. Não invente dados, não use conhecimento externo e não faça buscas.

Retorne APENAS um objeto JSON com esta estrutura:
{
  "metadata": {
    "processo": "número do processo, se houver",
    "parte_autora": "exequente / Fisco / credor",
    "parte_reu": "executado / contribuinte / devedor",
    "valor_causa": "valor da execução/causa, com R$ e separadores",
    "local": "comarca, vara e/ou tribunal (ex.: '2ª Vara de Execuções Fiscais — Comarca de São Paulo/SP')"
  },
  "conclusoes": [
    { "id": 1, "tipo": "prescricao|decadencia|prescricao_intercorrente|cautela|procedimental", "severidade": "favoravel|atencao|neutro|desfavoravel", "titulo": "...", "resumo": "...", "fundamento_legal": "...", "confianca": 0 a 100 }
  ],
  "fatos_importantes": [
    { "id": 1, "categoria": "cronologica|processual|tributaria", "data": "DD/MM/AAAA", "descricao": "...", "fonte": "nome do documento anexado", "relevancia": "critica|alta|media|baixa" }
  ],
  "raciocinio": [
    { "id": 1, "premissa": "regra jurídica (DIREITO)", "aplicacao": "aplicação ao caso concreto (FATO)", "conclusao_logica": "conclusão / pedido", "referencia": "CTN/LEF/Súmula/REsp" }
  ],
  "recomendacoes": ["ação estratégica 1", "ação estratégica 2"]
}

${REGRA_ENUMERACAO}

Em "metadata", extraia cada campo EXATAMENTE dos documentos anexados. Se algum não constar nos documentos, escreva exatamente "Não identificado" (nunca invente).
Distribua o conteúdo de FATO / DIREITO / CONCLUSÃO-PEDIDO nos campos acima, seguindo o mapeamento das [REGRAS DE SAÍDA — JSON] do Motor TributÁgil. Toda data e todo fato precisa citar em "fonte" o documento anexado de origem.
Neutralidade de resultado: rode os Módulos 2, 3 e 4 até o fim. Se NENHUM prazo foi ultrapassado, ainda assim retorne "conclusoes" com "severidade":"desfavoravel", a frase "Não foi identificada causa de extinção do crédito tributário por decadência ou prescrição até a presente data. O crédito permanece exigível." e o tempo restante até o próximo prazo. Se algum prazo foi ultrapassado, use "severidade":"favoravel" e a frase "O crédito tributário encontra-se inexigível, impondo-se seu imediato cancelamento / extinção da execução fiscal.".
Se faltar qualquer data essencial ou os documentos estiverem ilegíveis, preencha "alerta_dados_insuficientes" com "[ALERTA DE DADOS INSUFICIENTES] Necessário informar a data exata de <dado> para prosseguir." e devolva os demais campos vazios. Caso contrário, "alerta_dados_insuficientes" DEVE ser string vazia ("").

Metadados da requisição: ${JSON.stringify(metadata ?? {})}
${anexoMotorPrazos ? `\n${anexoMotorPrazos}\n` : ''}`;

  const corpoGemini = JSON.stringify({
    systemInstruction: { parts: [{ text: MOTOR_TRIBUTAGIL }] },
    contents: [{
      role: 'user',
      parts: [
        { text: promptRaciocinio },
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

    // Validação pós-geração (Módulo 4): tee() ramifica o stream em duas
    // cópias independentes — uma segue para
    // o navegador SEM NENHUMA alteração (zero latência, zero risco de
    // quebrar a resposta), a outra é consumida aqui em paralelo, só para
    // comparar o parecer final contra o resultado do motor determinístico.
    // Roda "fire and forget": qualquer erro nela fica só em log, nunca
    // afeta a resposta já enviada.
    const [paraCliente, paraValidacao] = upstream.body.tee();
    validarParecerPosGeracao(paraValidacao, { motorPrazos, metadata }).catch((err) => {
      console.error('[api/gemini] Falha na validação pós-geração (não afeta a resposta ao usuário):', err);
    });

    ctx.fase = 'streaming_ao_cliente';
    return new Response(paraCliente, {
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

// ---- Idempotência de submissão --------------------------------------------

// Hash estável da lista de documentos (por storage_path, que já é único por
// upload) — mesmos arquivos, mesma chave, não importa a ordem em que
// chegaram no array.
function hashDocumentos(documentos) {
  const paths = documentos
    .map((d) => String(d?.storage_path || ''))
    .filter(Boolean)
    .sort();
  return createHash('sha256').update(paths.join('|')).digest('hex');
}

async function idempotenciaReclamar(supabaseUrl, supabaseAnonKey, userToken, chave) {
  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/idempotencia_reclamar`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_chave: chave, p_janela_ms: 300_000 }),
  });
  if (!resp.ok) {
    if (resp.status !== 404) console.warn(`[api/gemini] RPC idempotencia_reclamar falhou (HTTP ${resp.status})`);
    return true; // fail-open
  }
  const linhas = await resp.json().catch(() => null);
  const linha = Array.isArray(linhas) ? linhas[0] : linhas;
  return linha ? linha.permitido !== false : true;
}

async function idempotenciaMarcar(supabaseUrl, supabaseAnonKey, userToken, chave, status) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/rpc/idempotencia_marcar`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ p_chave: chave, p_status: status }),
    });
  } catch (err) {
    console.warn('[api/gemini] Falha ao marcar idempotência (não bloqueia):', err?.message);
  }
}

// ---- Créditos: consumo --------------------------------------------------

async function consumirCredito(supabaseUrl, supabaseAnonKey, userToken) {
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

  if (rpcResp.ok) return {};
  if (rpcResp.status === 404) {
    // FAIL-CLOSED deliberado (revertido do fail-open original): a migração
    // de créditos já está aplicada e estável nesta produção — um 404 aqui
    // não é mais "instalação nova sem a migração", é sinal de algo errado
    // (schema fora do ar, incidente do Postgrest). Cobrança é a única parte
    // do sistema onde "nunca quebra" pode significar "serve de graça, sem
    // contabilizar, bem na hora em que o banco já está sob pressão" — pior
    // que recusar e pedir pra tentar de novo. Achado em auditoria externa.
    console.error('[api/gemini] RPC consumir_credito respondeu 404 (função ausente do schema) — recusando por segurança, não seguindo sem bloquear.');
    return { erro: json({ error: 'Não foi possível validar seus créditos agora. Tente novamente em instantes.' }, 503) };
  }

  const detalhe = await rpcResp.json().catch(() => ({}));
  const msg = String(detalhe?.message || detalhe?.hint || '');
  if (/SEM_CREDITOS/i.test(msg)) {
    return {
      erro: json(
        { error: 'Você não possui créditos disponíveis. Renove seu plano ou adquira créditos avulsos para continuar.' },
        402,
      ),
    };
  }
  if (/PERFIL_NAO_ENCONTRADO/i.test(msg)) {
    return { erro: json({ error: 'Perfil de créditos não encontrado. Contate o suporte.' }, 402) };
  }
  console.error('[api/gemini] Falha ao consumir crédito:', rpcResp.status, msg);
  return { erro: json({ error: 'Não foi possível validar seus créditos agora. Tente novamente.' }, 502) };
}

// Validação pós-geração: acumula o texto do stream (mesmo formato SSE de
// streamGenerateContent), faz o parse do parecer final e compara as
// conclusões do Módulo 4 contra o resultado do motor determinístico.
// Só loga — nunca lança para fora do .catch() que a chama. Estorno de
// crédito NÃO é automático (ver README, seção "Créditos") — é sempre
// pedido manual do usuário (ModalSolicitarEstorno.jsx / BotaoSinalizarErro.jsx),
// avaliado pelo suporte, então esta função não toca em crédito nenhum.
async function validarParecerPosGeracao(stream, { motorPrazos, metadata }) {
  if (!motorPrazos || motorPrazos.length === 0) {
    // Nada a validar, mas o branch do tee() ainda precisa ser drenado —
    // sem isso, esta cópia do stream nunca é liberada.
    await stream.cancel().catch(() => {});
    return;
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let bruto = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bruto += decoder.decode(value, { stream: true });
  }
  bruto += decoder.decode(); // flush final de bytes multibyte pendentes

  let textoJson = '';
  for (const linha of bruto.split('\n')) {
    const l = linha.trim();
    if (!l.startsWith('data:')) continue;
    const payload = l.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const evento = JSON.parse(payload);
      const partes = evento?.candidates?.[0]?.content?.parts || [];
      for (const p of partes) textoJson += p.text || '';
    } catch {
      // Chunk parcial/incompleto — ignora, o acumulado final é o que importa.
    }
  }

  let parecer;
  try {
    parecer = JSON.parse(textoJson);
  } catch (err) {
    console.warn('[api/gemini] Validação pós-geração: não foi possível parsear o parecer final.', err?.message);
    return;
  }

  const divergencias = motorPrazos && motorPrazos.length > 0
    ? validarConclusoesModulo4(motorPrazos, parecer?.conclusoes)
    : [];
  if (divergencias.length > 0) {
    console.error(
      '[api/gemini] DIVERGÊNCIA Módulo 4 (motor determinístico x parecer gerado)',
      // caso_id/analise_id vêm de `metadata`, que é enviado pelo cliente e
      // NUNCA verificado no servidor — só serve para achar o log certo
      // manualmente, nunca como identificador confiável para automação.
      { casoIdDeclaradoPeloCliente: metadata?.caso_id, analiseIdDeclaradoPeloCliente: metadata?.analise_id, divergencias },
    );
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
