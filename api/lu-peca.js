// api/lu-peca.js
//
// "Pedir ao Lu" dentro do editor da peça: o advogado seleciona UM parágrafo e pede uma de três ações.
//   reescrever   — reescreve o trecho conforme a instrução (mais incisivo, mais conciso…), sem mudar fato nem tese;
//   fundamentar  — reforça o trecho com artigo, súmula ou tema da base CURADA (api/_legislacao-tributagil.js), citados
//                  exatamente; nada de jurisprudência de memória;
//   preencher    — preenche os campos "[PREENCHER: …]" do trecho com o que a ANÁLISE já extraiu (parecer salvo);
//                  o que não estiver lá continua como [PREENCHER], e o Lu diz que não encontrou.
//
// A resposta NUNCA é aplicada aqui: volta como proposta, e o advogado aceita ou recusa no editor.
//
// O QUE VAI PARA A IA (e o que não vai): o parágrafo, o título do tópico, o resumo da peça (CDAs, períodos, datas) e,
// conforme a ação, a base de legislação ou o parecer salvo da análise. NENHUM PDF: o custo fica em centavos.
//
// Negrito no texto: **assim**. Elementos fixos do Word (nota de rodapé, campo automático) chegam como ⟦n⟧ e precisam
// voltar no mesmo lugar (o cliente confere: src/lib/edicaoTexto.js).
//
// Acesso: login do usuário (Bearer), análise lida sob RLS com o token dele, limite de pedidos por usuário, e o ponto
// único api/_chatbot-acesso.js (uso 'peca'). Runtime: Node.

import { rateLimit, ipDoRequest } from './_ratelimit.js';
import { chatbotLiberadoParaPerfil } from './_chatbot-acesso.js';
import { chamarGemini, ErroGemini } from './_gemini-resiliente.js';
import { LEGISLACAO_TRIBUTAGIL } from './_legislacao-tributagil.js';

const GEMINI = 'https://generativelanguage.googleapis.com';
const MODELO_PADRAO = 'gemini-3.5-flash'; // GEMINI_MODEL
const TIMEOUT_MS = 50_000;
const SUPABASE_URL_ENV = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_ENV = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACOES = new Set(['reescrever', 'fundamentar', 'preencher']);
const MAX_PARAGRAFO = 6000;
const MAX_INSTRUCAO = 500;
const MAX_RESUMO = 8000;
// por usuário: folgado para um advogado trabalhando, barra repetição automática
const RL_IP = { limite: 40, janela: 60_000 };
const RL_USUARIO = { limite: 20, janela: 60_000 };

export const ESQUEMA_RESPOSTA_LU = {
  type: 'OBJECT',
  propertyOrdering: ['encontrou', 'texto', 'explicacao', 'fontes'],
  required: ['encontrou', 'texto', 'explicacao', 'fontes'],
  properties: {
    encontrou: {
      type: 'BOOLEAN',
      description: 'false quando a ação não pôde ser feita com o contexto dado (ex.: o dado do [PREENCHER] não está na análise).',
    },
    texto: { type: 'STRING', description: 'O parágrafo inteiro, já com a mudança. Igual ao original quando encontrou = false.' },
    explicacao: { type: 'STRING', description: 'Uma ou duas frases para o advogado: o que mudou e por quê, ou o que não foi encontrado.' },
    fontes: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Cada fonte usada: "[norma] [identificador]" da base, ou "[documento]" do parecer. Vazio se nenhuma.',
    },
  },
};

const REGRAS_COMUNS = `Você é Lu, assistente do advogado tributarista no TributÁgil. Você recebe UM parágrafo de uma peça processual (exceção de pré-executividade ou pedido de revisão de débito) e devolve o parágrafo inteiro, alterado só no que foi pedido.

REGRAS INEGOCIÁVEIS:
1. Não invente fato, data, valor, número de CDA, de processo ou de documento. Use só o que está no contexto desta mensagem.
2. Não mude a tese nem o pedido do parágrafo. Linguagem jurídica formal, em português do Brasil.
3. Não escreva travessão nem meia-risca (— ou –) no texto que você redigir: use vírgula, dois-pontos ou ponto. Os que já estão dentro dos marcadores entre colchetes ficam como estão.
4. Preserve, exatamente e no mesmo lugar, os marcadores ⟦n⟧ (são notas de rodapé e campos do Word) e qualquer "[PREENCHER: …]", "[CONFIRMAR …]" ou "[INSERIR FIGURA …]" que você não tenha sido mandado preencher.
5. Negrito é marcado com **duas estrelas**. Mantenha os negritos do original que continuarem fazendo sentido; não crie outra formatação.
6. Responda só no JSON pedido.`;

const POR_ACAO = {
  reescrever: `AÇÃO: REESCREVER. Reescreva o parágrafo seguindo a instrução do advogado (se não houver instrução, deixe-o mais claro e direto). Não acrescente fundamento legal novo e não tire nenhum que já esteja lá. "fontes" fica vazio.`,
  fundamentar: `AÇÃO: FUNDAMENTAR. Reforce o parágrafo com o fundamento legal ou jurisprudencial mais pertinente da BASE DE LEGISLAÇÃO abaixo, citando exatamente o identificador (ex.: "art. 174 do CTN", "Súmula 436 do STJ", "Tema 980/STJ"). Use SOMENTE a base abaixo: nada de memória. Se nada da base for pertinente, devolva o texto original com encontrou = false. Liste em "fontes" cada item usado no formato "[norma] [identificador]".`,
  preencher: `AÇÃO: PREENCHER. Substitua cada "[PREENCHER: …]" do parágrafo pelo dado correspondente, SE ele estiver no PARECER DA ANÁLISE ou no RESUMO DA PEÇA abaixo. O que não estiver lá continua exatamente como "[PREENCHER: …]". Número de documento anexo ("Doc. nº") quase nunca está na análise: nesse caso mantenha o marcador. encontrou = true só se pelo menos um campo foi preenchido. Em "fontes", o documento de onde veio cada dado (campo "fonte" do parecer) ou "resumo da peça".`,
};

function textoDaBase() {
  return LEGISLACAO_TRIBUTAGIL.map((l) => `[${l.norma} ${l.identificador}]\n${l.texto_integral}`).join('\n\n');
}

/** O parecer salvo, enxuto: só o que serve para preencher campo (partes, processo, marcos com fonte). */
function parecerEnxuto(resultado) {
  if (!resultado || typeof resultado !== 'object') return {};
  return {
    metadata: resultado.metadata || {},
    fatos_importantes: (resultado.fatos_importantes || []).map((f) => ({ data: f.data, descricao: f.descricao, fonte: f.fonte })),
    conclusoes: (resultado.conclusoes || []).map((c) => ({ tipo: c.tipo, titulo: c.titulo, resumo: c.resumo, fundamento_legal: c.fundamento_legal })),
  };
}

export function montarPedido({ acao, paragrafo, topico, instrucao, resumoPeca, resultado }) {
  const partes = [
    POR_ACAO[acao],
    `TÓPICO DA PEÇA: ${topico || '(sem título)'}`,
    `RESUMO DA PEÇA (CDAs, períodos e datas calculados pelo sistema):\n${JSON.stringify(resumoPeca || {})}`,
  ];
  if (acao === 'fundamentar') partes.push(`BASE DE LEGISLAÇÃO (única fonte permitida):\n${textoDaBase()}`);
  if (acao === 'preencher') partes.push(`PARECER DA ANÁLISE:\n${JSON.stringify(parecerEnxuto(resultado))}`);
  if (instrucao) partes.push(`INSTRUÇÃO DO ADVOGADO: ${instrucao}`);
  partes.push(`PARÁGRAFO:\n${paragrafo}`);
  return partes.join('\n\n');
}

/** Regra J01 (sem travessão no texto do sistema), garantida em código mesmo se o modelo escapar. */
export function semTravessao(texto) {
  return String(texto || '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,\s*,/g, ',');
}

const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const GENERICAS = new Set(['lei', 'de', 'do', 'da', 'stj', 'stf', 'recurso', 'repetitivo', 'repercussao', 'geral', 'vinculante']);
// cada item da base: o identificador sem o parêntese ("REsp 1.340.553/RS") e as palavras que distinguem a norma
// ("ctn", "lef", "830", "cf"…). Súmula, REsp e RE já se identificam pelo próprio número.
const BASE_NORMALIZADA = LEGISLACAO_TRIBUTAGIL.map((l) => {
  const id = normalizar(String(l.identificador).split(' (')[0]);
  const proprio = /^(sumula|resp|re) /.test(id);
  const marcas = proprio ? [] : normalizar(l.norma).split(' ').filter((w) => w.length >= 2 && !GENERICAS.has(w));
  return { id, marcas, rotulo: `${l.norma} ${l.identificador}` };
});

/**
 * Na fundamentação, só fica como fonte o que existe de fato na base curada (o identificador e, quando é artigo, a
 * norma), já no rótulo canônico da base; o que o modelo citar fora dela é descartado.
 */
export function fontesDaBase(fontes) {
  const saida = [];
  for (const f of fontes || []) {
    const n = ` ${normalizar(f)} `;
    const candidatos = BASE_NORMALIZADA.filter((b) => n.includes(` ${b.id} `) && (b.marcas.length === 0 || b.marcas.some((m) => n.includes(` ${m} `))));
    // o mais específico ganha ("art. 173, I" antes de "art. 173")
    const item = candidatos.sort((a, b) => b.id.length - a.id.length)[0];
    if (item && !saida.includes(item.rotulo)) saida.push(item.rotulo);
  }
  return saida;
}

export async function POST(request) {
  const inicio = Date.now();
  const ctx = {};
  let resposta;
  try {
    resposta = await processar(request, ctx);
    return resposta;
  } finally {
    // uma linha JSON por pedido (mesmo padrão de api/gerar-peca.js): dá para medir o custo real no piloto
    console.log(JSON.stringify({
      evento: 'api_lu_peca',
      usuarioId: ctx.usuarioId || null,
      analiseId: ctx.analiseId || null,
      acao: ctx.acao || null,
      fase: ctx.fase || null,
      tokens: ctx.tokens ?? null,
      modelo: ctx.modelo || null,
      httpStatus: resposta?.status ?? null,
      duracaoMs: Date.now() - inicio,
    }));
  }
}

async function processar(request, ctx) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'GEMINI_API_KEY não configurada.' }, 500);

  ctx.fase = 'acesso';
  const acesso = chatbotLiberadoParaPerfil({ uso: 'peca' });
  if (!acesso.liberado) return json({ error: acesso.motivo || 'O Lu não está disponível para o seu plano.' }, 403);

  const rlIp = await rateLimit(`lu-peca-ip:${ipDoRequest(request)}`, RL_IP.limite, RL_IP.janela);
  if (!rlIp.ok) return json({ error: 'Muitos pedidos em sequência. Aguarde um minuto.' }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido.' }, 400);
  }

  const supabaseUrl = SUPABASE_URL_ENV;
  const supabaseAnonKey = SUPABASE_ANON_ENV;
  if (!SUPABASE_URL_RE.test(supabaseUrl) || !supabaseAnonKey) {
    console.error('[api/lu-peca] SUPABASE_URL/SUPABASE_ANON_KEY ausentes ou inválidas.');
    return json({ error: 'Configuração do servidor ausente. Contate o suporte.' }, 500);
  }

  const cabecalho = request.headers.get('authorization') || '';
  const userToken = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : '';
  if (!userToken) return json({ error: 'Sessão ausente. Faça login novamente.' }, 401);

  const analiseId = String(body?.analise_id || '');
  const acao = String(body?.acao || '');
  const paragrafo = String(body?.paragrafo || '');
  const topico = String(body?.topico || '').slice(0, 200);
  const instrucao = String(body?.instrucao || '').trim().slice(0, MAX_INSTRUCAO);
  const resumoPeca = body?.resumo_peca && typeof body.resumo_peca === 'object' ? body.resumo_peca : {};
  ctx.analiseId = analiseId;
  ctx.acao = acao;
  if (!UUID_RE.test(analiseId)) return json({ error: 'Informe a análise (analise_id).' }, 400);
  if (!ACOES.has(acao)) return json({ error: 'Ação inválida.' }, 400);
  if (!paragrafo.trim()) return json({ error: 'Selecione um parágrafo com texto.' }, 400);
  if (paragrafo.length > MAX_PARAGRAFO) return json({ error: 'Parágrafo grande demais para o Lu.' }, 413);
  if (JSON.stringify(resumoPeca).length > MAX_RESUMO) return json({ error: 'Resumo da peça grande demais.' }, 413);
  if (acao === 'preencher' && !/\[PREENCHER:/.test(paragrafo)) return json({ error: 'Este parágrafo não tem campo [PREENCHER] para completar.' }, 400);

  // ---- Autenticação ---------------------------------------------------------------------------------------------------
  ctx.fase = 'autenticacao';
  try {
    const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` } });
    if (!authResp.ok) return json({ error: 'Sessão inválida ou expirada. Faça login novamente.' }, 401);
    ctx.usuarioId = (await authResp.json().catch(() => ({})))?.id || null;
  } catch (err) {
    console.error('[api/lu-peca] Falha ao validar sessão:', err);
    return json({ error: 'Não foi possível validar sua sessão.' }, 502);
  }
  const rlUsuario = await rateLimit(`lu-peca:${ctx.usuarioId}`, RL_USUARIO.limite, RL_USUARIO.janela);
  if (!rlUsuario.ok) return json({ error: 'Muitos pedidos ao Lu em sequência. Aguarde um minuto.' }, 429);

  // ---- Análise (RLS: só a do próprio usuário) ---------------------------------------------------------------------------
  ctx.fase = 'leitura_analise';
  let analise;
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/analises?id=eq.${encodeURIComponent(analiseId)}&select=id,resultado&limit=1`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    analise = (await resp.json())?.[0];
  } catch (err) {
    console.error('[api/lu-peca] Falha ao ler a análise:', err);
    return json({ error: 'Não foi possível carregar a análise.' }, 502);
  }
  if (!analise) return json({ error: 'Análise não encontrada.' }, 404);

  // ---- Lu (Gemini, JSON com schema) -------------------------------------------------------------------------------------
  ctx.fase = 'gemini';
  const modelo = process.env.GEMINI_MODEL || MODELO_PADRAO;
  const corpo = JSON.stringify({
    systemInstruction: { parts: [{ text: REGRAS_COMUNS }] },
    contents: [{ role: 'user', parts: [{ text: montarPedido({ acao, paragrafo, topico, instrucao, resumoPeca, resultado: analise.resultado }) }] }],
    generationConfig: {
      temperature: acao === 'reescrever' ? 0.3 : 0, // fundamento e dado não podem variar; redação pode
      responseMimeType: 'application/json',
      responseSchema: ESQUEMA_RESPOSTA_LU,
    },
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let saida;
  try {
    const montarUrl = (m) => `${GEMINI}/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const { resp, modelo: usado } = await chamarGemini({ montarUrl, corpo, modelo, signal: controller.signal, rotulo: 'lu-peca' });
    ctx.modelo = usado;
    const dados = await resp.json();
    ctx.tokens = dados?.usageMetadata?.totalTokenCount ?? null;
    saida = JSON.parse(dados?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '{}');
  } catch (err) {
    if (err instanceof ErroGemini) {
      return json({ error: err.mensagemUsuario, codigo: err.codigo }, err.statusHttp, err.retryAfterSegundos ? { 'Retry-After': String(err.retryAfterSegundos) } : {});
    }
    const abortado = err?.name === 'AbortError';
    console.error('[api/lu-peca] Falha ao consultar o Lu:', err);
    return json({ error: abortado ? 'O Lu demorou demais para responder. Tente de novo.' : 'Não foi possível consultar o Lu agora.' }, abortado ? 504 : 502);
  } finally {
    clearTimeout(timer);
  }

  const texto = String(saida?.texto || '');
  if (!texto.trim()) return json({ error: 'O Lu não devolveu texto. Tente reformular o pedido.' }, 502);
  const fontes = Array.isArray(saida?.fontes) ? saida.fontes.map(String).slice(0, 12) : [];
  return json({
    encontrou: saida?.encontrou !== false,
    texto,
    explicacao: semTravessao(saida?.explicacao).slice(0, 800),
    fontes: acao === 'fundamentar' ? fontesDaBase(fontes) : fontes,
  }, 200);
}

function json(data, status, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders } });
}
