import { describe, it, expect } from 'vitest';
import { montarContextoLu, fonteParaCliente } from '../api/_lu-contexto.js';

const RESULTADO = {
  conclusoes: [{ id: 1, tipo: 'prescricao', severidade: 'favoravel', titulo: 'Prescrição consumada', resumo: 'Mais de cinco anos.', fundamento_legal: 'Art. 174 do CTN', confianca: 90 }],
  fatos_importantes: [{ id: 1, categoria: 'processual', data: '20/09/2025', descricao: 'Ajuizamento', fonte: 'cda.pdf', relevancia: 'critica' }],
  raciocinio: [{ id: 1, premissa: 'Prazo de cinco anos.', aplicacao: 'Datas.', conclusao_logica: 'Esgotado.', referencia: 'CTN art. 174' }],
  recomendacoes: ['Opor exceção.'],
};
const DOCS = [{ documento_nome: 'cda.pdf', pagina: 2, conteudo: 'Data de vencimento 30/04/2017', storage_path: 'u/c/cda.pdf', similaridade: 0.8 }];
const LEIS = [{ norma: 'CTN', identificador: 'art. 174', texto_integral: 'A ação prescreve em cinco anos.', similaridade: 0.9 }];
const PECA = { gerada_em: '2026-10-23T17:00:00.000Z', pecas: [{ modelo: 'EPE', tese: 'Prescrição', descricao: 'Texto.', data_referencia: '11/10/2026', campos_preencher: 2, figuras: 1, a_confirmar: 0, avisos: [] }] };

describe('montarContextoLu', () => {
  it('numera os blocos por tipo e monta o texto', () => {
    const c = montarContextoLu({ docs: DOCS, legislacao: LEIS, resultado: RESULTADO, pecaResumo: PECA });
    const ids = c.blocos.map((b) => b.id);
    expect(ids).toContain('D1');
    expect(ids).toContain('L1');
    expect(ids.filter((i) => i.startsWith('P')).length).toBe(4); // conclusão, fato, raciocínio, recomendação
    expect(ids).toContain('A1');
    expect(new Set(ids).size).toBe(ids.length);
    expect(c.texto).toContain('[D1] cda.pdf, pág. 2');
    expect(c.texto).toContain('Data de vencimento 30/04/2017');
    expect(c.texto).toContain('Art. 174 do CTN');
    expect(c.temFonteDoCaso).toBe(true);
  });
  it('sem peça: avisa no texto e não cria bloco A', () => {
    const c = montarContextoLu({ docs: DOCS, legislacao: [], resultado: RESULTADO, pecaResumo: null });
    expect(c.blocos.some((b) => b.id.startsWith('A'))).toBe(false);
    expect(c.texto).toContain('nenhuma peça foi gerada');
  });
  it('só legislação não é fonte do caso', () => {
    expect(montarContextoLu({ docs: [], legislacao: LEIS, resultado: null, pecaResumo: null }).temFonteDoCaso).toBe(false);
  });
  it('só o parecer já basta como fonte do caso', () => {
    expect(montarContextoLu({ docs: [], legislacao: [], resultado: RESULTADO, pecaResumo: null }).temFonteDoCaso).toBe(true);
  });
  it('parecer vazio ou ausente não gera blocos', () => {
    expect(montarContextoLu({ resultado: {} }).blocos).toEqual([]);
    expect(montarContextoLu({ resultado: null }).blocos).toEqual([]);
  });
  it('texto longo de um bloco é cortado', () => {
    const c = montarContextoLu({ docs: [{ documento_nome: 'x.pdf', pagina: 1, conteudo: 'a'.repeat(5000) }], resultado: null });
    expect(c.blocos[0].texto.length).toBeLessThanOrEqual(1500);
  });
});

describe('fonteParaCliente', () => {
  it('documento leva nome, página e caminho; trecho com no máximo 280 caracteres', () => {
    const c = montarContextoLu({ docs: [{ ...DOCS[0], conteudo: 'b'.repeat(900) }] });
    const f = fonteParaCliente(c.blocos[0], 1);
    expect(f).toMatchObject({ n: 1, tipo: 'documento', documento: 'cda.pdf', pagina: 2, storage_path: 'u/c/cda.pdf' });
    expect(f.trecho.length).toBe(280);
  });
  it('legislação leva norma e identificador', () => {
    const c = montarContextoLu({ legislacao: LEIS });
    expect(fonteParaCliente(c.blocos[0], 2)).toMatchObject({ n: 2, tipo: 'legislacao', norma: 'CTN', identificador: 'art. 174' });
  });
  it('parecer e peça levam o rótulo; fato leva o documento', () => {
    const c = montarContextoLu({ resultado: RESULTADO, pecaResumo: PECA });
    const fato = c.blocos.find((b) => b.rotulo === 'Parecer, fato 1');
    expect(fonteParaCliente(fato, 1)).toMatchObject({ rotulo: 'Parecer, fato 1', documento: 'cda.pdf' });
    const a = c.blocos.find((b) => b.tipo === 'peca');
    expect(fonteParaCliente(a, 2).rotulo).toBe('Resumo da peça, EPE');
  });
});
