import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { avaliarCaso } from '../scripts/casos-ficticios/montar-dados.mjs';
import { montarContexto } from '../api/_contexto-peca.js';
import { renderizarPeca, figurasDoDocx, contarMarcadores } from '../api/_render-peca.js';
import { escritorio } from './fixtures-peca.js';
import { criarSupabaseFalso } from './supabase-falso.js';

// o app importa o cliente de src/lib/supabase.ts; aqui ele vira o falso, em memória
const falso = { atual: null };
vi.mock('../src/lib/supabase', () => ({
  get supabase() {
    return falso.atual.supabase;
  },
}));

const { salvarPecasGeradas, salvarVersao, carregarPecasSalvas, apagarPecasDaAnalise, salvarLocalizacao } = await import('../src/lib/pecasSalvas.js');
const { montarPecaRevisada } = await import('../src/lib/pecaRevisada.js');
const { abrirPecaParaEdicao } = await import('../src/lib/docxEdicao.js');

const USUARIO = 'usuario-a';
const ANALISE = 'analise-1';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const png = () => new Blob([PNG], { type: 'image/png' });
const T = (texto, f = {}) => ({ texto, negrito: false, italico: false, sublinhado: false, ...f });

// uma peça de verdade (caso fictício P01, com figuras), no formato que /api/gerar-peca devolve
let pecaGerada;
beforeAll(async () => {
  const casos = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts', 'casos-ficticios', 'cenarios.json'), 'utf8'));
  const c = casos.find((x) => x.id === 'P01');
  const { dados, pecas } = avaliarCaso(c);
  const p = pecas.find((x) => x.status === 'ok');
  const [d, m, a] = c.agora.split('/').map(Number);
  const contexto = montarContexto({ dados, avaliacao: p, escritorio, agora: new Date(Date.UTC(a, m - 1, d)) });
  const docx = await renderizarPeca({ template: p.template, contexto });
  const marcadores = await contarMarcadores(docx);
  pecaGerada = {
    tese: p.tese,
    tese_nome: 'Prescrição ordinária',
    status: 'ok',
    template: p.template,
    resumo: { modelo: 'Exceção de Pré-Executividade', tese: 'Prescrição ordinária', campos_preencher: marcadores.preencher, figuras: marcadores.figuras, avisos: [] },
    figuras: await figurasDoDocx(docx, contexto.figuras_meta),
    arquivo: { nome: 'EPE-P01.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', base64: docx.toString('base64') },
  };
  expect(pecaGerada.figuras.length).toBeGreaterThan(2);
}, 60000);

beforeEach(() => {
  falso.atual = criarSupabaseFalso({ userId: USUARIO });
});

const arquivosDoBucket = () => [...falso.atual.arquivos.keys()].filter((k) => k.startsWith('pecas/'));

describe('peças salvas no banco', () => {
  it('ao gerar, grava o Word original na pasta do usuário e reabre sem IA, igual', async () => {
    const r = await salvarPecasGeradas({ userId: USUARIO, analiseId: ANALISE, pecas: [pecaGerada] });
    expect(r.ok).toBe(true);
    const id = r.salvas[pecaGerada.tese].id;
    expect(arquivosDoBucket()).toEqual([`pecas/${USUARIO}/${ANALISE}/${id}/original.docx`]);
    expect(falso.atual.db.pecas[0]).toMatchObject({ user_id: USUARIO, analise_id: ANALISE, tese: pecaGerada.tese, template: pecaGerada.template });

    const [salva] = await carregarPecasSalvas(ANALISE);
    expect(salva.arquivo.base64).toBe(pecaGerada.arquivo.base64);
    expect(salva.figuras).toEqual(pecaGerada.figuras);
    expect(salva.resumo.modelo).toBe('Exceção de Pré-Executividade');
    expect(salva.tese_nome).toBe('Prescrição ordinária');
    expect(salva.ultima).toBeNull();
  });

  it('gerar de novo substitui: a peça anterior, as versões e os arquivos dela somem', async () => {
    const primeira = await salvarPecasGeradas({ userId: USUARIO, analiseId: ANALISE, pecas: [pecaGerada] });
    const idAntigo = primeira.salvas[pecaGerada.tese].id;
    await salvarVersao({ userId: USUARIO, analiseId: ANALISE, pecaId: idAntigo, estado: {}, total: 0, imagens: { 1: { blob: png() } }, figurasConfirmadas: 1 });
    expect(arquivosDoBucket().length).toBe(2);

    const segunda = await salvarPecasGeradas({ userId: USUARIO, analiseId: ANALISE, pecas: [pecaGerada] });
    const idNovo = segunda.salvas[pecaGerada.tese].id;
    expect(idNovo).not.toBe(idAntigo);
    expect(falso.atual.db.pecas.map((p) => p.id)).toEqual([idNovo]);
    expect(falso.atual.db.pecas_versoes).toEqual([]);
    expect(arquivosDoBucket()).toEqual([`pecas/${USUARIO}/${ANALISE}/${idNovo}/original.docx`]);
  });

  it('cada "Aplicar" vira uma versão; ficam as 3 últimas; imagem já salva não sobe de novo', async () => {
    const { salvas } = await salvarPecasGeradas({ userId: USUARIO, analiseId: ANALISE, pecas: [pecaGerada] });
    const pecaId = salvas[pecaGerada.tese].id;
    const base = { userId: USUARIO, analiseId: ANALISE, pecaId };

    const v1 = await salvarVersao({ ...base, estado: { 5: { removido: true } }, total: 1, imagens: { 1: { blob: png(), origem: 'recorte', documento: 'P01.pdf', pagina: 2, caixa: [1, 2, 3, 4] } }, figurasConfirmadas: 1 });
    expect(v1).toMatchObject({ ok: true, versao: 1 });
    const caminho = v1.imagens[1].path;
    expect(caminho).toMatch(new RegExp(`^${USUARIO}/${ANALISE}/${pecaId}/figuras/1-\\d+\\.png$`));
    const uploadsAntes = falso.atual.chamadas.filter((c) => c[0] === 'upload').length;

    // a próxima versão reaproveita a imagem pelo caminho (o modal devolve as imagens com `path`)
    for (let i = 2; i <= 4; i++) {
      const v = await salvarVersao({ ...base, estado: { 5: { removido: true }, marca: i }, total: 1, imagens: v1.imagens, figurasConfirmadas: 1 });
      expect(v.versao).toBe(i);
    }
    expect(falso.atual.chamadas.filter((c) => c[0] === 'upload').length).toBe(uploadsAntes);
    expect(falso.atual.db.pecas_versoes.map((v) => v.numero)).toEqual([2, 3, 4]);

    const [salva] = await carregarPecasSalvas(ANALISE);
    expect(salva.versao).toBe(4);
    expect(salva.ultima.estado).toEqual({ 5: { removido: true }, marca: 4 });
    expect(salva.ultima.imagens[1]).toMatchObject({ path: caminho, origem: 'recorte', documento: 'P01.pdf', pagina: 2, caixa: [1, 2, 3, 4] });
    expect(salva.ultima.imagens[1].blob.size).toBe(PNG.length);
  });

  it('a busca das figuras fica guardada na peça (reabrir não chama o Gemini)', async () => {
    const { salvas } = await salvarPecasGeradas({ userId: USUARIO, analiseId: ANALISE, pecas: [pecaGerada] });
    const localizacao = { resultados: { 1: { numero: 1, pagina: 3 } }, documentos: [{ storage_path: 'x.pdf' }] };
    expect(await salvarLocalizacao({ pecaId: salvas[pecaGerada.tese].id, localizacao })).toBe(true);
    const [salva] = await carregarPecasSalvas(ANALISE);
    expect(salva.localizacao).toEqual(localizacao);
  });

  it('a versão salva remonta o mesmo Word revisado: figuras só com todas confirmadas', async () => {
    const { salvas } = await salvarPecasGeradas({ userId: USUARIO, analiseId: ANALISE, pecas: [pecaGerada] });
    const pecaId = salvas[pecaGerada.tese].id;
    const aberta = await abrirPecaParaEdicao(Buffer.from(pecaGerada.arquivo.base64, 'base64'));
    const alvo = aberta.blocos.find((b) => b.editavel && !b.vazio && !b.titulo);
    const estado = { [alvo.id]: { trechos: [T('Parágrafo reescrito pelo advogado.')] } };

    // só uma figura confirmada: o Word sai com o texto editado e TODOS os marcadores de figura
    await salvarVersao({ userId: USUARIO, analiseId: ANALISE, pecaId, estado, total: 1, imagens: { [pecaGerada.figuras[0].numero]: { blob: png() } }, figurasConfirmadas: 1 });
    let [salva] = await carregarPecasSalvas(ANALISE);
    let r = await montarPecaRevisada({ arquivo: salva.arquivo, estado: salva.ultima.estado, imagens: salva.ultima.imagens, figuras: salva.figuras });
    expect(r).toMatchObject({ total: 1, figurasNoWord: false, figurasConfirmadas: 1 });
    expect(r.contagem.figuras).toBe(pecaGerada.figuras.length);
    let xml = await (await JSZip.loadAsync(Buffer.from(r.arquivo.base64, 'base64'))).file('word/document.xml').async('string');
    expect(xml).toContain('Parágrafo reescrito pelo advogado.');
    expect(xml.match(/INSERIR FIGURA/g)?.length).toBe(pecaGerada.figuras.length);
    expect(r.arquivo.nome).toBe('EPE-P01-editada.docx');

    // todas confirmadas: as imagens entram e nenhum marcador sobra
    const todas = Object.fromEntries(pecaGerada.figuras.map((f) => [f.numero, { blob: png() }]));
    await salvarVersao({ userId: USUARIO, analiseId: ANALISE, pecaId, estado, total: 1, imagens: todas, figurasConfirmadas: pecaGerada.figuras.length });
    [salva] = await carregarPecasSalvas(ANALISE);
    r = await montarPecaRevisada({ arquivo: salva.arquivo, estado: salva.ultima.estado, imagens: salva.ultima.imagens, figuras: salva.figuras });
    expect(r).toMatchObject({ figurasNoWord: true, figurasConfirmadas: pecaGerada.figuras.length });
    expect(r.contagem.figuras).toBe(0);
    xml = await (await JSZip.loadAsync(Buffer.from(r.arquivo.base64, 'base64'))).file('word/document.xml').async('string');
    expect(xml.includes('INSERIR FIGURA')).toBe(false);
    expect(r.arquivo.nome).toBe('EPE-P01-editada-com-figuras.docx');
  });

  it('sem edição nem figuras, não há Word revisado (o download usa o original)', async () => {
    const r = await montarPecaRevisada({ arquivo: pecaGerada.arquivo, estado: {}, imagens: {}, figuras: pecaGerada.figuras });
    expect(r.arquivo).toBeNull();
    expect(r.total).toBe(0);
  });

  it('excluir a análise apaga as peças, as versões e todos os arquivos delas', async () => {
    const { salvas } = await salvarPecasGeradas({ userId: USUARIO, analiseId: ANALISE, pecas: [pecaGerada] });
    await salvarVersao({ userId: USUARIO, analiseId: ANALISE, pecaId: salvas[pecaGerada.tese].id, estado: {}, total: 0, imagens: { 1: { blob: png() }, 2: { blob: png() } }, figurasConfirmadas: 2 });
    expect(arquivosDoBucket().length).toBe(3);
    expect(await apagarPecasDaAnalise({ analiseId: ANALISE })).toBe(true);
    expect(falso.atual.db.pecas).toEqual([]);
    expect(falso.atual.db.pecas_versoes).toEqual([]);
    expect(arquivosDoBucket()).toEqual([]);
  });

  it('se a linha não grava, o arquivo enviado é removido (não fica órfão) e a tela segue sem salvar', async () => {
    falso.atual = criarSupabaseFalso({ userId: USUARIO, falhas: { 'pecas.insert': true } });
    const r = await salvarPecasGeradas({ userId: USUARIO, analiseId: ANALISE, pecas: [pecaGerada] });
    expect(r.ok).toBe(false);
    expect(r.salvas).toEqual({});
    expect(arquivosDoBucket()).toEqual([]);
  });

  it('falha ao salvar a versão não quebra: devolve ok false', async () => {
    const { salvas } = await salvarPecasGeradas({ userId: USUARIO, analiseId: ANALISE, pecas: [pecaGerada] });
    falso.atual.supabase.rpc = async () => ({ data: null, error: { message: 'fora do ar' } });
    const r = await salvarVersao({ userId: USUARIO, analiseId: ANALISE, pecaId: salvas[pecaGerada.tese].id, estado: {}, total: 0, imagens: {}, figurasConfirmadas: 0 });
    expect(r.ok).toBe(false);
  });

  it('sem tabela ou sem acesso, reabrir só não traz nada', async () => {
    falso.atual = criarSupabaseFalso({ userId: USUARIO, falhas: { 'pecas.select': true } });
    expect(await carregarPecasSalvas(ANALISE)).toEqual([]);
  });
});
