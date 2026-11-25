// api/_pecas-extras.js
//
// Peças montadas em CÓDIGO sobre o modelo genérico (templates/pecas/Peca_generica.docx, gerado por
// scripts/templates-pecas/modelo_generico.py): o timbre, a qualificação, o fecho e a assinatura vêm do modelo da
// advogada; o corpo (seções, parágrafos, citações) vem daqui. Cada peça é uma função pura que recebe os dados do caso
// e devolve { titulo_peca, verbo_peca, enderecamento, referencia_processo, qualificacao_parte, subtitulo_peca, secoes }.
//
// Texto jurídico destas peças: MINUTAS redigidas pelo sistema, pendentes da revisão da advogada responsável (ver
// templates/pecas/REVISAO_JURIDICA.md). O que depende do caso e o sistema não sabe vira [PREENCHER] ou [CONFIRMAR].
// Sem travessão no texto (regra J01).
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

import { contextoBase, preencher } from './_contexto-peca.js';

export const TEMPLATE_GENERICO = 'Peca_generica';
export const confirmar = (texto) => `[CONFIRMAR: ${texto}]`;

/**
 * Um parágrafo do modelo genérico a partir de texto com **negrito**.
 * @returns {{ citacao: boolean, trechos: Array<{ x: string, n: boolean }> }}
 */
export function par(texto, { citacao = false } = {}) {
  const trechos = [];
  const partes = String(texto ?? '').split(/(\*\*[^*]+\*\*)/);
  for (const p of partes) {
    if (!p) continue;
    const negrito = /^\*\*[^*]+\*\*$/.test(p);
    trechos.push({ x: negrito ? p.slice(2, -2) : p, n: negrito });
  }
  return { citacao, trechos: trechos.length ? trechos : [{ x: '', n: false }] };
}

export const cit = (texto) => par(texto, { citacao: true });

/** Uma seção: título, subtítulo (opcional) e parágrafos (strings viram parágrafos de corpo). */
export function secao(titulo, paragrafos, subtitulo = '') {
  return {
    titulo,
    subtitulo,
    paragrafos: paragrafos.filter(Boolean).map((p) => (typeof p === 'string' ? par(p) : p)),
  };
}

/** Pedidos numerados por letra: a), b), c)... */
export function pedidos(lista, abertura = 'Isto posto, requer a Vossa Excelência:') {
  const LETRAS = 'abcdefghijklmnopqrstuvwxyz';
  return secao('DOS PEDIDOS', [abertura, ...lista.filter(Boolean).map((p, i) => `${LETRAS[i]}) ${p}`)]);
}

export function execucaoAjuizada(dados) {
  const p = dados?.processo_execucao || {};
  return Boolean(String(p.numero || '').trim() || String(p.data_ajuizamento?.data || '').trim());
}

export function listaCdas(dados) {
  const cdas = (dados?.inscricoes || []).map((i) => i?.numero_cda).filter(Boolean);
  if (cdas.length === 0) return preencher('número(s) da(s) CDA(s)');
  return cdas.length === 1 ? cdas[0] : `${cdas.slice(0, -1).join(', ')} e ${cdas[cdas.length - 1]}`;
}

/**
 * Contexto completo do modelo genérico: a base comum de toda peça (endereçamento, qualificação, fecho, advogados) e a
 * peça montada em código.
 */
export function contextoGenerico({ dados, escritorio = {}, agora = new Date(), perfil = {}, peca }) {
  const base = contextoBase({ dados, escritorio, agora, perfil });
  const ajuizada = execucaoAjuizada(dados);
  return {
    ...base,
    // a parte que assina a peça: em regra o executado; na exceção do sócio redirecionado, o sócio
    executado_nome: peca.parte_nome || base.executado_nome,
    enderecamento: peca.enderecamento || (ajuizada ? base.juizo : base.destinatario_pgfn),
    referencia_processo:
      peca.referencia_processo || (ajuizada ? `Execução Fiscal n.º ${base.processo_numero}` : `Inscrição(ões) em Dívida Ativa n.º ${listaCdas(dados)}`),
    qualificacao_parte: peca.qualificacao_parte || 'já devidamente qualificado(a) nos autos em epígrafe',
    verbo_peca: peca.verbo_peca || 'apresentar a presente',
    titulo_peca: peca.titulo_peca,
    subtitulo_peca: peca.subtitulo_peca ?? 'pelos fatos e fundamentos a seguir expostos.',
    secoes: peca.secoes,
  };
}

/** Datas DD/MM/AAAA -> Date UTC (null se inválida). */
export function parseBR(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) ? d : null;
}

export function formatarBR(d) {
  return d ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : '';
}
