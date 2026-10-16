import { describe, it, expect } from 'vitest';
import { agruparBloqueios, orientacaoBloqueios, resumoCurtoPeca } from '../api/_bloqueios-peca.js';

const FALTAM = 'faltam dados para o cálculo da prescrição (data de vencimento e data de entrega da declaração).';

describe('agruparBloqueios', () => {
  it('16 períodos com o mesmo motivo viram UMA frase com a contagem de períodos e CDAs', () => {
    const cdas = ['40.721.341-4', '39.694.103-6', '39.694.104-4', '39.694.105-2', '39.780.586-1', '40.110.843-0'];
    const bloqueios = Array.from({ length: 16 }, (_, i) => `${cdas[i % 6]} / ${String(i + 1).padStart(2, '0')}/2012 a ${String(i + 1).padStart(2, '0')}/2012: ${FALTAM}`);
    const r = agruparBloqueios(bloqueios);
    expect(r).toEqual(['Faltam dados para o cálculo da prescrição (data de vencimento e data de entrega da declaração) — 16 períodos em 6 CDAs.']);
  });

  it('um único período: mantém a mensagem original completa (com a CDA e o período)', () => {
    const b = `12 3 45 678901-23 / 2018: ${FALTAM}`;
    expect(agruparBloqueios([b])).toEqual([b]);
  });

  it('motivos diferentes ficam separados, na ordem em que aparecem; mensagens sem "CDA / período" passam como estão', () => {
    const r = agruparBloqueios([
      `A / 2018: ${FALTAM}`,
      'Crédito constituído por declaração do contribuinte: a tese de decadência não se aplica ao valor declarado.',
      `B / 2019: ${FALTAM}`,
      'A / 2018: modalidade de lançamento não identificada — exige análise manual.',
    ]);
    expect(r).toEqual([
      'Faltam dados para o cálculo da prescrição (data de vencimento e data de entrega da declaração) — 2 períodos em 2 CDAs.',
      'Crédito constituído por declaração do contribuinte: a tese de decadência não se aplica ao valor declarado.',
      'A / 2018: modalidade de lançamento não identificada — exige análise manual.',
    ]);
  });

  it('entrada inválida não lança', () => {
    expect(agruparBloqueios(undefined)).toEqual([]);
    expect(agruparBloqueios(null)).toEqual([]);
  });
});

describe('orientacaoBloqueios / resumoCurtoPeca', () => {
  it('faltou dado: orienta anexar os documentos e refazer a análise', () => {
    expect(orientacaoBloqueios([`A / 2018: ${FALTAM}`])).toMatch(/Anexe os documentos/);
    expect(orientacaoBloqueios(['Vencimento não identificado: necessário para contar a decadência pelo art. 173, I.'])).toMatch(/Anexe os documentos/);
  });

  it('sem orientação objetiva: vazio', () => {
    expect(orientacaoBloqueios([])).toBe('');
  });

  it('linha curta por tipo de motivo', () => {
    const t = { tese_nome: 'Prescrição ordinária', status: 'bloqueada', divergencias: [], mensagem: '' };
    expect(resumoCurtoPeca({ ...t, bloqueios: [`A / 2018: ${FALTAM}`] })).toBe('Prescrição ordinária — não gerada: faltam dados nos documentos.');
    expect(resumoCurtoPeca({ ...t, bloqueios: [], divergencias: ['O parecer salvo é favorável…'] })).toBe('Prescrição ordinária — não gerada: o cálculo diverge do parecer salvo.');
    expect(resumoCurtoPeca({ ...t, bloqueios: ['A / 2018: parcelamento em 10/05/2022 dentro do prazo — o caso exige análise manual.'] })).toBe('Prescrição ordinária — não gerada: o caso exige análise manual.');
    expect(resumoCurtoPeca({ ...t, tese_nome: 'Decadência', bloqueios: ['Crédito constituído por declaração do contribuinte: a tese…'] })).toMatch(/não se aplica/);
    expect(resumoCurtoPeca({ ...t, status: 'indisponivel', bloqueios: [] })).toMatch(/sem modelo disponível/);
  });
});
