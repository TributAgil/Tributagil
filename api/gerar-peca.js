// api/gerar-peca.js
//
// Gera a PEÇA PROCESSUAL editável (.docx real) a partir de uma análise já feita.
//
//   navegador ──(analise_id + token)──> ESTA FUNÇÃO
//   ESTA FUNÇÃO ──(lê análise/escritório/documentos, sob RLS)──> Supabase
//   ESTA FUNÇÃO ──(documentos + schema de fatos)──> Gemini   [UMA chamada, temperatura 0]
//   ESTA FUNÇÃO ──(fatos)──> motor determinístico (api/_motor-peca.js)
//   ESTA FUNÇÃO ──(contexto)──> template .docx (api/_render-peca.js)
//   ESTA FUNÇÃO ──(resumo + arquivo)──> navegador
//
// PRINCÍPIO CENTRAL (o mesmo do resto do sistema): a IA extrai FATOS tipados
// com fonte; o CÓDIGO soma prazos, compara datas, decide se a peça pode ser
// gerada e escolhe o modelo. Nada de "prescrito/decaído" ou de escolha de
// template vem de texto livre do modelo.
//
// POR QUE UMA EXTRAÇÃO NOVA (e não o `resultado` da análise): a extração da
// fase 1 não é persistida, e o parecer salvo não liga fato a inscrição nem
// registra tipo de declaração, data de entrega ou pagamento antecipado — ver
// api/_schema-dados-peca.js. Avaliei persistir a extração da fase 1 numa
// coluna nova (analises.extracao) e NÃO fiz: mexeria no streaming de
// api/gemini.js, e mesmo persistida ela não traria esses campos — a chamada
// nova continua necessária. Detalhes no README.
//
// UMA chamada devolve resumo E arquivo (em vez de "prévia" + "gerar"): a
// extração é a parte que custa IA, então separar os dois passos dobraria o
// custo ou exigiria cache em banco. O navegador mostra o resumo e só então
// oferece o download.
//
// Autenticação: token do usuário (Authorization: Bearer ... ou `userToken` no
// corpo, igual a api/gemini.js) validado no Supabase Auth; leitura de análise,
// escritório e Storage SEMPRE sob RLS com o token do usuário — nunca service
// role. Runtime: Node.

import { rateLimit, ipDoRequest } from './_ratelimit.js';
import { ESQUEMA_DADOS_PECA, PROMPT_DADOS_PECA } from './_schema-dados-peca.js';
import { normalizarDadosPeca } from './_dados-peca.js';
import { avaliarPecas } from './_motor-peca.js';
import { montarContexto, nomeArquivoPeca } from './_contexto-peca.js';
import { renderizarPeca, contarMarcadores } from './_render-peca.js';
import { dimensoesImagem, tamanhoLogoCm } from './_imagem.js';
import { creditosParaGerarPeca } from './_politica-peca.js';

const GEMINI = 'https://generativelanguage.googleapis.com';
const SUPABASE_URL_ENV = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_ENV = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BUCKET_DOCUMENTOS = 'documentos';
const BUCKET_LOGOS = 'logos';
const MAX_BYTES_TOTAL = 12 * 1024 * 1024; // mesmo teto de api/gemini.js
const MAX_BYTES_LOGO = 1024 * 1024;
const MAX_DOCS = 20;
const TIMEOUT_EXTRACAO_MS = 200_000;
const RL_LIMITE = 6;
const RL_JANELA_MS = 60_000;

const MODELO_PADRAO = 'gemini-3.5-flash'; // GEMINI_MODEL

export const AVISO_FIXO = 'Minuta gerada automaticamente. Revisão do advogado responsável é obrigatória antes do protocolo.';

const NOME_TESE = { prescricao_ordinaria: 'Prescrição ordinária', decadencia: 'Decadência', prescricao_intercorrente: 'Prescrição intercorrente' };
const NOME_MODELO = {
  EPE_prescricao_ordinaria: 'Exceção de Pré-Executividade — prescrição ordinária',
  EPE_decadencia: 'Exceção de Pré-Executividade — decadência',
  Revisao_PGFN_prescricao_ordinaria: 'Pedido de Revisão de Débito Fiscal (PGFN) — prescrição ordinária',
  Revisao_PGFN_decadencia: 'Pedido de Revisão de Débito Fiscal — decadência',
  EPE_prescricao_intercorrente: 'Exceção de Pré-Executividade — prescrição intercorrente',
};

export async function POST(request) {
  const inicio = Date.now();
  const ctx = {};
  let resposta;
  try {
    resposta = await processar(request, ctx);
    return resposta;
  } finally {
    // Uma linha JSON por requisição (mesmo padrão de api/gemini.js).
    console.log(JSON.stringify({
      evento: 'api_gerar_peca',
      usuarioId: ctx.usuarioId || null,
      analiseId: ctx.analiseId || null,
      fase: ctx.fase || null,
      statusPeca: ctx.statusPeca || null,
      template: ctx.template || null,
      tokens: ctx.tokens ?? null,
      httpStatus: resposta?.status ?? null,
      duracaoMs: Date.now() - inicio,
    }));
  }
}

async function processar(request, ctx) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'GEMINI_API_KEY não configurada nas Environment Variables da Vercel.' }, 500);

  ctx.fase = 'rate_limit';
  const rl = await rateLimit(`gerar-peca:${ipDoRequest(request)}`, RL_LIMITE, RL_JANELA_MS);
  if (!rl.ok) {
    return json({ error: 'Muitas gerações em sequência. Aguarde um minuto e tente de novo.' }, 429,
      { 'Retry-After': String(Math.ceil((rl.retryMs || RL_JANELA_MS) / 1000)) });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido — envie um JSON.' }, 400);
  }

  const supabaseUrl = SUPABASE_URL_ENV;
  const supabaseAnonKey = SUPABASE_ANON_ENV;
  if (!SUPABASE_URL_RE.test(supabaseUrl) || !supabaseAnonKey) {
    console.error('[api/gerar-peca] SUPABASE_URL/SUPABASE_ANON_KEY ausentes ou inválidas.');
    return json({ error: 'Configuração do servidor ausente. Contate o suporte.' }, 500);
  }

  const cabecalho = request.headers.get('authorization') || '';
  const userToken = (cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : '') || body?.userToken || '';
  if (!userToken) return json({ error: 'Sessão ausente. Faça login novamente.' }, 401);

  const analiseId = String(body?.analise_id || '');
  if (!UUID_RE.test(analiseId)) return json({ error: 'Informe a análise (analise_id).' }, 400);
  ctx.analiseId = analiseId;

  // ---- Autenticação ---------------------------------------------------------
  ctx.fase = 'autenticacao';
  try {
    const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` },
    });
    if (!authResp.ok) return json({ error: 'Sessão inválida ou expirada. Faça login novamente.' }, 401);
    ctx.usuarioId = (await authResp.json().catch(() => ({})))?.id || null;
  } catch (err) {
    console.error('[api/gerar-peca] Falha ao validar sessão:', err);
    return json({ error: 'Não foi possível validar sua sessão.' }, 502);
  }

  // ---- Política de créditos (centralizada em _politica-peca.js) --------------
  if (creditosParaGerarPeca() > 0) {
    return json({ error: 'Cobrança de peça ainda não implementada.' }, 501);
  }

  const cabecalhosRls = { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` };

  // ---- Análise (RLS: só enxerga as próprias) ----------------------------------
  ctx.fase = 'leitura_analise';
  let analise;
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/analises?id=eq.${encodeURIComponent(analiseId)}&select=id,caso_id,payload,resultado&limit=1`,
      { headers: cabecalhosRls },
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    analise = (await resp.json())?.[0];
  } catch (err) {
    console.error('[api/gerar-peca] Falha ao ler a análise:', err);
    return json({ error: 'Não foi possível carregar a análise.' }, 502);
  }
  if (!analise) return json({ error: 'Análise não encontrada.' }, 404);

  const documentos = (Array.isArray(analise.payload?.documentos) ? analise.payload.documentos : [])
    .filter((d) => d?.storage_path);
  if (documentos.length === 0) return json({ error: 'Esta análise não tem documentos para gerar a peça.' }, 422);
  if (documentos.length > MAX_DOCS) return json({ error: `Máximo de ${MAX_DOCS} documentos.` }, 413);

  // ---- Cadastro do escritório (ausente => campos [PREENCHER], nunca bloqueia) ----
  ctx.fase = 'leitura_escritorio';
  let escritorio = {};
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/escritorios?select=*&limit=1`, { headers: cabecalhosRls });
    if (resp.ok) escritorio = (await resp.json())?.[0] || {};
  } catch (err) {
    console.warn('[api/gerar-peca] Cadastro do escritório indisponível (segue sem ele):', err?.message);
  }

  // ---- Documentos do Storage (RLS) ---------------------------------------------
  ctx.fase = 'download_storage';
  const partes = [];
  let bytesTotal = 0;
  try {
    for (const d of documentos) {
      const caminho = String(d.storage_path).replace(/^\/+/, '');
      const resp = await fetch(
        `${supabaseUrl}/storage/v1/object/${BUCKET_DOCUMENTOS}/${caminho.split('/').map(encodeURIComponent).join('/')}`,
        { headers: cabecalhosRls },
      );
      if (resp.status === 404 || resp.status === 400) {
        return json({ error: 'Os documentos desta análise não estão mais disponíveis. Refaça a análise com os arquivos.' }, 410);
      }
      if (!resp.ok) return json({ error: `Não foi possível ler um documento no Storage (HTTP ${resp.status}).` }, 502);
      const buffer = await resp.arrayBuffer();
      bytesTotal += buffer.byteLength;
      if (bytesTotal > MAX_BYTES_TOTAL) return json({ error: 'Os documentos excedem o limite de tamanho.' }, 413);
      if (d.nome) partes.push({ text: `--- Documento anexado: ${String(d.nome).slice(0, 200)} ---` });
      partes.push({ inline_data: { mime_type: d.mime_type || resp.headers.get('content-type') || 'application/octet-stream', data: Buffer.from(buffer).toString('base64') } });
    }
  } catch (err) {
    console.error('[api/gerar-peca] Preparação de documentos falhou:', err);
    return json({ error: 'Falha ao preparar os documentos.' }, 502);
  }

  // ---- Extração de fatos (Gemini, schema, temperatura 0) -------------------------
  ctx.fase = 'extracao';
  let dados;
  try {
    const bruto = await extrairDados({ apiKey, partes, ctx });
    dados = normalizarDadosPeca(bruto);
  } catch (err) {
    const abortado = err?.name === 'AbortError';
    console.error('[api/gerar-peca] Falha na extração:', err);
    return json({ error: abortado ? 'Tempo limite excedido ao ler os documentos.' : 'Não foi possível ler os documentos para a peça.' }, abortado ? 504 : 502);
  }
  if (dados.alerta_ilegivel) return json({ error: dados.alerta_ilegivel }, 422);
  if (dados.inscricoes.length === 0) return json({ error: 'Não foram encontradas inscrições (CDAs) nos documentos.' }, 422);

  // ---- Motor determinístico: UMA avaliação por tese ----------------------------------------
  // Os modelos não são fundidos: o caso pode comportar mais de uma peça (ex.: decadência de alguns
  // períodos + prescrição intercorrente da execução) e quem escolhe é o usuário, no modal.
  ctx.fase = 'motor';
  const { pecas: avaliacoes } = avaliarPecas({ dados, conclusoesParecer: analise.resultado?.conclusoes, agora: new Date() });
  ctx.statusPeca = statusGeral(avaliacoes);
  ctx.template = avaliacoes.filter((a) => a.template).map((a) => a.template).join(',') || null;

  for (const a of avaliacoes) {
    if (a.divergencias.length > 0) {
      // Mesmo espírito de validarParecerPosGeracao (api/gemini.js): divergência entre dois
      // cálculos independentes é sinal de bug ou de leitura ruim — loga para investigação.
      console.error('[api/gerar-peca] DIVERGÊNCIA motor da peça x parecer salvo', { analiseId, tese: a.tese, divergencias: a.divergencias });
    }
  }

  const geraveis = avaliacoes.filter((a) => a.status === 'ok');
  if (geraveis.length === 0) {
    const naoOk = avaliacoes.length ? avaliacoes : [];
    return json({
      status: ctx.statusPeca,
      mensagem: naoOk.find((a) => a.mensagem)?.mensagem || MSG_NENHUMA_TESE,
      bloqueios: naoOk.flatMap((a) => a.bloqueios),
      divergencias: naoOk.flatMap((a) => a.divergencias),
      avisos: naoOk.flatMap((a) => a.avisos),
      pecas: naoOk.map(resumoSemArquivo),
    }, 200);
  }

  // ---- Logo (opcional; falha aqui nunca derruba a peça) -------------------------------
  const avisosLogo = [];
  let logo = null;
  if (escritorio.logo_path) {
    try {
      const resp = await fetch(
        `${supabaseUrl}/storage/v1/object/${BUCKET_LOGOS}/${String(escritorio.logo_path).split('/').map(encodeURIComponent).join('/')}`,
        { headers: cabecalhosRls },
      );
      const buffer = resp.ok ? Buffer.from(await resp.arrayBuffer()) : null;
      const dim = buffer && buffer.length <= MAX_BYTES_LOGO ? dimensoesImagem(buffer) : null;
      if (dim) logo = { data: buffer, extension: dim.extension, ...tamanhoLogoCm(dim) };
      else avisosLogo.push('Não foi possível usar o logo do escritório (arquivo ausente, grande demais ou formato não suportado). A peça saiu sem logo.');
    } catch (err) {
      console.warn('[api/gerar-peca] Logo indisponível:', err?.message);
      avisosLogo.push('Não foi possível carregar o logo do escritório. A peça saiu sem logo.');
    }
  }

  // ---- Renderização (uma por peça gerável) ----------------------------------------------------
  ctx.fase = 'renderizacao';
  const agora = new Date();
  const dadosEscritorio = {
    nome: escritorio.nome,
    cidade: escritorio.cidade,
    uf: escritorio.uf,
    email: escritorio.email,
    site: escritorio.site,
    endereco: escritorio.endereco,
    advogados: escritorio.advogados,
  };

  const pecas = [];
  for (const avaliacao of avaliacoes) {
    if (avaliacao.status !== 'ok') {
      pecas.push(resumoSemArquivo(avaliacao));
      continue;
    }
    const contexto = montarContexto({
      dados,
      avaliacao,
      escritorio: dadosEscritorio,
      agora,
      incluirBlocoDecretoLei: body?.incluir_bloco_decreto_lei !== false,
    });
    let docx;
    try {
      docx = await renderizarPeca({ template: avaliacao.template, contexto, logo });
    } catch (err) {
      console.error('[api/gerar-peca] Falha ao renderizar o template:', avaliacao.template, err);
      return json({ error: 'Não foi possível montar o documento da peça.' }, 500);
    }
    const marcadores = await contarMarcadores(docx);
    pecas.push({
      ...resumoSemArquivo(avaliacao),
      resumo: {
        modelo: NOME_MODELO[avaliacao.template] || avaliacao.template,
        tese: NOME_TESE[avaliacao.tese] || avaliacao.tese,
        descricao: descreverPeca(avaliacao),
        creditos: creditosDoResumo(avaliacao),
        intercorrente: avaliacao.intercorrente
          ? {
              data_intimacao: avaliacao.intercorrente.dataIntimacao,
              data_fim_suspensao: avaliacao.intercorrente.dataFimSuspensao,
              data_prazo_final: avaliacao.intercorrente.dataPrazoFinal,
              cdas: avaliacao.intercorrente.cdasCobertas,
            }
          : null,
        data_referencia: avaliacao.dataReferencia,
        campos_preencher: marcadores.preencher,
        figuras: marcadores.figuras,
        a_confirmar: marcadores.confirmar,
        avisos: [...avaliacao.avisos, ...avisosLogo],
        aviso_fixo: AVISO_FIXO,
      },
      arquivo: {
        nome: nomeArquivoPeca(avaliacao.template, dados.executado.nome, agora),
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        base64: docx.toString('base64'),
      },
    });
  }

  return json({ status: 'ok', pecas }, 200);
}

const MSG_NENHUMA_TESE = 'Os documentos não indicam prescrição, decadência ou prescrição intercorrente consumada.';

/** 'ok' se alguma peça pode ser gerada; senão o "pior" motivo (bloqueada > indisponível > sem tese). */
function statusGeral(avaliacoes) {
  if (avaliacoes.some((a) => a.status === 'ok')) return 'ok';
  if (avaliacoes.some((a) => a.status === 'bloqueada')) return 'bloqueada';
  if (avaliacoes.some((a) => a.status === 'indisponivel')) return 'indisponivel';
  return 'sem_tese';
}

/** Cabeçalho comum de uma peça na resposta (sem o arquivo): quem é, em que estado está e por quê. */
function resumoSemArquivo(a) {
  return {
    tese: a.tese,
    tese_nome: NOME_TESE[a.tese] || a.tese,
    status: a.status,
    template: a.template,
    mensagem: a.mensagem,
    bloqueios: a.bloqueios,
    divergencias: a.divergencias,
    avisos: a.avisos,
  };
}

const dataBR = (d) =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

function creditosDoResumo(a) {
  if (a.tese === 'prescricao_intercorrente') {
    const ic = a.intercorrente;
    return (ic?.cdasCobertas?.length ? ic.cdasCobertas : ['']).map((cda) => ({
      cda,
      periodo: '',
      termo_inicial: ic?.dataFimSuspensao || '',
      consumacao: ic?.dataPrazoFinal || '',
    }));
  }
  return a.creditos.map((c) => ({
    cda: c.cda,
    periodo: c.periodo,
    termo_inicial: c.termoInicial ? dataBR(c.termoInicial) : dataBR(c.marcoInicial),
    consumacao: c.consumacao ? dataBR(c.consumacao) : dataBR(c.termoFinal),
  }));
}

/** Uma linha para o usuário escolher entre as peças: o que a peça alega e sobre o quê. */
function descreverPeca(a) {
  if (a.tese === 'prescricao_intercorrente') {
    const ic = a.intercorrente;
    return `Prescrição intercorrente consumada em ${ic?.dataPrazoFinal || '—'} (ciência da não localização em ${ic?.dataIntimacao || '—'}); CDA(s): ${(ic?.cdasCobertas || []).join(', ') || '—'}.`;
  }
  const periodos = [...new Set(a.creditos.map((c) => c.periodo).filter(Boolean))].join(', ') || '—';
  const cdas = [...new Set(a.creditos.map((c) => c.cda).filter(Boolean))].join(', ') || '—';
  const parcial = a.tese === 'decadencia' && a.decadenciaParcial ? ' (parcial: há períodos ainda dentro do prazo)' : '';
  return `${NOME_TESE[a.tese]} — período(s) ${periodos}; CDA(s) ${cdas}${parcial}.`;
}

function configuracaoThinking() {
  const nivel = (process.env.GEMINI_THINKING_LEVEL || 'high').toLowerCase();
  const orcamento = Number.parseInt(process.env.GEMINI_THINKING_BUDGET ?? '', 10);
  if (['off', 'none', 'disabled', 'false'].includes(nivel)) return undefined;
  if (nivel === 'budget' && Number.isFinite(orcamento)) return orcamento > 0 ? { thinkingBudget: orcamento } : undefined;
  return { thinkingLevel: nivel };
}

async function extrairDados({ apiKey, partes, ctx }) {
  const modelo = process.env.GEMINI_MODEL || MODELO_PADRAO;
  const thinking = configuracaoThinking();
  const corpo = JSON.stringify({
    systemInstruction: { parts: [{ text: PROMPT_DADOS_PECA }] },
    contents: [{ role: 'user', parts: [{ text: 'Extraia os dados dos documentos anexados abaixo.' }, ...partes] }],
    generationConfig: {
      temperature: 0, // fatos não podem variar entre execuções do mesmo processo
      responseMimeType: 'application/json',
      responseSchema: ESQUEMA_DADOS_PECA,
      ...(thinking ? { thinkingConfig: thinking } : {}),
    },
  });
  const url = `${GEMINI}/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_EXTRACAO_MS);
  try {
    let ultimo;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, signal: controller.signal });
      if (resp.ok) {
        const json = await resp.json();
        ctx.tokens = json?.usageMetadata?.totalTokenCount ?? null;
        const texto = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
        return JSON.parse(texto);
      }
      ultimo = resp.status;
      // só tenta de novo em erro transitório (limite de taxa / indisponibilidade)
      if (![429, 500, 502, 503].includes(resp.status)) break;
      await new Promise((r) => setTimeout(r, 1500 * (tentativa + 1)));
    }
    throw new Error(`Gemini respondeu HTTP ${ultimo}`);
  } finally {
    clearTimeout(timer);
  }
}

function json(data, status, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}
