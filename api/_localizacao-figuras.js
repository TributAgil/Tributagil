// api/_localizacao-figuras.js
//
// Núcleo do assistente de figuras: dado o que cada figura da peça precisa mostrar (lista gerada pelo motor, ver
// `figuras_meta` em api/_contexto-peca.js) e os documentos do caso, pede ao Gemini a PÁGINA e a CAIXA de recorte de cada
// figura, uma chamada por documento, e escolhe o melhor candidato. Separado do endpoint (api/localizar-figuras.js) para o
// mesmo código rodar nos testes com o Gemini de verdade (scripts/casos-ficticios/medir-localizacao-figuras.mjs).
//
// Princípio: a IA PROPÕE, o advogado CONFIRMA. Por isso cada resposta traz `trecho_visto` (o texto que a IA leu dentro
// da caixa) e `dado_confere`, uma conferência feita em CÓDIGO (não pela IA) de que o dado que a figura precisa mostrar
// aparece nesse texto. Figura sem confirmação nunca vai para o Word sem ação do advogado.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

import { chamarGemini } from './_gemini-resiliente.js';

const GEMINI = 'https://generativelanguage.googleapis.com';
const MODELO_PADRAO = 'gemini-3.5-flash'; // GEMINI_MODEL
const TIMEOUT_MS = 120_000;
const CONCORRENCIA = 3;
export const MAX_FIGURAS = 40;

export const ESQUEMA_LOCALIZACAO = {
  type: 'OBJECT',
  properties: {
    figuras: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          numero: { type: 'INTEGER', description: 'Número da figura, exatamente como pedido.' },
          encontrado: { type: 'BOOLEAN', description: 'true somente se ESTE documento contém o trecho que a figura pede.' },
          pagina: { type: 'INTEGER', description: 'Página do documento (a primeira é 1). 0 se não encontrado.' },
          caixa: {
            type: 'ARRAY',
            items: { type: 'INTEGER' },
            minItems: 4,
            maxItems: 4,
            description: 'Caixa de recorte [ymin, xmin, ymax, xmax], inteiros de 0 a 1000 em relação à página (origem no canto superior esquerdo).',
          },
          trecho_visto: { type: 'STRING', description: 'Transcrição literal do texto que aparece DENTRO da caixa. "" se não encontrado.' },
          confianca: { type: 'INTEGER', description: 'De 0 a 100.' },
        },
        required: ['numero', 'encontrado', 'pagina', 'caixa', 'trecho_visto', 'confianca'],
      },
    },
  },
  required: ['figuras'],
};

export const PROMPT_LOCALIZACAO = `Você ajuda um advogado a montar as figuras de uma peça processual. Para cada figura pedida, localize no documento anexado o trecho que a ilustra e informe a página e a caixa de recorte.

REGRAS:
- A caixa cobre SÓ o trecho necessário (a linha ou o bloco que mostra o dado), com uma margem pequena. Nunca a página inteira, salvo se o documento todo for o próprio trecho.
- Coordenadas inteiras de 0 a 1000 em relação à PÁGINA, no formato [ymin, xmin, ymax, xmax], com origem no canto superior esquerdo.
- A primeira página do documento é a 1.
- "trecho_visto" é a transcrição literal do texto que aparece dentro da caixa. O dado indicado em "precisa aparecer" deve estar legível dentro dela.
- Se este documento NÃO contém o que a figura pede, use encontrado=false, pagina=0, caixa=[0,0,0,0] e trecho_visto="". Não invente e não use conhecimento externo.
- Devolva uma entrada para CADA figura pedida, com o número exatamente como informado.`;

const lim = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Descrição de uma figura para o prompt. */
function linhaDaFigura(f) {
  const evid = (f.evidenciar || []).filter((e) => e?.valor).map((e) => `${lim(e.campo, 80)} = ${lim(e.valor, 120)}`).join('; ');
  const ctxto = [f.cda ? `CDA ${lim(f.cda, 40)}` : '', f.periodo ? `período ${lim(f.periodo, 40)}` : ''].filter(Boolean).join(', ');
  return `Figura ${f.numero}: ${lim(f.descricao, 220)}${ctxto ? ` (${ctxto})` : ''}. Precisa aparecer: ${evid || 'o trecho descrito'}.`;
}

export function montarPedido(figuras) {
  return `Localize estas figuras no documento anexado:\n${figuras.map(linhaDaFigura).join('\n')}`;
}

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const soDigitos = (s) => String(s ?? '').replace(/\D+/g, '');
const DATA_RE = /\d{2}\/\d{2}\/\d{4}/g;

/**
 * Conferência em código de que o dado a evidenciar aparece no texto lido dentro da caixa.
 * true / false quando dá para verificar (datas e números); null quando não dá (ex.: "sem eventos").
 * Várias datas (lista) => basta uma delas aparecer: a figura pode mostrar só parte.
 */
export function conferirDado(evidenciar, trechoVisto) {
  const trecho = String(trechoVisto || '');
  if (!trecho.trim()) return false;
  const verificaveis = [];
  for (const e of evidenciar || []) {
    const valor = String(e?.valor || '');
    const datas = valor.match(DATA_RE);
    if (datas) verificaveis.push({ tipo: 'datas', datas });
    else if (soDigitos(valor).length >= 6) verificaveis.push({ tipo: 'numero', digitos: soDigitos(valor) });
  }
  if (verificaveis.length === 0) return null;
  const textoNorm = norm(trecho);
  const textoDigitos = soDigitos(trecho);
  return verificaveis.every((v) => (v.tipo === 'datas' ? v.datas.some((d) => textoNorm.includes(d)) : textoDigitos.includes(v.digitos)));
}

/** Caixa válida ([ymin,xmin,ymax,xmax] em 0..1000, com área) ou null. */
export function normalizarCaixa(caixa) {
  if (!Array.isArray(caixa) || caixa.length !== 4) return null;
  const [a, b, c, d] = caixa.map((x) => Math.max(0, Math.min(1000, Math.round(Number(x)))));
  if (![a, b, c, d].every(Number.isFinite)) return null;
  if (c - a < 5 || d - b < 5) return null;
  return [a, b, c, d];
}

/**
 * Margem de segurança em volta da caixa proposta (unidades de 0..1000 da página). O modelo acerta a LINHA, mas a caixa
 * varia 2 a 3 unidades entre execuções; sem margem, o recorte poderia cortar a ponta de um número. A tela de revisão
 * recorta exatamente o que o servidor devolve, e o advogado ainda pode ajustar.
 */
export const MARGEM_CAIXA = 12;
export function comMargem(caixa, margem = MARGEM_CAIXA) {
  if (!caixa) return null;
  const [a, b, c, d] = caixa;
  return [Math.max(0, a - margem), Math.max(0, b - margem), Math.min(1000, c + margem), Math.min(1000, d + margem)];
}

/** Chave estável para comparar nome de arquivo ("EF.pdf" vs "ef") */
const chaveNome = (s) => norm(s).replace(/\.[a-z0-9]{2,4}$/, '');
export const nomeCombina = (documentoFonte, nomeDoc) => {
  const a = chaveNome(documentoFonte);
  const b = chaveNome(nomeDoc);
  return a.length > 0 && b.length > 0 && (a === b || a.includes(b) || b.includes(a));
};

/**
 * Escolhe, entre os candidatos de todos os documentos, o melhor para a figura:
 * dado conferido > documento que a IA indicou como fonte > confiança.
 */
export function escolherMelhor(figura, candidatos) {
  const validos = candidatos.filter((c) => c.encontrado && c.pagina > 0);
  const nota = (c) =>
    (c.dado_confere === true ? 1000 : c.dado_confere === null ? 500 : 0) +
    (nomeCombina(figura.documento_fonte, c.documento_nome) ? 200 : 0) +
    c.confianca;
  validos.sort((x, y) => nota(y) - nota(x));
  const melhor = validos[0];
  if (!melhor) {
    return { numero: figura.numero, encontrado: false, documento_nome: '', storage_path: '', pagina: 0, caixa: null, trecho_visto: '', confianca: 0, dado_confere: false, outros_candidatos: 0 };
  }
  return { ...melhor, outros_candidatos: validos.length - 1 };
}

async function perguntarAoDocumento({ apiKey, doc, figuras, ctx }) {
  const modelo = process.env.GEMINI_MODEL || MODELO_PADRAO;
  const nivel = (process.env.GEMINI_THINKING_LEVEL || 'high').toLowerCase();
  const thinking = ['off', 'none', 'disabled', 'false'].includes(nivel) ? undefined : { thinkingLevel: nivel };
  const corpo = JSON.stringify({
    systemInstruction: { parts: [{ text: PROMPT_LOCALIZACAO }] },
    contents: [{
      role: 'user',
      parts: [
        { text: `--- Documento anexado: ${lim(doc.nome, 200)} ---` },
        { inline_data: { mime_type: doc.mime_type, data: doc.base64 } },
        { text: montarPedido(figuras) },
      ],
    }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: ESQUEMA_LOCALIZACAO, ...(thinking ? { thinkingConfig: thinking } : {}) },
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { resp } = await chamarGemini({
      montarUrl: (m) => `${GEMINI}/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`,
      corpo, modelo, signal: controller.signal, rotulo: 'localizar-figuras',
    });
    const json = await resp.json();
    if (ctx) ctx.tokens = (ctx.tokens || 0) + (json?.usageMetadata?.totalTokenCount || 0);
    const texto = json?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const lido = JSON.parse(texto);
    return Array.isArray(lido?.figuras) ? lido.figuras : [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} args
 * @param {string} args.apiKey
 * @param {Array<{nome: string, storage_path?: string, mime_type: string, base64: string}>} args.documentos
 * @param {Array<object>} args.figuras  lista de `figuras` devolvida pela geração da peça
 * @param {object} [args.ctx]           recebe `tokens` (soma)
 * @returns {Promise<Array<object>>} uma entrada por figura, na ordem pedida
 */
export async function localizarFiguras({ apiKey, documentos, figuras, ctx }) {
  const porNumero = new Map(figuras.map((f) => [f.numero, f]));
  // cada documento só recebe as figuras que podem estar nele: as que citam esse arquivo + as sem fonte conhecida
  const tarefas = [];
  for (const doc of documentos) {
    const citam = figuras.filter((f) => f.documento_fonte && nomeCombina(f.documento_fonte, doc.nome));
    const semFonte = figuras.filter((f) => !f.documento_fonte || !documentos.some((d) => nomeCombina(f.documento_fonte, d.nome)));
    const doDoc = [...new Map([...citam, ...semFonte].map((f) => [f.numero, f])).values()];
    if (doDoc.length > 0) tarefas.push({ doc, figuras: doDoc });
  }

  const candidatos = new Map(figuras.map((f) => [f.numero, []]));
  let proximo = 0;
  const trabalhador = async () => {
    for (;;) {
      const i = proximo++;
      if (i >= tarefas.length) return;
      const { doc, figuras: pedidas } = tarefas[i];
      let lidas = [];
      try {
        lidas = await perguntarAoDocumento({ apiKey, doc, figuras: pedidas, ctx });
      } catch (err) {
        // um documento que falha não derruba os outros; se TODOS falharem o chamador percebe (nenhuma figura achada)
        if (err?.name === 'ErroGemini' && ['sobrecarga', 'cota', 'creditos'].includes(err.tipo)) throw err;
        console.error('[localizar-figuras] falha em', doc.nome, err?.message || err);
        continue;
      }
      for (const l of lidas) {
        const fig = porNumero.get(Number(l?.numero));
        if (!fig || !pedidas.includes(fig)) continue;
        const caixa = comMargem(normalizarCaixa(l.caixa));
        // a conferência do dado usa o texto COMPLETO lido na caixa (o dado pode estar no fim de um bloco longo); só o que
        // volta ao navegador é abreviado
        const trechoCompleto = String(l.trecho_visto ?? '');
        const trecho = lim(trechoCompleto, 600);
        candidatos.get(fig.numero).push({
          numero: fig.numero,
          encontrado: Boolean(l.encontrado) && Number(l.pagina) > 0,
          documento_nome: doc.nome,
          storage_path: doc.storage_path || '',
          pagina: Math.max(0, Math.round(Number(l.pagina) || 0)),
          caixa,
          trecho_visto: trecho,
          confianca: Math.max(0, Math.min(100, Math.round(Number(l.confianca) || 0))),
          dado_confere: conferirDado(fig.evidenciar, trechoCompleto),
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, Math.max(1, tarefas.length)) }, trabalhador));
  return figuras.map((f) => escolherMelhor(f, candidatos.get(f.numero) || []));
}
