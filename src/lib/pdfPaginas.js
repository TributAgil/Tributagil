// src/lib/pdfPaginas.js
//
// Abre um documento do caso (PDF ou imagem) no navegador e desenha/recorta páginas em canvas, para a tela de revisão das
// figuras. A biblioteca pdf.js é carregada SOB DEMANDA (import dinâmico): só quem abre uma figura no editor da peça baixa esse
// código; o resto do site não pesa nada.
//
// CSP do site (vercel.json): o worker do pdf.js é servido do próprio domínio (worker-src 'self') e `isEvalSupported:
// false` evita qualquer eval, que o script-src não permite.

import { caixaParaPixels, caixaSegura } from './figuras';

let pdfjsPromessa = null;

async function carregarPdfjs() {
  if (!pdfjsPromessa) {
    pdfjsPromessa = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = worker;
      return pdfjs;
    })().catch((err) => {
      pdfjsPromessa = null; // permite tentar de novo
      throw err;
    });
  }
  return pdfjsPromessa;
}

const novoCanvas = (largura, altura) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(largura));
  c.height = Math.max(1, Math.round(altura));
  return c;
};

const paraBlob = (canvas) =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar a imagem.'))), 'image/png'));

/**
 * @param {ArrayBuffer} buffer
 * @param {string} mime
 * @returns {Promise<{ numPaginas: number, desenhar: (canvas: HTMLCanvasElement, pagina: number, largura: number) => Promise<{largura: number, altura: number}>, recortar: (pagina: number, caixa: number[], larguraPagina?: number) => Promise<Blob>, fechar: () => void }>}
 */
export async function abrirDocumento(buffer, mime) {
  if (/^image\//i.test(mime)) return abrirImagem(buffer, mime);

  const pdfjs = await carregarPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)), isEvalSupported: false }).promise;

  const desenharPagina = async (canvas, pagina, larguraAlvo) => {
    const p = await pdf.getPage(pagina);
    const base = p.getViewport({ scale: 1 });
    const viewport = p.getViewport({ scale: larguraAlvo / base.width });
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await p.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return { largura: canvas.width, altura: canvas.height };
  };

  return {
    numPaginas: pdf.numPages,
    desenhar: desenharPagina,
    async recortar(pagina, caixa, larguraPagina = 1800) {
      const inteira = novoCanvas(1, 1);
      const { largura, altura } = await desenharPagina(inteira, pagina, larguraPagina);
      const r = caixaParaPixels(caixaSegura(caixa), largura, altura);
      const recorte = novoCanvas(r.largura, r.altura);
      recorte.getContext('2d').drawImage(inteira, r.x, r.y, r.largura, r.altura, 0, 0, r.largura, r.altura);
      return paraBlob(recorte);
    },
    fechar: () => pdf.destroy?.(),
  };
}

async function abrirImagem(buffer, mime) {
  const bitmap = await createImageBitmap(new Blob([buffer], { type: mime }));
  const desenharPagina = async (canvas, _pagina, larguraAlvo) => {
    const escala = larguraAlvo / bitmap.width;
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { largura: canvas.width, altura: canvas.height };
  };
  return {
    numPaginas: 1,
    desenhar: desenharPagina,
    async recortar(_pagina, caixa) {
      const r = caixaParaPixels(caixaSegura(caixa), bitmap.width, bitmap.height);
      const recorte = novoCanvas(r.largura, r.altura);
      recorte.getContext('2d').drawImage(bitmap, r.x, r.y, r.largura, r.altura, 0, 0, r.largura, r.altura);
      return paraBlob(recorte);
    },
    fechar: () => bitmap.close?.(),
  };
}
