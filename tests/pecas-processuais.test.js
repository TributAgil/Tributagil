import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import JSZip from 'jszip';
import { somarDiasUteis, somarDiasCorridos, calcularPrazo, pecaEmbargos, pecaAgravo, pecaReconhecimento, materiasDeDefesa } from '../api/_pecas-processuais.js';
import { montarPecaExtra, ErroEntrada, sanearEntrada } from '../api/_gerar-extra.js';
import { contextoGenerico, TEMPLATE_GENERICO, parseBR, formatarBR } from '../api/_pecas-extras.js';
import { renderizarPeca } from '../api/_render-peca.js';
import { dadosDoCaso } from '../scripts/casos-ficticios/montar-dados.mjs';
import { escritorio } from './fixtures-peca.js';

// Etapa 4: embargos, agravo e reconhecimento de ofício da intercorrente (modelo genérico; prazos em código).

const casos = JSON.parse(fs.readFileSync(new URL('../scripts/casos-ficticios/cenarios.json', import.meta.url), 'utf8'));
const caso = (id) => {
  const c = casos.find((x) => x.id === id);
  const [d, m, a] = c.agora.split('/').map(Number);
  return { dados: dadosDoCaso(c), agora: new Date(Date.UTC(a, m - 1, d)) };
};
async function texto(peca, dados, agora) {
  const docx = await renderizarPeca({ template: TEMPLATE_GENERICO, contexto: contextoGenerico({ dados, escritorio, agora, peca }) });
  const xml = await (await JSZip.loadAsync(docx)).file('word/document.xml').async('string');
  return xml.split('</w:p>').map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')).join('\n');
}
const semRotulosAntigos = (t) => t.replace(/\[PREENCHER:[^\]]*\]/g, '');

describe('prazos', () => {
  it('dias úteis (sem fins de semana, exclui o dia do começo) e dias corridos prorrogados para dia útil', () => {
    expect(formatarBR(somarDiasUteis(parseBR('20/11/2026'), 15))).toBe('11/12/2026'); // sexta + 15 úteis
    expect(formatarBR(somarDiasCorridos(parseBR('02/02/2026'), 30))).toBe('04/03/2026');
    expect(formatarBR(somarDiasCorridos(parseBR('01/02/2026'), 27))).toBe('02/03/2026'); // cairia no sábado 28/02
    const p = calcularPrazo({ data: '20/11/2026', dias: 15, uteis: true, agora: new Date(Date.UTC(2026, 11, 14)) });
    expect(p).toEqual({ intimacao: '20/11/2026', final: '11/12/2026', vencido: true });
    expect(calcularPrazo({ data: 'x', dias: 15, uteis: true })).toBeNull();
  });
});

describe('matérias de defesa do caso', () => {
  it('P02: prescrição com os créditos prescritos; I04: intercorrente; D10: decadência', () => {
    expect(materiasDeDefesa(caso('P02')).nomes).toEqual(['prescrição']);
    expect(materiasDeDefesa(caso('I04')).nomes).toEqual(['prescrição intercorrente']);
    expect(materiasDeDefesa(caso('D10')).nomes).toEqual(['decadência']);
    expect(materiasDeDefesa(caso('P04')).nomes).toEqual([]);
  });
});

describe('embargos à execução', () => {
  it('P02: tempestividade, garantia, prescrição, efeito suspensivo, provas, valor da causa e pedidos', async () => {
    const { dados } = caso('P02');
    const agora = new Date(Date.UTC(2026, 10, 25));
    const r = pecaEmbargos({ dados, entrada: { data_garantia: '10/11/2026', forma_garantia: 'deposito' }, agora });
    expect(r.avisos).toEqual([]);
    const t = await texto(r.peca, dados, agora);
    expect(t).toContain('EMBARGOS À EXECUÇÃO FISCAL');
    expect(t).toContain('Distribuição por dependência à Execução Fiscal n.º 1000002-10.2019.4.01.3300');
    expect(t).toContain('garantida por depósito em dinheiro');
    expect(t).toContain('intimado(a) em 10/11/2026');
    expect(t).toContain('DA PRESCRIÇÃO DO CRÉDITO TRIBUTÁRIO');
    expect(t).toContain('consumação em 20/02/2017');
    expect(t).not.toContain('06/2014');
    expect(t).toContain('art. 919, § 1º, do CPC');
    expect(t).toContain('[PREENCHER: valor do débito embargado (R$)]');
    expect(semRotulosAntigos(t)).not.toMatch(/[—–]/);
  });

  it('prazo vencido e caso sem matéria: avisos; sócio com nome na CDA vira matéria de prova nos embargos', () => {
    const { dados } = caso('P04');
    const r = pecaEmbargos({ dados, entrada: { data_garantia: '01/01/2026' }, agora: new Date(Date.UTC(2026, 10, 25)) });
    expect(r.avisos.join(' ')).toMatch(/prazo de 30 dias já venceu/);
    expect(r.avisos.join(' ')).toMatch(/não sustentou nenhuma matéria/);
    const comSocio = { ...caso('P02').dados, redirecionamento: { houve: 'sim', socio_nome: 'JOÃO', socio_consta_na_cda: 'sim', fundamento: 'dissolucao_irregular' } };
    expect(materiasDeDefesa({ dados: comSocio, viaEmbargos: true }).nomes).toContain('ilegitimidade passiva');
    expect(materiasDeDefesa({ dados: comSocio }).nomes).not.toContain('ilegitimidade passiva');
  });
});

describe('agravo de instrumento', () => {
  it('I04 (União): endereçado ao TRF, tempestividade em dias úteis, decisão agravada, intercorrente e efeito suspensivo', async () => {
    const { dados } = caso('I04');
    const agora = new Date(Date.UTC(2026, 10, 25));
    const r = pecaAgravo({ dados, entrada: { data_intimacao_decisao: '20/11/2026', resumo_decisao: 'rejeitou a exceção por exigir dilação probatória.' }, agora });
    const t = await texto(r.peca, dados, agora);
    expect(t).toMatch(/EXCELENTÍSSIMO\(A\) SENHOR\(A\) DESEMBARGADOR\(A\) PRESIDENTE DO TRIBUNAL REGIONAL FEDERAL/);
    expect(t).toContain('AGRAVO DE INSTRUMENTO, COM PEDIDO DE EFEITO SUSPENSIVO');
    expect(t).toContain('se encerra em 11/12/2026');
    expect(t).toContain('O juízo de origem decidiu: rejeitou a exceção');
    expect(t).toContain('DA PRESCRIÇÃO INTERCORRENTE');
    expect(t).toContain('art. 1.019, I, do CPC');
    expect(semRotulosAntigos(t)).not.toMatch(/[—–]/);
  });
});

describe('reconhecimento de ofício da intercorrente', () => {
  it('I04: pede a intimação da Fazenda (art. 40, § 4º) e o reconhecimento; P02: não há o que pedir', async () => {
    const { dados, agora } = caso('I04');
    const r = pecaReconhecimento({ dados, agora });
    const t = await texto(r.peca, dados, agora);
    expect(t).toContain('RECONHECIMENTO DA PRESCRIÇÃO INTERCORRENTE');
    expect(t).toContain('consumado em 10/03/2023');
    expect(pecaReconhecimento(caso('P02'))).toBeNull();
    await expect(montarPecaExtra({ tipo: 'reconhecimento_intercorrente', ...caso('P02') })).rejects.toBeInstanceOf(ErroEntrada);
  });
});

describe('entrada e execução', () => {
  it('sanearEntrada: data inválida some; forma de garantia desconhecida vira penhora; textos são cortados', () => {
    expect(sanearEntrada('embargos', { data_garantia: '2026-01-01', forma_garantia: 'outra' })).toEqual({ data_garantia: '', forma_garantia: 'penhora' });
    expect(sanearEntrada('agravo', { resumo_decisao: 'x'.repeat(5000) }).resumo_decisao).toHaveLength(1500);
  });
  it('sem execução ajuizada: embargos e agravo recusados com explicação', async () => {
    const { dados, agora } = caso('P03');
    await expect(montarPecaExtra({ tipo: 'embargos', dados, agora })).rejects.toThrow(/execução fiscal ajuizada/);
    await expect(montarPecaExtra({ tipo: 'agravo', dados, agora })).rejects.toThrow(/execução fiscal ajuizada/);
  });
});
