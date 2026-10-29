// src/lib/docxFiguras.js
//
// Etapa (d) do assistente de figuras: troca, no Word da peça, cada parágrafo "[INSERIR FIGURA N – …]" pela imagem que o
// advogado confirmou. Roda no navegador, sobre o .docx que o servidor já devolveu: nada é reenviado, nenhuma IA é chamada
// e o texto jurídico do modelo não é tocado (só o parágrafo-marcador some, no lugar dele entra a imagem; a legenda
// "Figura N - …" que o modelo já traz logo abaixo continua onde estava).
//
// Figura sem imagem confirmada mantém o marcador amarelo, como antes. JSZip é carregado sob demanda.

const EMU_POR_TWIP = 635;
const EMU_POR_POLEGADA = 914400;
const DPI_BASE = 216; // as páginas são recortadas com 1800 px de largura: ~216 dpi numa folha A4
const LARGURA_TEXTO_PADRAO_TWIPS = 8800; // A4 com margens de ~2,5 cm
const ALTURA_MAXIMA_EMU = 20 * 360000; // 20 cm: imagem mais alta que isso encolhe

const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const desescXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** Largura e altura de um PNG lendo só o cabeçalho (as figuras são sempre PNG: recorte do canvas ou print normalizado). */
export function dimensoesPng(bytes) {
  if (!bytes || bytes.length < 24) return null;
  const ok = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!ok) return null;
  const visao = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const largura = visao.getUint32(16);
  const altura = visao.getUint32(20);
  return largura > 0 && altura > 0 ? { largura, altura } : null;
}

/** Tamanho (EMU) da imagem no papel: tamanho natural a ~216 dpi, limitado à largura útil da página e a 20 cm de altura. */
export function tamanhoNoPapel({ largura, altura }, larguraUtilEmu) {
  let cx = Math.round((largura * EMU_POR_POLEGADA) / DPI_BASE);
  let cy = Math.round((altura * EMU_POR_POLEGADA) / DPI_BASE);
  if (cx > larguraUtilEmu) {
    cy = Math.round((cy * larguraUtilEmu) / cx);
    cx = larguraUtilEmu;
  }
  if (cy > ALTURA_MAXIMA_EMU) {
    cx = Math.round((cx * ALTURA_MAXIMA_EMU) / cy);
    cy = ALTURA_MAXIMA_EMU;
  }
  return { cx: Math.max(1, cx), cy: Math.max(1, cy) };
}

/** Largura útil (EMU) = página menos margens, da última seção do documento. */
function larguraUtilEmu(xml) {
  const secoes = [...xml.matchAll(/<w:sectPr[\s\S]*?<\/w:sectPr>/g)];
  const sec = secoes.length ? secoes[secoes.length - 1][0] : '';
  const pagina = Number(/<w:pgSz[^>]*\sw:w="(\d+)"/.exec(sec)?.[1]);
  const esq = Number(/<w:pgMar[^>]*\sw:left="(\d+)"/.exec(sec)?.[1]);
  const dir = Number(/<w:pgMar[^>]*\sw:right="(\d+)"/.exec(sec)?.[1]);
  const twips = pagina > 0 && esq >= 0 && dir >= 0 ? pagina - esq - dir : LARGURA_TEXTO_PADRAO_TWIPS;
  return (twips > 2000 ? twips : LARGURA_TEXTO_PADRAO_TWIPS) * EMU_POR_TWIP;
}

function paragrafoDaImagem({ rId, cx, cy, id, nome, descricao }) {
  return (
    '<w:p><w:pPr><w:keepNext w:val="1"/><w:spacing w:before="120" w:after="60" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>' +
    '<w:r><w:drawing>' +
    `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${id}" name="${escXml(nome)}" descr="${escXml(descricao)}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${escXml(nome)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
  );
}

const textoDoParagrafo = (p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => desescXml(m[1])).join('');

/**
 * Faixa [início, fim) do marcador "[INSERIR FIGURA N …]" no texto, respeitando colchetes aninhados
 * (o marcador pode conter "[PREENCHER: …]"). null se o parágrafo não tem esse marcador.
 */
function marcadorDeFigura(texto) {
  const m = /\[INSERIR FIGURA (\d+)/.exec(texto);
  if (!m) return null;
  let profundidade = 0;
  let fim = texto.length;
  for (let i = m.index; i < texto.length; i++) {
    if (texto[i] === '[') profundidade++;
    else if (texto[i] === ']' && --profundidade === 0) {
      fim = i + 1;
      break;
    }
  }
  return { numero: Number(m[1]), inicio: m.index, fim };
}

/**
 * @param {ArrayBuffer|Uint8Array|Buffer} docx   o .docx da peça (com os marcadores amarelos)
 * @param {Record<number, {bytes: Uint8Array, largura?: number, altura?: number, descricao?: string}>} imagens  PNG por número da figura
 * @returns {Promise<{ docx: Uint8Array, inseridas: number[], restantes: number[] }>}
 *   `restantes`: figuras que continuam como marcador amarelo (sem imagem ou com marcador misturado a outro texto)
 */
export async function inserirFigurasNoDocx(docx, imagens) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(docx);
  const arquivoDoc = zip.file('word/document.xml');
  if (!arquivoDoc) throw new Error('O Word da peça não pôde ser aberto.');
  let xml = await arquivoDoc.async('string');
  let rels = await zip.file('word/_rels/document.xml.rels').async('string');
  let tipos = await zip.file('[Content_Types].xml').async('string');

  const util = larguraUtilEmu(xml);
  const inseridas = [];
  const restantes = [];
  const novasRels = [];
  const temPng = /<Default\s[^>]*Extension="png"/i.test(tipos);
  let proximoId = 9000;

  xml = xml.replace(/<w:p(?:\s[^>]*?)?(?<!\/)>[\s\S]*?<\/w:p>/g, (paragrafo) => {
    if (!paragrafo.includes('INSERIR FIGURA')) return paragrafo;
    const texto = textoDoParagrafo(paragrafo);
    const marcador = marcadorDeFigura(texto);
    if (!marcador) return paragrafo;
    const imagem = imagens[marcador.numero];
    // só troca o parágrafo se ele É o marcador; com outro texto junto, deixa como está (não corrompe a peça)
    const sobra = (texto.slice(0, marcador.inicio) + texto.slice(marcador.fim)).trim();
    const dim = imagem?.largura && imagem?.altura ? { largura: imagem.largura, altura: imagem.altura } : dimensoesPng(imagem?.bytes);
    if (!imagem || !dim || sobra !== '' || inseridas.includes(marcador.numero)) {
      if (!restantes.includes(marcador.numero)) restantes.push(marcador.numero);
      return paragrafo;
    }
    const rId = `rIdFigura${marcador.numero}`;
    const alvo = `media/figura-${marcador.numero}.png`;
    zip.file(`word/${alvo}`, imagem.bytes);
    novasRels.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${alvo}"/>`);
    inseridas.push(marcador.numero);
    const { cx, cy } = tamanhoNoPapel(dim, util);
    return paragrafoDaImagem({
      rId,
      cx,
      cy,
      id: proximoId++,
      nome: `Figura ${marcador.numero}`,
      descricao: imagem.descricao || `Figura ${marcador.numero}`,
    });
  });

  if (inseridas.length > 0) {
    rels = rels.replace('</Relationships>', `${novasRels.join('')}</Relationships>`);
    if (!temPng) tipos = tipos.replace(/(<Types[^>]*>)/, '$1<Default Extension="png" ContentType="image/png"/>');
    zip.file('word/document.xml', xml);
    zip.file('word/_rels/document.xml.rels', rels);
    zip.file('[Content_Types].xml', tipos);
  }
  const saida = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { docx: saida, inseridas, restantes };
}

// ---------------------------------------------------------------------------------------------------------------------
// Do painel para o arquivo (navegador)
// ---------------------------------------------------------------------------------------------------------------------

const LARGURA_MAXIMA_PX = 1800; // print enviado pelo advogado maior que isso é reduzido (o Word não precisa de mais)

export function base64ParaBytes(base64) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Entrega um Blob como download no navegador. */
export function baixarBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "Peca.docx" → "Peca-com-figuras.docx" */
export function nomeComFiguras(nome) {
  return /\.docx$/i.test(nome || '') ? nome.replace(/\.docx$/i, '-com-figuras.docx') : `${nome || 'peca'}-com-figuras.docx`;
}

/** Converte qualquer imagem (JPG, WebP, PNG grande) em PNG, reduzindo se passar de 1800 px de largura. */
async function paraPng(blob) {
  const bitmap = await createImageBitmap(blob);
  const escala = Math.min(1, LARGURA_MAXIMA_PX / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparência vira branco: no Word o fundo da página é branco
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const saida = await new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Imagem inválida.'))), 'image/png'));
  return saida;
}

/**
 * Imagens confirmadas (Blob) → bytes PNG prontos para inserirFigurasNoDocx.
 * @param {Record<number, { blob: Blob, descricao?: string }>} imagens
 */
export async function prepararImagens(imagens) {
  const prontas = {};
  for (const [numero, i] of Object.entries(imagens)) {
    const png = i.blob.type === 'image/png' && i.blob.size < 6 * 1024 * 1024 ? i.blob : await paraPng(i.blob);
    prontas[numero] = { bytes: new Uint8Array(await png.arrayBuffer()), descricao: i.descricao };
  }
  return prontas;
}

/**
 * Monta o Word com as figuras confirmadas.
 * @param {{ nome: string, base64: string }} arquivo  o .docx devolvido pelo servidor
 * @param {Record<number, { blob: Blob }>} imagens    imagens confirmadas, por número da figura
 * @returns {Promise<{ blob: Blob, nome: string, inseridas: number[], restantes: number[] }>}
 */
export async function montarWordComFiguras(arquivo, imagens) {
  const r = await inserirFigurasNoDocx(base64ParaBytes(arquivo.base64), await prepararImagens(imagens));
  const blob = new Blob([r.docx], { type: arquivo.mime || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  return { blob, nome: nomeComFiguras(arquivo.nome), inseridas: r.inseridas, restantes: r.restantes };
}
