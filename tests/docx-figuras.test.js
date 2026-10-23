import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import JSZip from 'jszip';
import { avaliarCaso } from '../scripts/casos-ficticios/montar-dados.mjs';
import { montarContexto } from '../api/_contexto-peca.js';
import { renderizarPeca, figurasDoDocx, contarMarcadores } from '../api/_render-peca.js';
import { inserirFigurasNoDocx, dimensoesPng, tamanhoNoPapel, nomeComFiguras, base64ParaBytes, montarWordComFiguras } from '../src/lib/docxFiguras.js';
import { escritorio } from './fixtures-peca.js';

// PNG sólido válido, gerado sem dependência
function crc32(buf) {
  let c;
  let crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function pngSolido(largura, altura) {
  const bloco = (tipo, dados) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo), dados]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(corpo));
    return Buffer.concat([len, corpo, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(largura * 3, 200)]);
  const bruto = Buffer.concat(Array.from({ length: altura }, () => linha));
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(bruto)), bloco('IEND', Buffer.alloc(0))]));
}

const casos = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts', 'casos-ficticios', 'cenarios.json'), 'utf8'));
const parseBR = (s) => { const [d, m, a] = s.split('/').map(Number); return new Date(Date.UTC(a, m - 1, d)); };

const paragrafos = (xml) => xml.match(/<w:p(?:\s[^>]*?)?(?<!\/)>[\s\S]*?<\/w:p>/g) || [];
const texto = (p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
const textosSemFigura = (xml) => paragrafos(xml).filter((p) => !p.includes('r:embed="rIdFigura')).map(texto);

describe('PNG e tamanho no papel', () => {
  it('lê as dimensões do cabeçalho', () => {
    expect(dimensoesPng(pngSolido(120, 45))).toEqual({ largura: 120, altura: 45 });
    expect(dimensoesPng(new Uint8Array(30))).toBeNull();
  });
  it('mantém o tamanho natural quando cabe e encolhe proporcionalmente quando não cabe', () => {
    const util = 15 * 360000;
    const pequena = tamanhoNoPapel({ largura: 432, altura: 216 }, util); // 2 pol. x 1 pol.
    expect(pequena).toEqual({ cx: 2 * 914400, cy: 914400 });
    const larga = tamanhoNoPapel({ largura: 3600, altura: 1800 }, util);
    expect(larga.cx).toBe(util);
    expect(larga.cy).toBe(util / 2);
    const alta = tamanhoNoPapel({ largura: 400, altura: 4000 }, util);
    expect(alta.cy).toBeLessThanOrEqual(20 * 360000);
    expect(alta.cx / alta.cy).toBeCloseTo(0.1, 2);
  });
});

describe('nome e base64', () => {
  it('nome do arquivo com figuras', () => {
    expect(nomeComFiguras('Excecao-P01.docx')).toBe('Excecao-P01-com-figuras.docx');
    expect(nomeComFiguras('')).toBe('peca-com-figuras.docx');
  });
  it('base64 vira bytes', () => {
    expect([...base64ParaBytes(Buffer.from([1, 2, 255]).toString('base64'))]).toEqual([1, 2, 255]);
  });
});

describe('inserir as figuras no Word da peça', () => {
  const todas = [];
  it('gera as peças de todos os casos fictícios', async () => {
    for (const c of casos) {
      const { dados, pecas } = avaliarCaso(c);
      for (const p of pecas.filter((x) => x.status === 'ok')) {
        const contexto = montarContexto({ dados, avaliacao: p, escritorio, agora: parseBR(c.agora) });
        const docx = await renderizarPeca({ template: p.template, contexto });
        todas.push({ caso: c.id, template: p.template, docx, figuras: await figurasDoDocx(docx, contexto.figuras_meta) });
      }
    }
    expect(todas.length).toBeGreaterThanOrEqual(19);
  }, 120000);

  it('com todas as imagens: nenhum marcador de figura sobra, o texto do modelo não muda e o arquivo continua íntegro', async () => {
    for (const p of todas) {
      const imagens = Object.fromEntries(p.figuras.map((f, i) => [f.numero, { bytes: pngSolido(300 + i * 40, 120 + i * 10) }]));
      const antes = await JSZip.loadAsync(p.docx);
      const xmlAntes = await antes.file('word/document.xml').async('string');

      const r = await inserirFigurasNoDocx(p.docx, imagens);
      const rotulo = `${p.caso} ${p.template}`;
      expect(r.inseridas.sort((a, b) => a - b), rotulo).toEqual(p.figuras.map((f) => f.numero));
      expect(r.restantes, rotulo).toEqual([]);

      const zip = await JSZip.loadAsync(r.docx);
      const xml = await zip.file('word/document.xml').async('string');
      expect(xml.match(/<w:drawing>/g)?.length ?? 0, rotulo).toBeGreaterThanOrEqual(p.figuras.length);
      expect(xml.includes('INSERIR FIGURA'), rotulo).toBe(false);
      // as imagens estão no pacote, ligadas por relação e cobertas por Content_Types
      for (const f of p.figuras) {
        expect(zip.file(`word/media/figura-${f.numero}.png`), rotulo).toBeTruthy();
        expect(xml).toContain(`r:embed="rIdFigura${f.numero}"`);
      }
      if (p.figuras.length > 0) {
        expect(await zip.file('word/_rels/document.xml.rels').async('string')).toContain('rIdFigura1');
        expect(await zip.file('[Content_Types].xml').async('string')).toMatch(/Extension="png"/);
      }
      // ids de desenho não se repetem
      const ids = [...xml.matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size, rotulo).toBe(ids.length);
      // o texto do modelo continua igual: só somem os parágrafos de marcador
      const antesTxt = paragrafos(xmlAntes).map(texto).filter((t) => !t.includes('[INSERIR FIGURA'));
      expect(textosSemFigura(xml).filter((t) => t !== ''), rotulo).toEqual(antesTxt.filter((t) => t !== ''));
      // a legenda "Figura N" do modelo continua logo depois da imagem
      if (p.figuras.length > 0) expect(xml).toMatch(/rIdFigura1[\s\S]*?<\/w:p>\s*<w:p[\s\S]*?Figura 1/);
    }
  }, 120000);

  it('só as figuras confirmadas entram: as outras mantêm o marcador amarelo', async () => {
    const p = todas.find((x) => x.figuras.length >= 3);
    const r = await inserirFigurasNoDocx(p.docx, { 1: { bytes: pngSolido(300, 100) }, 3: { bytes: pngSolido(300, 100) } });
    expect(r.inseridas.sort()).toEqual([1, 3]);
    expect(r.restantes).toEqual([2, ...p.figuras.map((f) => f.numero).filter((n) => n > 3)]);
    const marcadores = await contarMarcadores(Buffer.from(r.docx));
    expect(marcadores.figuras).toBe(p.figuras.length - 2);
    const xml = await (await JSZip.loadAsync(r.docx)).file('word/document.xml').async('string');
    expect(xml).toContain('[INSERIR FIGURA 2');
    expect(xml).not.toContain('[INSERIR FIGURA 1');
  });

  it('sem nenhuma imagem devolve o Word como estava (mesmos marcadores)', async () => {
    const p = todas[0];
    const r = await inserirFigurasNoDocx(p.docx, {});
    expect(r.inseridas).toEqual([]);
    expect((await contarMarcadores(Buffer.from(r.docx))).figuras).toBe(p.figuras.length);
  });

  it('imagem inválida (sem dimensões) não corrompe: o marcador fica', async () => {
    const p = todas[0];
    const r = await inserirFigurasNoDocx(p.docx, { 1: { bytes: new Uint8Array([1, 2, 3]) } });
    expect(r.inseridas).toEqual([]);
    expect(r.restantes).toContain(1);
  });
});

describe('montarWordComFiguras (caminho do painel)', () => {
  it('recebe o arquivo do servidor em base64 e devolve o Word com a figura', async () => {
    const { dados, pecas } = avaliarCaso(casos.find((c) => c.id === 'P03'));
    const p = pecas.find((x) => x.status === 'ok');
    const contexto = montarContexto({ dados, avaliacao: p, escritorio, agora: parseBR(casos.find((c) => c.id === 'P03').agora) });
    const docx = await renderizarPeca({ template: p.template, contexto });
    const png = pngSolido(500, 200);
    const r = await montarWordComFiguras(
      { nome: 'Peca.docx', mime: 'x', base64: docx.toString('base64') },
      { 1: { blob: new Blob([png], { type: 'image/png' }), descricao: 'Figura 1 - recibo' } },
    );
    expect(r.nome).toBe('Peca-com-figuras.docx');
    expect(r.inseridas).toEqual([1]);
    const xml = await (await JSZip.loadAsync(await r.blob.arrayBuffer())).file('word/document.xml').async('string');
    expect(xml).toContain('descr="Figura 1 - recibo"');
  });
});
