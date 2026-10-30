// src/lib/edicaoTexto.js
//
// Ponte entre a caixa de texto editável da tela (contentEditable) e os "trechos" de src/lib/docxEdicao.js
// ({ texto, negrito, italico, sublinhado }). A tela só conhece três formatações, as mesmas que voltam para o Word.
// Nada aqui chama rede ou IA.

import { acharMarcadores, juntarTrechos, textoDosTrechos, caractereDoObjeto, indiceDoObjeto } from './docxEdicao';

const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ROTULO_DA_ETIQUETA = { 'nota de rodapé': 'nota de rodapé', 'nota de fim': 'nota de fim', imagem: 'imagem', comentário: 'comentário', símbolo: 'símbolo' };

/** Etiqueta fixa no meio do texto (campo, nota de rodapé, imagem em linha): o navegador não deixa editar dentro dela. */
function etiqueta(k, objetos) {
  const o = objetos[k];
  if (o && !o.rotulo) return `<span contenteditable="false" data-obj="${k}" hidden></span>`;
  const rotulo = o ? ROTULO_DA_ETIQUETA[o.rotulo] || o.rotulo : 'elemento';
  const dica = o && !ROTULO_DA_ETIQUETA[o.rotulo] ? 'Campo automático do Word: sai igual no arquivo' : 'Elemento do Word: sai igual no arquivo';
  return `<span contenteditable="false" data-obj="${k}" title="${dica}" class="etiqueta-word">${escHtml(rotulo)}</span>`;
}

/**
 * HTML para a caixa editável. Os marcadores "[PREENCHER: …]" saem em <mark> só para destacar na tela: a leitura de
 * volta ignora o <mark> (no Word o destaque é recalculado a partir do texto). `objetos`: as etiquetas do parágrafo.
 */
export function trechosParaHtml(trechos, objetos = []) {
  const lista = juntarTrechos(trechos || []);
  const texto = textoDosTrechos(lista);
  const faixas = acharMarcadores(texto);
  const cortes = new Set([0, texto.length]);
  let pos = 0;
  const inicioDe = [];
  for (const t of lista) {
    inicioDe.push(pos);
    cortes.add(pos);
    pos += t.texto.length;
  }
  for (const [ini, fim] of faixas) cortes.add(ini).add(fim);
  const ordenados = [...cortes].sort((a, b) => a - b);
  let html = '';
  for (let k = 0; k < ordenados.length - 1; k++) {
    const [ini, fim] = [ordenados[k], ordenados[k + 1]];
    if (fim <= ini) continue;
    let i = inicioDe.length - 1;
    while (i > 0 && inicioDe[i] > ini) i--;
    const t = lista[i];
    let parte = escHtml(texto.slice(ini, fim))
      .replace(/\n/g, '<br>')
      .replace(/[\ue000-\uf8ff]/g, (c) => etiqueta(indiceDoObjeto(c), objetos));
    if (t.sublinhado) parte = `<u>${parte}</u>`;
    if (t.italico) parte = `<i>${parte}</i>`;
    if (t.negrito) parte = `<b>${parte}</b>`;
    if (faixas.some(([a, b]) => ini >= a && ini < b)) parte = `<mark>${parte}</mark>`;
    html += parte;
  }
  // caixa vazia com <br>: o cursor do navegador precisa de uma linha para pousar
  return html || '<br>';
}

const BLOCO = new Set(['DIV', 'P', 'LI']);

/**
 * Lê a caixa editável de volta em trechos (o navegador pode gerar <b>, <strong>, <span style="font-weight:…">…).
 * `manterQuebraFinal`: para medir a posição do cursor logo depois de uma quebra de linha.
 */
export function htmlParaTrechos(raiz, { manterQuebraFinal = false } = {}) {
  const trechos = [];
  const visitar = (no, formato) => {
    if (no.nodeType === 3) {
      if (no.nodeValue) trechos.push({ texto: no.nodeValue.replace(/ /g, ' '), ...formato });
      return;
    }
    if (no.nodeType !== 1) return;
    const tag = no.tagName;
    if (tag === 'BR') {
      trechos.push({ texto: '\n', ...formato });
      return;
    }
    if (no.dataset?.obj !== undefined) {
      trechos.push({ texto: caractereDoObjeto(Number(no.dataset.obj)), ...formato });
      return;
    }
    const estilo = no.style || {};
    const peso = String(estilo.fontWeight || '');
    const proximo = {
      negrito: formato.negrito || tag === 'B' || tag === 'STRONG' || peso === 'bold' || Number(peso) >= 600,
      italico: formato.italico || tag === 'I' || tag === 'EM' || estilo.fontStyle === 'italic',
      sublinhado: formato.sublinhado || tag === 'U' || String(estilo.textDecoration || estilo.textDecorationLine || '').includes('underline'),
    };
    if (estilo.fontWeight === 'normal' || peso === '400') proximo.negrito = false;
    // o navegador às vezes embrulha uma linha nova em <div>: vira quebra de linha
    if (BLOCO.has(tag) && no !== raiz && trechos.length && !trechos[trechos.length - 1].texto.endsWith('\n')) {
      trechos.push({ texto: '\n', ...formato });
    }
    no.childNodes.forEach((filho) => visitar(filho, proximo));
  };
  visitar(raiz, { negrito: false, italico: false, sublinhado: false });
  // o <br> final que o navegador mantém numa caixa vazia (ou no fim da linha) não é texto
  const saida = juntarTrechos(trechos);
  const ultimo = saida[saida.length - 1];
  if (!manterQuebraFinal && ultimo?.texto.endsWith('\n')) {
    ultimo.texto = ultimo.texto.slice(0, -1);
    if (!ultimo.texto) saida.pop();
  }
  return saida;
}

/** Divide os trechos na posição `pos` do texto (Enter no meio do parágrafo). */
export function dividirTrechos(trechos, pos) {
  const antes = [];
  const depois = [];
  let cursor = 0;
  for (const t of juntarTrechos(trechos)) {
    const fim = cursor + t.texto.length;
    if (fim <= pos) antes.push(t);
    else if (cursor >= pos) depois.push(t);
    else {
      antes.push({ ...t, texto: t.texto.slice(0, pos - cursor) });
      depois.push({ ...t, texto: t.texto.slice(pos - cursor) });
    }
    cursor = fim;
  }
  return [antes, depois];
}

export const mesmosTrechos = (a, b) => JSON.stringify(juntarTrechos(a || [])) === JSON.stringify(juntarTrechos(b || []));

/**
 * Estado da tela → alterações de montarDocxEditado. Parágrafo cujo texto voltou a ser igual ao original não conta.
 * Estado: { [id]: { trechos?, removido?, novos?: Array<{ chave, trechos }> } }
 */
export function alteracoesParaMontagem(estado, blocos) {
  const porId = new Map(blocos.map((b) => [b.id, b]));
  const saida = {};
  for (const [id, alt] of Object.entries(estado || {})) {
    const original = porId.get(Number(id));
    if (!original) continue;
    const trechos = alt.trechos && !mesmosTrechos(alt.trechos, original.trechos) ? alt.trechos : undefined;
    const depois = (alt.novos || []).map((n) => n.trechos).filter((t) => textoDosTrechos(t).trim());
    if (!trechos && !alt.removido && depois.length === 0) continue;
    saida[id] = { ...(trechos ? { trechos } : {}), ...(alt.removido ? { removido: true } : {}), ...(depois.length ? { depois } : {}) };
  }
  return saida;
}

/** Quantas mudanças o advogado fez (parágrafo alterado, removido ou acrescentado conta 1 cada). */
export function contarAlteracoes(alteracoes) {
  return Object.values(alteracoes || {}).reduce(
    (n, a) => n + (a.trechos && !a.removido ? 1 : 0) + (a.removido ? 1 : 0) + (a.depois?.length || 0),
    0,
  );
}

/** Texto de um bloco como está no editor (com os parágrafos novos logo abaixo; '' se removido). */
export function textoAtualDoBloco(estado, b) {
  const alt = estado?.[b.id];
  const proprio = alt?.removido ? '' : alt?.trechos ? textoDosTrechos(alt.trechos) : b.texto;
  return [proprio, ...(alt?.novos || []).map((n) => textoDosTrechos(n.trechos))].join('\n');
}
