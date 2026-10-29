import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { avaliarCaso } from '../scripts/casos-ficticios/montar-dados.mjs';
import { montarContexto } from '../api/_contexto-peca.js';
import { renderizarPeca, figurasDoDocx, contarMarcadores } from '../api/_render-peca.js';
import { inserirFigurasNoDocx } from '../src/lib/docxFiguras.js';
import {
  abrirPecaParaEdicao, montarDocxEditado, filhos, nivelDeTitulo, runsDosTrechos, listarPendencias, contarPendencias,
  textoDosTrechos, nomeEditado, bytesParaBase64, acharMarcadores,
} from '../src/lib/docxEdicao.js';
import { trechosParaHtml, dividirTrechos, alteracoesParaMontagem, contarAlteracoes } from '../src/lib/edicaoTexto.js';
import { escritorio } from './fixtures-peca.js';

const casos = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts', 'casos-ficticios', 'cenarios.json'), 'utf8'));
const parseBR = (s) => { const [d, m, a] = s.split('/').map(Number); return new Date(Date.UTC(a, m - 1, d)); };

const documentoXml = async (docx) => (await JSZip.loadAsync(docx)).file('word/document.xml').async('string');
const corpoDe = (xml) => xml.slice(xml.search(/<w:body(?:\s[^>]*)?>/), xml.lastIndexOf('</w:body>'));

/** Toda tag aberta é fechada, na ordem certa (o Word recusa o arquivo se não for). */
function xmlBemFormado(xml) {
  const pilha = [];
  for (const m of xml.matchAll(/<(\/?)([A-Za-z][\w.-]*(?::[\w.-]+)?)((?:\s[^>]*?)?)(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g)) {
    if (!m[2]) continue;
    if (m[1]) {
      if (pilha.pop() !== m[2]) return false;
    } else if (!m[4]) pilha.push(m[2]);
  }
  return pilha.length === 0;
}

const T = (texto, f = {}) => ({ texto, negrito: false, italico: false, sublinhado: false, ...f });

describe('edição da peça por tópicos', () => {
  const todas = [];
  it('gera as peças de todos os casos fictícios', async () => {
    for (const c of casos) {
      const { dados, pecas } = avaliarCaso(c);
      for (const p of pecas.filter((x) => x.status === 'ok')) {
        const contexto = montarContexto({ dados, avaliacao: p, escritorio, agora: parseBR(c.agora) });
        const docx = await renderizarPeca({ template: p.template, contexto });
        todas.push({ rotulo: `${c.id} ${p.template}`, template: p.template, docx, figuras: await figurasDoDocx(docx, contexto.figuras_meta) });
      }
    }
    expect(todas.length).toBeGreaterThanOrEqual(19);
  }, 120000);

  it('divide cada peça nos tópicos do modelo, sem perder nem repetir parágrafo', async () => {
    for (const p of todas) {
      const { blocos, topicos } = await abrirPecaParaEdicao(p.docx);
      const titulos = topicos.map((t) => t.titulo);
      expect(titulos, p.rotulo).toContain('DOS FATOS');
      expect(titulos, p.rotulo).toContain('DOS PEDIDOS');
      expect(titulos.some((t) => /^DA (PRESCRIÇÃO|DECADÊNCIA)/.test(t)), p.rotulo).toBe(true);
      const ids = topicos.flatMap((t) => t.blocos);
      expect(ids, p.rotulo).toEqual(blocos.map((b) => b.id));
      // fora tabelas, figuras e legendas numeradas pelo Word, praticamente todo parágrafo com texto é editável
      const texto = blocos.filter((b) => b.tipo === 'paragrafo' && b.texto.trim() && !b.figura && !/^Figura \d/.test(b.texto));
      expect(texto.filter((b) => b.editavel).length / texto.length, p.rotulo).toBeGreaterThan(0.95);
    }
  });

  it('sem alteração, o Word sai idêntico', async () => {
    for (const p of todas) {
      const { fonte } = await abrirPecaParaEdicao(p.docx);
      expect(await documentoXml(await montarDocxEditado(fonte, {})), p.rotulo).toBe(await documentoXml(p.docx));
    }
  });

  it('as pendências batem com a contagem do servidor', async () => {
    for (const p of todas) {
      const { blocos } = await abrirPecaParaEdicao(p.docx);
      const c = contarPendencias(listarPendencias(blocos));
      const servidor = await contarMarcadores(p.docx);
      expect(c, p.rotulo).toEqual({ preencher: servidor.preencher, confirmar: servidor.confirmar, figuras: servidor.figuras });
    }
  });

  it('alterar, remover e acrescentar mexe só nesses parágrafos e o arquivo continua íntegro', async () => {
    for (const p of todas) {
      const { blocos, fonte } = await abrirPecaParaEdicao(p.docx);
      const editaveis = blocos.filter((b) => b.editavel && !b.vazio && !b.titulo);
      const [alvo, removido] = [editaveis[2], editaveis[5]];
      const titulo = blocos.find((b) => b.titulo === 1 && b.editavel && b.texto.startsWith('DOS FATOS'));
      const tabela = blocos.find((b) => b.tipo === 'tabela');
      const figura = blocos.find((b) => b.figura);

      const saida = await montarDocxEditado(fonte, {
        [alvo.id]: { trechos: [T('Texto alterado pelo advogado, '), T('em negrito', { negrito: true }), T(' e [PREENCHER: dado novo].')], depois: [[T('Parágrafo acrescentado.')]] },
        [removido.id]: { removido: true },
        [titulo.id]: { trechos: [T('DOS FATOS E DO DIREITO', { negrito: true })] },
        // tabela e figura não são editáveis: a alteração é ignorada
        ...(tabela ? { [tabela.id]: { removido: true } } : {}),
        ...(figura ? { [figura.id]: { trechos: [T('apagado')] } } : {}),
      });

      const xml = await documentoXml(saida);
      expect(xmlBemFormado(xml), p.rotulo).toBe(true);
      const depois = await abrirPecaParaEdicao(saida);
      const textos = depois.blocos.map((b) => b.texto);
      expect(textos, p.rotulo).toContain('Texto alterado pelo advogado, em negrito e [PREENCHER: dado novo].');
      expect(textos, p.rotulo).toContain('Parágrafo acrescentado.');
      expect(textos, p.rotulo).toContain('DOS FATOS E DO DIREITO');
      expect(textos.includes(removido.texto), p.rotulo).toBe(false);
      expect(depois.topicos.map((t) => t.titulo), p.rotulo).toContain('DOS FATOS E DO DIREITO');
      if (tabela) expect(depois.blocos.filter((b) => b.tipo === 'tabela').length).toBe(blocos.filter((b) => b.tipo === 'tabela').length);
      if (figura) expect(textos).toContain(figura.texto);

      // os demais elementos do corpo saem byte a byte como vieram
      const antes = filhos(corpoDe(await documentoXml(p.docx)).replace(/^<w:body[^>]*>/, '')).map((e) => e.xml);
      const agora = new Set(filhos(corpoDe(xml).replace(/^<w:body[^>]*>/, '')).map((e) => e.xml));
      const mexidos = new Set([alvo.id, removido.id, titulo.id]);
      antes.forEach((x, i) => {
        if (!mexidos.has(i)) expect(agora.has(x), `${p.rotulo}: elemento ${i} mudou`).toBe(true);
      });

      // o parágrafo novo não repete o id de parágrafo do Word do original (o modelo já repete os dos laços do template)
      const repetidos = (x) => { const ids = [...x.matchAll(/w14:paraId="([^"]+)"/g)].map((m) => m[1]); return ids.length - new Set(ids).size; };
      expect(repetidos(xml), p.rotulo).toBeLessThanOrEqual(repetidos(await documentoXml(p.docx)));
    }
  });

  it('nota de rodapé, numeração da legenda e data automática viram etiqueta: o texto em volta é editável e o elemento sai intacto', async () => {
    const p = todas.find((x) => x.template === 'EPE_prescricao_ordinaria');
    const { blocos, fonte } = await abrirPecaParaEdicao(p.docx);
    const comNota = blocos.find((b) => b.objetos.some((o) => o.rotulo === 'nota de rodapé'));
    const legenda = blocos.find((b) => /^Figura \d/.test(b.texto) && b.objetos.length);
    expect(comNota?.editavel).toBe(true);
    expect(legenda?.editavel).toBe(true);
    const nota = comNota.trechos.find((t) => /[-]/.test(t.texto)).texto.match(/[-]/)[0];

    const saida = await montarDocxEditado(fonte, {
      [comNota.id]: { trechos: [T(`Pedido reescrito${nota}.`)] },
      [legenda.id]: { trechos: [...legenda.trechos.map((t) => ({ ...t, texto: t.texto.replace('Excerto', 'Trecho') }))] },
    });
    const xml = await documentoXml(saida);
    expect(xmlBemFormado(xml)).toBe(true);
    const original = await documentoXml(p.docx);
    // a referência da nota (e a nota em si, em footnotes.xml) continuam lá; a numeração SEQ da legenda também
    expect(xml.match(/<w:footnoteReference/g)?.length).toBe(original.match(/<w:footnoteReference/g)?.length);
    expect(xml.match(/SEQ Figura/g)?.length).toBe(original.match(/SEQ Figura/g)?.length);
    const depois = await abrirPecaParaEdicao(saida);
    expect(depois.blocos.map((b) => b.texto)).toContain('Pedido reescrito¹.');
    expect(depois.blocos.some((b) => b.texto.startsWith('Figura 1 - Trecho'))).toBe(true);
  });

  it('o assistente de figuras continua funcionando sobre a peça editada', async () => {
    const p = todas.find((x) => x.figuras.length >= 3);
    const { blocos, fonte } = await abrirPecaParaEdicao(p.docx);
    const alvo = blocos.find((b) => b.editavel && !b.vazio && !b.titulo);
    const editado = await montarDocxEditado(fonte, { [alvo.id]: { trechos: [T('Alterado.')] } });
    const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    const r = await inserirFigurasNoDocx(editado, Object.fromEntries(p.figuras.map((f) => [f.numero, { bytes: png }])));
    expect(r.restantes).toEqual([]);
    expect(r.inseridas.length).toBe(p.figuras.length);
  });
});

describe('peças de baixo nível', () => {
  it('títulos: curtos, todo em negrito, sem pontuação final', () => {
    expect(nivelDeTitulo([T('DOS FATOS ', { negrito: true })])).toBe(1);
    expect(nivelDeTitulo([T('Da prescrição da CDA nº 12 3 45', { negrito: true })])).toBe(2);
    expect(nivelDeTitulo([T('DOS FATOS', { negrito: true }), T(' e mais', { negrito: false })])).toBe(0);
    expect(nivelDeTitulo([T('Termos em que pede deferimento.', { negrito: true })])).toBe(0);
    expect(nivelDeTitulo([T('Figura 1 - Excerto do recibo', { negrito: true })])).toBe(0);
    expect(nivelDeTitulo([T('Advogada Um | OAB BA 11.111', { negrito: true })])).toBe(0);
    expect(nivelDeTitulo([T('[PREENCHER: nome]', { negrito: true })])).toBe(0);
  });

  it('runs: mantém fonte e tamanho do original, ordem do schema e destaque só no marcador', () => {
    const base = '<w:rPr><w:rFonts w:ascii="Quicksand"/><w:b/><w:sz w:val="21"/><w:highlight w:val="yellow"/><w:lang w:eastAsia="pt-BR"/></w:rPr>';
    const xml = runsDosTrechos([T('a '), T('b', { negrito: true, sublinhado: true }), T(' [CONFIRMAR: x] & <c>')], base);
    const runs = xml.match(/<w:r>[\s\S]*?<\/w:r>/g);
    expect(runs).toHaveLength(5);
    expect(runs[0]).toBe('<w:r><w:rPr><w:rFonts w:ascii="Quicksand"/><w:sz w:val="21"/><w:lang w:eastAsia="pt-BR"/></w:rPr><w:t xml:space="preserve">a </w:t></w:r>');
    expect(runs[1]).toContain('<w:rFonts w:ascii="Quicksand"/><w:b/><w:bCs/><w:sz w:val="21"/><w:u w:val="single"/><w:lang');
    expect(runs[2]).not.toContain('highlight');
    expect(runs[3]).toContain('<w:sz w:val="21"/><w:highlight w:val="yellow"/><w:lang');
    expect(runs[3]).toContain('>[CONFIRMAR: x]<');
    expect(runs[4]).toContain('> &amp; &lt;c&gt;<');
  });

  it('tabulação e quebra de linha viram os elementos do Word', () => {
    const xml = runsDosTrechos([T('a\tb\nc')]);
    expect(xml).toContain('<w:tab/>');
    expect(xml).toContain('<w:br/>');
  });

  it('marcadores aninhados contam como um', () => {
    expect(acharMarcadores('x [INSERIR FIGURA 1 – a, fonte: [PREENCHER: b]] y').map(([a, b, t]) => t)).toEqual(['figura']);
  });

  it('texto da tela: HTML escapado, marcador destacado, formatação preservada', () => {
    expect(trechosParaHtml([T('a <b> '), T('[PREENCHER: x]', { negrito: true })])).toBe('a &lt;b&gt; <mark><b>[PREENCHER: x]</b></mark>');
    expect(trechosParaHtml([T('linha 1\nlinha 2', { italico: true })])).toBe('<i>linha 1<br>linha 2</i>');
    expect(trechosParaHtml([])).toBe('<br>');
  });

  it('Enter no meio divide o parágrafo mantendo a formatação de cada lado', () => {
    const [a, b] = dividirTrechos([T('abc'), T('def', { negrito: true })], 4);
    expect(textoDosTrechos(a)).toBe('abcd');
    expect(a[1]).toMatchObject({ texto: 'd', negrito: true });
    expect(b).toEqual([T('ef', { negrito: true })]);
    expect(dividirTrechos([T('abc')], 99)[1]).toEqual([]);
  });

  it('estado da tela: texto que voltou ao original e parágrafo novo vazio não contam', () => {
    const blocos = [{ id: 1, trechos: [T('igual')] }, { id: 2, trechos: [T('x')] }, { id: 3, trechos: [T('y')] }];
    const alt = alteracoesParaMontagem(
      {
        1: { trechos: [T('igual')], novos: [{ chave: 'n', trechos: [T('  ')] }] },
        2: { trechos: [T('mudou')], novos: [{ chave: 'm', trechos: [T('novo')] }] },
        3: { removido: true },
        9: { removido: true },
      },
      blocos,
    );
    expect(alt).toEqual({ 2: { trechos: [T('mudou')], depois: [[T('novo')]] }, 3: { removido: true } });
    expect(contarAlteracoes(alt)).toBe(3);
  });

  it('nome do arquivo e base64', () => {
    expect(nomeEditado('EPE-Maria.docx')).toBe('EPE-Maria-editada.docx');
    expect(nomeEditado('EPE-Maria-editada.docx')).toBe('EPE-Maria-editada.docx');
    const bytes = new Uint8Array(100000).map((_, i) => i % 256);
    expect(Buffer.from(bytesParaBase64(bytes), 'base64').equals(Buffer.from(bytes))).toBe(true);
  });
});
