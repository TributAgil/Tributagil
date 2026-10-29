// src/lib/docxEdicao.js
//
// Edição da peça por TÓPICOS, no navegador, sobre o .docx que o servidor já devolveu: nada é reenviado e nenhuma IA é
// chamada (custo zero). O documento é lido parágrafo a parágrafo e agrupado pelos títulos do modelo ("DOS FATOS",
// "DA PRESCRIÇÃO…"); o advogado altera o texto, com negrito, itálico e sublinhado, acrescenta ou remove parágrafos.
//
// O QUE GARANTE A CARA DO ESCRITÓRIO: só o parágrafo alterado é reescrito. Ele mantém as propriedades de parágrafo do
// modelo (recuo, espaçamento, alinhamento) e a fonte, o tamanho e a cor do texto que já estava nele; os demais
// parágrafos, as tabelas, as figuras, o cabeçalho e o rodapé saem byte a byte como vieram. Marcadores "[PREENCHER: …]",
// "[CONFIRMAR …]" e "[INSERIR FIGURA …]" que continuarem no texto voltam destacados em amarelo, como o servidor faz.
//
// O QUE NÃO É EDITÁVEL AQUI (aparece só para leitura e continua igual no Word): tabelas, parágrafos com imagem, campo,
// nota de rodapé ou comentário, e o marcador de cada figura (o assistente de figuras depende dele).
//
// JSZip é carregado sob demanda, como em src/lib/docxFiguras.js.

const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const desescXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

// ---------------------------------------------------------------------------------------------------------------------
// Leitura do XML: elementos filhos de um nível, sem regex "gulosa" (tabela tem parágrafo dentro, sdt tem sdt dentro)
// ---------------------------------------------------------------------------------------------------------------------

const TAG = /<(\/?)([A-Za-z][\w.-]*:[\w.-]+|[A-Za-z][\w.-]*)((?:\s[^>]*?)?)(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g;

/**
 * Elementos filhos diretos do trecho `xml` (que deve ser o CONTEÚDO de um elemento, sem a tag dele).
 * @returns {Array<{ nome: string, xml: string, inicio: number, fim: number }>}
 */
export function filhos(xml) {
  const saida = [];
  TAG.lastIndex = 0;
  let profundidade = 0;
  let atual = null;
  let m;
  while ((m = TAG.exec(xml)) !== null) {
    if (!m[2]) continue; // comentário ou instrução
    const [, fecha, nome, , autoFecha] = m;
    if (fecha) {
      profundidade--;
      if (profundidade === 0 && atual) {
        saida.push({ nome: atual.nome, inicio: atual.inicio, fim: TAG.lastIndex, xml: xml.slice(atual.inicio, TAG.lastIndex) });
        atual = null;
      }
    } else if (autoFecha) {
      if (profundidade === 0) saida.push({ nome, inicio: m.index, fim: TAG.lastIndex, xml: m[0] });
    } else {
      if (profundidade === 0) atual = { nome, inicio: m.index };
      profundidade++;
    }
  }
  return saida;
}

/** Conteúdo de um elemento (sem a tag de abertura e a de fechamento); '' se for auto-fechado. */
function interior(elemento) {
  if (/\/>$/.test(elemento) && !/<\/[^>]+>$/.test(elemento)) return '';
  const abre = elemento.indexOf('>') + 1;
  const fecha = elemento.lastIndexOf('</');
  return elemento.slice(abre, fecha);
}

const tagDeAbertura = (elemento) => elemento.slice(0, elemento.indexOf('>') + 1).replace(/\/>$/, '>');

// ---------------------------------------------------------------------------------------------------------------------
// Marcadores (mesma regra de api/_render-peca.js: colchetes aninhados contam como um marcador só)
// ---------------------------------------------------------------------------------------------------------------------

const INICIO_MARCADOR = /\[(?:PREENCHER:|INSERIR FIGURA|CONFIRMAR)/g;

/** @returns {Array<[number, number, string]>} faixas [início, fim) e o tipo ('preencher' | 'figura' | 'confirmar') */
export function acharMarcadores(texto) {
  const faixas = [];
  INICIO_MARCADOR.lastIndex = 0;
  let m;
  while ((m = INICIO_MARCADOR.exec(texto)) !== null) {
    let profundidade = 0;
    let fim = texto.length;
    for (let i = m.index; i < texto.length; i++) {
      if (texto[i] === '[') profundidade++;
      else if (texto[i] === ']' && --profundidade === 0) {
        fim = i + 1;
        break;
      }
    }
    const tipo = m[0].startsWith('[PREENCHER') ? 'preencher' : m[0].startsWith('[INSERIR') ? 'figura' : 'confirmar';
    faixas.push([m.index, fim, tipo]);
    INICIO_MARCADOR.lastIndex = fim;
  }
  return faixas;
}

// ---------------------------------------------------------------------------------------------------------------------
// Formatação de um run (rPr)
// ---------------------------------------------------------------------------------------------------------------------

/** Liga/desliga de <w:b/>, <w:i/>: sem w:val, ou com 1/true/on, é ligado. */
function ligado(rPr, nome) {
  const m = new RegExp(`<w:${nome}(?:\\s+w:val="([^"]*)")?\\s*/>`).exec(rPr || '');
  return Boolean(m) && !/^(0|false|off)$/i.test(m[1] || '');
}

function sublinhado(rPr) {
  const m = /<w:u(?:\s+w:val="([^"]*)")?[^>]*\/>/.exec(rPr || '');
  return Boolean(m) && !/^none$/i.test(m[1] || 'single');
}

const formatoDoRPr = (rPr) => ({ negrito: ligado(rPr, 'b'), italico: ligado(rPr, 'i'), sublinhado: sublinhado(rPr) });

// Ordem dos filhos de <w:rPr> no schema do Word (CT_RPr). Fora de ordem, o Word pode recusar o arquivo.
const ORDEM_RPR = [
  'rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss',
  'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs',
  'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout',
  'specVanish', 'oMath',
];
const QUE_O_EDITOR_DECIDE = new Set(['b', 'bCs', 'i', 'iCs', 'u', 'highlight', 'rPrChange']);

/** A formatação "de fundo" de um run (fonte, tamanho, cor, idioma), sem o que o editor decide por trecho. */
function rPrDeBase(rPr) {
  if (!rPr) return [];
  return filhos(interior(rPr))
    .map((f) => ({ nome: f.nome.replace(/^w:/, ''), xml: f.xml }))
    .filter((f) => !QUE_O_EDITOR_DECIDE.has(f.nome));
}

function montarRPr(base, { negrito, italico, sublinhado: sub }, destaque) {
  const itens = [...base];
  if (negrito) itens.push({ nome: 'b', xml: '<w:b/>' }, { nome: 'bCs', xml: '<w:bCs/>' });
  if (italico) itens.push({ nome: 'i', xml: '<w:i/>' }, { nome: 'iCs', xml: '<w:iCs/>' });
  if (destaque) itens.push({ nome: 'highlight', xml: '<w:highlight w:val="yellow"/>' });
  if (sub) itens.push({ nome: 'u', xml: '<w:u w:val="single"/>' });
  const pos = (n) => {
    const i = ORDEM_RPR.indexOf(n);
    return i === -1 ? ORDEM_RPR.length : i;
  };
  itens.sort((a, b) => pos(a.nome) - pos(b.nome)); // sort estável: desconhecidos mantêm a ordem relativa, no fim
  return itens.length ? `<w:rPr>${itens.map((i) => i.xml).join('')}</w:rPr>` : '';
}

// ---------------------------------------------------------------------------------------------------------------------
// Parágrafo → trechos de texto com formatação
// ---------------------------------------------------------------------------------------------------------------------

// Filhos de um run que viram texto.
const FILHO_DE_TEXTO = new Set(['w:t', 'w:tab', 'w:br', 'w:cr', 'w:noBreakHyphen', 'w:softHyphen', 'w:lastRenderedPageBreak', 'w:rPr']);
// Filhos de um run que viram uma ETIQUETA fixa no meio do texto: o advogado edita em volta e o elemento sai intacto.
const OBJETO_DO_RUN = {
  'w:footnoteReference': 'nota de rodapé',
  'w:endnoteReference': 'nota de fim',
  'w:commentReference': 'comentário',
  'w:sym': 'símbolo',
};
// Dentro do parágrafo: o que é atravessado (o conteúdo conta) e o que é ignorado com segurança.
const ATRAVESSA = new Set(['w:hyperlink', 'w:smartTag', 'w:ins', 'w:customXml']);
const IGNORA = new Set(['w:proofErr', 'w:permStart', 'w:permEnd', 'w:pPr']);
const MARCA_DE_POSICAO = new Set(['w:bookmarkStart', 'w:bookmarkEnd', 'w:commentRangeStart', 'w:commentRangeEnd']);

// Cada etiqueta ocupa UM caractere do texto, da área de uso privado do Unicode (nunca aparece num texto de verdade).
const PRIMEIRO_OBJETO = 0xe000;
const OBJETO = /[\ue000-\uf8ff]/;
export const caractereDoObjeto = (k) => String.fromCharCode(PRIMEIRO_OBJETO + k);
export const indiceDoObjeto = (c) => c.charCodeAt(0) - PRIMEIRO_OBJETO;
export const ehObjeto = (c) => OBJETO.test(c);

/**
 * @typedef {{ texto: string, negrito: boolean, italico: boolean, sublinhado: boolean }} Trecho
 * @typedef {{ xml: string, rotulo: string }} Objeto  elemento do Word preservado como etiqueta (campo, nota, imagem em linha)
 */

const tiposDeFldChar = (xml) => [...xml.matchAll(/<w:fldChar\b[^>]*w:fldCharType="(begin|separate|end)"/g)].map((m) => m[1]);
const textoDosT = (xml) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => desescXml(m[1])).join('');

function lerParagrafo(xml) {
  const conteudo = interior(xml);
  const partes = filhos(conteudo);
  const pPr = partes.find((p) => p.nome === 'w:pPr')?.xml || '';
  const trechos = [];
  const marcasDePosicao = [];
  const objetosFlutuantes = []; // desenhos ancorados (enfeite de título, caixa de texto): saem intactos, no início
  const objetos = []; // etiquetas no meio do texto
  const rPrs = [];
  let motivo = '';
  // campo do Word (numeração "Figura 1", data, referência): do fldChar "begin" ao "end" vira UMA etiqueta
  let campo = null;

  const objeto = (xmlObjeto, rotulo, formato) => {
    trechos.push({ texto: caractereDoObjeto(objetos.length), ...formato });
    objetos.push({ xml: xmlObjeto, rotulo });
  };

  const noCampo = (xmlItem) => {
    campo.xml += xmlItem;
    for (const tipo of tiposDeFldChar(xmlItem)) {
      if (tipo === 'begin') campo.profundidade++;
      else if (tipo === 'separate' && campo.profundidade === 1) campo.noResultado = true;
      else if (tipo === 'end' && --campo.profundidade === 0) {
        // campo sem resultado (sobra do modelo) não aparece no Word: rótulo vazio, etiqueta invisível na tela
        objeto(campo.xml, campo.resultado.trim(), campo.formato);
        campo = null;
        return;
      }
    }
    if (campo.noResultado && campo.profundidade === 1) campo.resultado += textoDosT(xmlItem);
  };

  const lerRun = (run) => {
    const itens = filhos(interior(run));
    const rPr = itens.find((i) => i.nome === 'w:rPr')?.xml || '';
    const formato = formatoDoRPr(rPr);
    if (!campo && tiposDeFldChar(run)[0] === 'begin') {
      campo = { xml: '', profundidade: 0, resultado: '', noResultado: false, formato };
    }
    if (campo) {
      noCampo(run);
      return;
    }
    let texto = '';
    const fecharTexto = () => {
      if (!texto) return;
      trechos.push({ texto, ...formato });
      rPrs.push({ rPr, tamanho: texto.trim().length });
      texto = '';
    };
    for (const i of itens) {
      if (i.nome === 'w:rPr') continue;
      if (OBJETO_DO_RUN[i.nome] || emLinha(i)) {
        fecharTexto();
        objeto(`<w:r>${rPr}${i.xml}</w:r>`, OBJETO_DO_RUN[i.nome] || 'imagem', formato);
        continue;
      }
      if (!FILHO_DE_TEXTO.has(i.nome)) {
        if (flutuante(i)) objetosFlutuantes.push(`<w:r>${rPr}${i.xml}</w:r>`);
        else motivo ||= motivoDoElemento(i.nome);
        continue;
      }
      if (i.nome === 'w:t') texto += desescXml(interior(i.xml));
      else if (i.nome === 'w:tab') texto += '\t';
      else if (i.nome === 'w:br' || i.nome === 'w:cr') {
        if (/w:type="(page|column)"/.test(i.xml)) motivo ||= 'quebra de página';
        texto += '\n';
      } else if (i.nome === 'w:noBreakHyphen') texto += '‑';
    }
    fecharTexto();
  };

  const percorrer = (itens) => {
    for (const p of itens) {
      if (campo && p.nome !== 'w:pPr') noCampo(p.xml);
      else if (p.nome === 'w:r') lerRun(p.xml);
      else if (ATRAVESSA.has(p.nome)) percorrer(filhos(interior(p.xml)));
      else if (p.nome === 'w:sdt') {
        const conteudoSdt = filhos(interior(p.xml)).find((f) => f.nome === 'w:sdtContent');
        if (conteudoSdt) percorrer(filhos(interior(conteudoSdt.xml)));
      } else if (p.nome === 'w:fldSimple') objeto(p.xml, textoDosT(p.xml).trim(), { negrito: false, italico: false, sublinhado: false });
      else if (MARCA_DE_POSICAO.has(p.nome)) marcasDePosicao.push(p.xml);
      else if (IGNORA.has(p.nome) || p.nome === 'w:del') continue;
      else motivo ||= motivoDoElemento(p.nome);
    }
  };
  percorrer(partes);
  if (campo) motivo ||= motivoDoElemento('w:fldChar'); // campo que não fecha no parágrafo: não arrisca

  // a formatação de fundo vem do run com mais texto (é a "voz" do parágrafo)
  const principal = rPrs.reduce((a, b) => (b.tamanho > (a?.tamanho ?? -1) ? b : a), null);
  return { pPr, trechos: juntarTrechos(trechos), objetos, marcasDePosicao, objetosFlutuantes, rPrBase: principal?.rPr || '', motivo };
}

/** Imagem "em linha com o texto": vira etiqueta (tem lugar entre as palavras). */
function emLinha({ nome, xml }) {
  if (nome === 'w:drawing') return xml.includes('<wp:inline');
  if (nome === 'mc:AlternateContent') return xml.includes('<wp:inline') && !xml.includes('<wp:anchor');
  return false;
}

/** Texto como aparece no Word: cada etiqueta vira o texto dela (o número da figura, a data do campo…). */
export function textoVisivel(trechos, objetos = []) {
  return textoDosTrechos(trechos).replace(/[\ue000-\uf8ff]/g, (c) => {
    const o = objetos[indiceDoObjeto(c)];
    return !o ? '' : o.rotulo === 'nota de rodapé' || o.rotulo === 'nota de fim' ? '¹' : o.rotulo === 'imagem' || o.rotulo === 'comentário' || o.rotulo === 'símbolo' ? '' : o.rotulo;
  });
}

/**
 * Desenho que não ocupa lugar no texto (ancorado à página ou ao parágrafo, por cima ou atrás): mudar o texto ao lado não
 * o desloca. Imagem "em linha com o texto" não entra aqui: ela tem posição no meio das palavras.
 */
function flutuante({ nome, xml }) {
  if (nome === 'w:drawing' || nome === 'mc:AlternateContent') return xml.includes('<wp:anchor') && !xml.includes('<wp:inline');
  if (nome === 'w:pict') return /position:\s*absolute/.test(xml);
  return false;
}

/** Por que um parágrafo com este elemento fica só para leitura (o texto do motivo aparece na tela). */
function motivoDoElemento(nome) {
  if (/drawing|pict|object|AlternateContent/.test(nome)) return 'imagem';
  if (/fldChar|instrText|fldSimple/.test(nome)) return 'campo automático do Word (numeração ou data)';
  if (/footnote|endnote/i.test(nome)) return 'nota de rodapé';
  if (/comment/i.test(nome)) return 'comentário';
  if (/oMath/.test(nome)) return 'fórmula';
  return 'elemento especial do Word';
}

const mesmoFormato = (a, b) => a.negrito === b.negrito && a.italico === b.italico && a.sublinhado === b.sublinhado;

/** Junta trechos vizinhos com a mesma formatação e descarta os vazios. */
export function juntarTrechos(trechos) {
  const saida = [];
  for (const t of trechos) {
    if (!t.texto) continue;
    const ultimo = saida[saida.length - 1];
    if (ultimo && mesmoFormato(ultimo, t)) ultimo.texto += t.texto;
    else saida.push({ texto: t.texto, negrito: Boolean(t.negrito), italico: Boolean(t.italico), sublinhado: Boolean(t.sublinhado) });
  }
  return saida;
}

export const textoDosTrechos = (trechos) => (trechos || []).map((t) => t.texto).join('');

// ---------------------------------------------------------------------------------------------------------------------
// Títulos dos tópicos
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Os modelos não usam estilos de título: os tópicos são parágrafos curtos, inteiramente em negrito e sem pontuação
 * final ("DOS FATOS", "DA PRESCRIÇÃO DO CRÉDITO TRIBUTÁRIO", "Da prescrição da CDA nº …").
 * @returns {0|1|2} 0 = não é título; 1 = tópico (caixa alta); 2 = subtópico
 */
export function nivelDeTitulo(trechos) {
  const texto = textoDosTrechos(trechos).replace(/\s+/g, ' ').trim();
  if (!texto || texto.length > 120 || /[.;:,]$/.test(texto) || acharMarcadores(texto).length) return 0;
  if (!trechos.every((t) => !t.texto.trim() || t.negrito)) return 0;
  const letras = texto.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letras.length < 3) return 0;
  const maiusculas = letras.replace(/[^A-ZÀ-ÖØ-Þ]/g, '').length;
  if (maiusculas / letras.length >= 0.85) return 1;
  // subtópico ("Da prescrição da CDA nº …"); legenda de figura e linha de assinatura ("Fulana | OAB …") não são
  return /^Figura\s+\d/i.test(texto) || texto.includes('|') ? 0 : 2;
}

// ---------------------------------------------------------------------------------------------------------------------
// Abrir a peça
// ---------------------------------------------------------------------------------------------------------------------

/**
 * @typedef {{
 *   id: number, tipo: 'paragrafo' | 'tabela' | 'outro', texto: string, trechos: Trecho[], editavel: boolean,
 *   removivel: boolean, motivo: string, titulo: 0|1|2, figura: number|null, vazio: boolean
 * }} Bloco
 * @typedef {{ titulo: string, inicio: number, blocos: number[] }} Topico
 */

/**
 * Lê o Word da peça.
 * @param {ArrayBuffer|Uint8Array} docx
 * @returns {Promise<{ blocos: Bloco[], topicos: Topico[], fonte: object }>}  `fonte` é opaco: vai para montarDocxEditado
 */
export async function abrirPecaParaEdicao(docx) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(docx);
  const arquivo = zip.file('word/document.xml');
  if (!arquivo) throw new Error('O Word da peça não pôde ser aberto.');
  const xml = await arquivo.async('string');

  const abreCorpo = /<w:body(?:\s[^>]*)?>/.exec(xml);
  const fechaCorpo = xml.lastIndexOf('</w:body>');
  if (!abreCorpo || fechaCorpo < 0) throw new Error('O Word da peça não tem corpo de texto.');
  const inicioCorpo = abreCorpo.index + abreCorpo[0].length;
  const corpo = xml.slice(inicioCorpo, fechaCorpo);

  const elementos = filhos(corpo);
  const blocos = [];
  const lidos = new Map();
  elementos.forEach((el, id) => {
    if (el.nome === 'w:p') {
      const p = lerParagrafo(el.xml);
      lidos.set(id, p);
      const texto = textoVisivel(p.trechos, p.objetos);
      const figura = /\[INSERIR FIGURA (\d+)/.exec(texto);
      const editavel = !p.motivo && !figura;
      blocos.push({
        id,
        tipo: 'paragrafo',
        texto,
        trechos: p.trechos,
        objetos: p.objetos.map((o) => ({ rotulo: o.rotulo })),
        editavel,
        // título e marcador de figura ficam: tirar um título desmonta o tópico, tirar o marcador desmonta as figuras
        removivel: editavel,
        motivo: figura ? 'figura' : p.motivo,
        titulo: figura || p.objetos.length ? 0 : nivelDeTitulo(p.trechos),
        figura: figura ? Number(figura[1]) : null,
        vazio: !texto.trim() && !p.motivo && p.objetos.length === 0,
      });
    } else if (el.nome === 'w:tbl' || (el.nome === 'w:sdt' && el.xml.includes('<w:tbl'))) {
      const texto = textoDaTabela(el.xml);
      blocos.push({ id, tipo: 'tabela', texto, trechos: [], objetos: [], editavel: false, removivel: false, motivo: 'tabela', titulo: 0, figura: null, vazio: false });
    } else if (el.nome !== 'w:sectPr') {
      const texto = textoSimples(el.xml);
      blocos.push({ id, tipo: 'outro', texto, trechos: [], objetos: [], editavel: false, removivel: false, motivo: 'elemento especial do Word', titulo: 0, figura: null, vazio: !texto.trim() });
    }
  });
  for (const b of blocos) if (b.titulo === 2 && !b.trechos.length) b.titulo = 0;

  return { blocos, topicos: agruparEmTopicos(blocos), fonte: { zip, xml, inicioCorpo, fechaCorpo, elementos, lidos, corpo } };
}

function textoSimples(xml) {
  return xml
    .split('</w:p>')
    .map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => desescXml(m[1])).join(''))
    .filter((l) => l.trim())
    .join('\n');
}

/** Texto de uma tabela, uma linha por linha da tabela e as células separadas por " | ". */
function textoDaTabela(xml) {
  return (xml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || [])
    .map((tr) => (tr.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) || []).map((tc) => textoSimples(tc).replace(/\n/g, ' ').trim()).join(' | '))
    .filter((l) => l.replace(/[|\s]/g, ''))
    .join('\n');
}

const TITULO_ABERTURA = 'Abertura (endereçamento e qualificação)';

/** Tópicos = um título de nível 1 e tudo até o próximo; o que vem antes do primeiro título é a "Abertura". */
export function agruparEmTopicos(blocos) {
  const topicos = [];
  let atual = null;
  for (const b of blocos) {
    if (b.titulo === 1) {
      atual = { titulo: b.texto.replace(/\s+/g, ' ').trim(), inicio: b.id, blocos: [b.id] };
      topicos.push(atual);
      continue;
    }
    if (!atual) {
      atual = { titulo: TITULO_ABERTURA, inicio: b.id, blocos: [] };
      topicos.push(atual);
    }
    atual.blocos.push(b.id);
  }
  // abertura sem nada para editar (só o logo, por exemplo) não vira tópico: entra no primeiro
  const porId = new Map(blocos.map((b) => [b.id, b]));
  if (topicos.length > 1 && topicos[0].titulo === TITULO_ABERTURA && !topicos[0].blocos.some((id) => porId.get(id)?.editavel && !porId.get(id)?.vazio)) {
    const [abertura, proximo] = topicos.splice(0, 2);
    topicos.unshift({ ...proximo, blocos: [...abertura.blocos, ...proximo.blocos] });
  }
  return topicos;
}

// ---------------------------------------------------------------------------------------------------------------------
// Regravar
// ---------------------------------------------------------------------------------------------------------------------

const TIPO_DE_RUN_TEXTO = /([\t\n\ue000-\uf8ff])/;

function runsDoTexto(texto, formato, base, destaque, objetos) {
  const rPr = montarRPr(base, formato, destaque);
  return texto
    .split(TIPO_DE_RUN_TEXTO)
    .filter((p) => p !== '')
    .map((p) => {
      if (p === '\t') return `<w:r>${rPr}<w:tab/></w:r>`;
      if (p === '\n') return `<w:r>${rPr}<w:br/></w:r>`;
      if (ehObjeto(p)) return objetos[indiceDoObjeto(p)]?.xml || ''; // a etiqueta volta a ser o elemento original
      return `<w:r>${rPr}<w:t xml:space="preserve">${escXml(p)}</w:t></w:r>`;
    })
    .join('');
}

/** Runs de um parágrafo a partir dos trechos, com os marcadores que restarem destacados em amarelo. */
export function runsDosTrechos(trechos, rPrBase = '', objetos = []) {
  const base = rPrDeBase(rPrBase);
  const lista = juntarTrechos(trechos);
  const texto = textoDosTrechos(lista);
  const faixas = acharMarcadores(texto);
  const dentro = (pos) => faixas.some(([ini, fim]) => pos >= ini && pos < fim);
  // pontos de corte: limites de trecho e de marcador
  const cortes = new Set([0, texto.length]);
  let pos = 0;
  for (const t of lista) {
    cortes.add(pos);
    pos += t.texto.length;
  }
  for (const [ini, fim] of faixas) {
    cortes.add(ini);
    cortes.add(fim);
  }
  const ordenados = [...cortes].sort((a, b) => a - b);
  let saida = '';
  let inicioTrecho = 0;
  let iTrecho = 0;
  for (let k = 0; k < ordenados.length - 1; k++) {
    const [ini, fim] = [ordenados[k], ordenados[k + 1]];
    while (iTrecho < lista.length - 1 && ini >= inicioTrecho + lista[iTrecho].texto.length) {
      inicioTrecho += lista[iTrecho].texto.length;
      iTrecho++;
    }
    if (fim > ini) saida += runsDoTexto(texto.slice(ini, fim), lista[iTrecho], base, dentro(ini), objetos);
  }
  return saida;
}

function paragrafoReescrito(original, lido, trechos, { novo = false } = {}) {
  let abre = tagDeAbertura(original);
  // ids de parágrafo do Word não podem se repetir: o parágrafo novo não herda os do modelo
  if (novo) abre = abre.replace(/\s+w14:(paraId|textId)="[^"]*"/g, '');
  const marcas = novo ? '' : lido.marcasDePosicao.join('') + lido.objetosFlutuantes.join('');
  // no parágrafo novo (Enter no meio) a etiqueta que foi para baixo continua sendo o mesmo elemento
  return `${abre}${lido.pPr}${marcas}${runsDosTrechos(trechos, lido.rPrBase, lido.objetos)}</w:p>`;
}

/**
 * @typedef {{ trechos?: Trecho[], removido?: boolean, depois?: Trecho[][] }} Alteracao
 *   `trechos`: novo texto do parágrafo · `removido`: some do Word · `depois`: parágrafos novos logo abaixo (mesma
 *   formatação de parágrafo e de fonte do parágrafo de referência)
 */

/**
 * Monta o Word com as alterações. Parágrafo sem alteração sai idêntico ao original.
 * @param {object} fonte  devolvido por abrirPecaParaEdicao
 * @param {Record<number, Alteracao>} alteracoes  por id de bloco
 * @returns {Promise<Uint8Array>}
 */
export async function montarDocxEditado(fonte, alteracoes = {}) {
  const { zip, xml, inicioCorpo, fechaCorpo, elementos, lidos, corpo } = fonte;
  let novoCorpo = '';
  let cursor = 0;
  elementos.forEach((el, id) => {
    novoCorpo += corpo.slice(cursor, el.inicio);
    cursor = el.fim;
    const alt = alteracoes[id];
    const lido = lidos.get(id);
    const podeMexer = el.nome === 'w:p' && lido && !lido.motivo && !/\[INSERIR FIGURA \d+/.test(textoDosTrechos(lido.trechos));
    if (!alt || !podeMexer) {
      novoCorpo += el.xml;
      return;
    }
    if (!alt.removido) novoCorpo += alt.trechos ? paragrafoReescrito(el.xml, lido, alt.trechos) : el.xml;
    for (const trechos of alt.depois || []) novoCorpo += paragrafoReescrito(el.xml, lido, trechos, { novo: true });
  });
  novoCorpo += corpo.slice(cursor);

  // sempre a partir do XML original guardado na abertura: montar de novo não acumula alterações antigas
  zip.file('word/document.xml', xml.slice(0, inicioCorpo) + novoCorpo + xml.slice(fechaCorpo));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// ---------------------------------------------------------------------------------------------------------------------
// Pendências (o que ainda está em amarelo)
// ---------------------------------------------------------------------------------------------------------------------

const ROTULO_PENDENCIA = { preencher: 'Preencher', confirmar: 'Confirmar', figura: 'Figura' };

/**
 * Marcadores que ainda restam, na ordem do documento, já considerando o texto editado.
 * @param {Bloco[]} blocos
 * @param {(bloco: Bloco) => string} textoAtual  texto do bloco como está no editor ('' se removido)
 */
export function listarPendencias(blocos, textoAtual = (b) => b.texto) {
  const saida = [];
  for (const b of blocos) {
    const texto = textoAtual(b);
    for (const [ini, fim, tipo] of acharMarcadores(texto)) {
      saida.push({ id: b.id, tipo, rotulo: ROTULO_PENDENCIA[tipo], trecho: texto.slice(ini, fim), naTabela: b.tipo === 'tabela' });
    }
  }
  return saida;
}

export function contarPendencias(pendencias) {
  return {
    preencher: pendencias.filter((p) => p.tipo === 'preencher').length,
    confirmar: pendencias.filter((p) => p.tipo === 'confirmar').length,
    figuras: pendencias.filter((p) => p.tipo === 'figura').length,
  };
}

/** "Peca.docx" → "Peca-editada.docx" (não acumula o sufixo). */
export function nomeEditado(nome) {
  const base = /\.docx$/i.test(nome || '') ? nome.replace(/\.docx$/i, '') : nome || 'peca';
  return /-editada$/.test(base) ? `${base}.docx` : `${base}-editada.docx`;
}

/** Uint8Array → base64, em blocos (String.fromCharCode com o arquivo inteiro estoura a pilha). */
export function bytesParaBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
