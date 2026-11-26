import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { avaliarIlegitimidade, avaliarNulidadeCda, avaliarCobrancaIndevida } from '../api/_motor-teses-novas.js';
import { montarPecaTeseNova } from '../api/_pecas-teses-novas.js';
import { contextoGenerico, TEMPLATE_GENERICO } from '../api/_pecas-extras.js';
import { renderizarPeca } from '../api/_render-peca.js';
import { normalizarDadosPeca } from '../api/_dados-peca.js';
import { dadosPrescricao, escritorio } from './fixtures-peca.js';

// Etapa 3: novas teses (motor em código + peça no modelo genérico).

const dt = (data, fonte = 'doc.pdf') => ({ data, fonte });
const comRedirecionamento = (extra = {}, dados = dadosPrescricao()) => ({
  ...dados,
  processo_execucao: { ...dados.processo_execucao, data_citacao: dt('10/03/2010') },
  redirecionamento: {
    houve: 'sim', socio_nome: 'JOÃO SÓCIO', socio_documento: '123.456.789-00', socio_consta_na_cda: 'não', fundamento: 'mero_inadimplemento',
    data_dissolucao_irregular: dt(''), socio_gerente_na_dissolucao: 'não consta', data_saida_socio: dt(''), data_pedido_redirecionamento: dt('05/05/2016'), fonte: 'pedido.pdf',
    ...extra,
  },
});
const requisitos = (ausentes = []) =>
  Object.fromEntries(['nome_devedor', 'domicilio', 'valor_originario', 'forma_calculo_juros_encargos', 'origem_natureza_fundamento_legal', 'data_numero_inscricao', 'processo_administrativo'].map((k) => [k, ausentes.includes(k) ? 'ausente' : 'consta']));
const comInscricoes = (fn, dados = dadosPrescricao()) => ({ ...dados, inscricoes: fn(dados.inscricoes) });

async function textoDaPeca(av, dados) {
  const contexto = contextoGenerico({ dados, escritorio, agora: new Date(Date.UTC(2026, 10, 25)), peca: montarPecaTeseNova(av, dados) });
  const docx = await renderizarPeca({ template: TEMPLATE_GENERICO, contexto });
  const xml = await (await JSZip.loadAsync(docx)).file('word/document.xml').async('string');
  return xml.split('</w:p>').map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')).join('\n');
}

describe('ilegitimidade passiva (redirecionamento ao sócio)', () => {
  it('sem redirecionamento ou sem execução: a tese nem aparece', () => {
    expect(avaliarIlegitimidade({ dados: dadosPrescricao() }).relevante).toBe(false);
    expect(avaliarIlegitimidade({ dados: comRedirecionamento({}, dadosPrescricao({ ajuizada: false })) }).relevante).toBe(false);
  });

  it('mero inadimplemento: Súmula 430; a peça é do SÓCIO e pede honorários pelo Tema 961', async () => {
    const dados = comRedirecionamento();
    const av = avaliarIlegitimidade({ dados });
    expect(av.status).toBe('ok');
    expect(av.template).toBe('Peca_generica');
    const t = await textoDaPeca(av, dados);
    expect(t).toMatch(/^JOÃO SÓCIO, inscrito\(a\) no CPF sob o nº 123\.456\.789-00/m);
    expect(t).toContain('Súmula 430/STJ');
    expect(t).toContain('exclusão de JOÃO SÓCIO do polo passivo');
    expect(t).toContain('Tema 961/STJ');
    expect(t.replace(/\[PREENCHER:[^\]]*\]/g, '')).not.toMatch(/[—–]/);
  });

  it('nome do sócio na CDA: bloqueada (REsp 1.110.925/SP, a via são os embargos); CDA não anexada: bloqueada', () => {
    expect(avaliarIlegitimidade({ dados: comRedirecionamento({ socio_consta_na_cda: 'sim' }) })).toMatchObject({ status: 'bloqueada' });
    expect(avaliarIlegitimidade({ dados: comRedirecionamento({ socio_consta_na_cda: 'sim' }) }).bloqueios[0]).toMatch(/REsp 1\.110\.925\/SP.*embargos/);
    expect(avaliarIlegitimidade({ dados: comRedirecionamento({ socio_consta_na_cda: 'não consta' }) }).status).toBe('bloqueada');
  });

  it('dissolução irregular: saída antes (Tema 962) gera; sem gerência na dissolução (Tema 981) gera; gerente nela: sem tese', async () => {
    const saiu = comRedirecionamento({ fundamento: 'dissolucao_irregular', data_dissolucao_irregular: dt('10/10/2015'), data_saida_socio: dt('01/02/2014') });
    const a = avaliarIlegitimidade({ dados: saiu });
    expect(a.status).toBe('ok');
    expect(await textoDaPeca(a, saiu)).toContain('Tema 962/STJ');

    const naoGerente = comRedirecionamento({ fundamento: 'dissolucao_irregular', data_dissolucao_irregular: dt('10/10/2015'), socio_gerente_na_dissolucao: 'não' });
    expect(avaliarIlegitimidade({ dados: naoGerente }).fatos.argumentos.map((x) => x.tipo)).toEqual(['nao_gerente_na_dissolucao']);

    const gerente = comRedirecionamento({ fundamento: 'dissolucao_irregular', data_dissolucao_irregular: dt('10/10/2015'), socio_gerente_na_dissolucao: 'sim' });
    expect(avaliarIlegitimidade({ dados: gerente })).toMatchObject({ status: 'sem_tese' });
  });

  it('Tema 444: dissolução antes da citação e pedido mais de 5 anos depois: argumento com [CONFIRMAR] (inércia)', async () => {
    const dados = comRedirecionamento({ fundamento: 'dissolucao_irregular', data_dissolucao_irregular: dt('10/10/2009'), socio_gerente_na_dissolucao: 'sim' });
    const av = avaliarIlegitimidade({ dados });
    expect(av.status).toBe('ok');
    expect(av.fatos.argumentos.map((x) => x.tipo)).toEqual(['prescricao_redirecionamento']);
    expect(av.avisos.join(' ')).toMatch(/Tema 444/);
    const t = await textoDaPeca(av, dados);
    expect(t).toContain('DA PRESCRIÇÃO PARA O REDIRECIONAMENTO');
    expect(t).toContain('10/03/2010');
    expect(t).toContain('[CONFIRMAR:');
  });

  it('fundamento "outro" ou não informado: bloqueada', () => {
    expect(avaliarIlegitimidade({ dados: comRedirecionamento({ fundamento: 'outro' }) }).status).toBe('bloqueada');
    expect(avaliarIlegitimidade({ dados: comRedirecionamento({ fundamento: 'não consta' }) }).status).toBe('bloqueada');
  });
});

describe('nulidade da CDA', () => {
  it('requisito essencial ausente na CDA anexada: tese com o aviso da Súmula 392', async () => {
    const dados = comInscricoes((ins) => ins.map((i) => ({ ...i, cda_anexada: 'sim', requisitos_cda: requisitos(['forma_calculo_juros_encargos']) })));
    const av = avaliarNulidadeCda({ dados });
    expect(av.status).toBe('ok');
    expect(av.avisos.join(' ')).toMatch(/Súmula 392/);
    const t = await textoDaPeca(av, dados);
    expect(t).toContain('não indica termo inicial e forma de calcular os juros de mora e demais encargos');
    expect(t).toContain('Art. 203.');
    expect(t).toContain('art. 803, I, do CPC');
  });

  it('só domicílio ausente: relevante mas sem tese (aviso); CDA não anexada: nada a verificar', () => {
    const soDomicilio = comInscricoes((ins) => ins.map((i) => ({ ...i, cda_anexada: 'sim', requisitos_cda: requisitos(['domicilio']) })));
    const av = avaliarNulidadeCda({ dados: soDomicilio });
    expect(av.status).toBe('sem_tese');
    expect(av.avisos[0]).toMatch(/domicílio do devedor/);
    const semCda = comInscricoes((ins) => ins.map((i) => ({ ...i, cda_anexada: 'não', requisitos_cda: requisitos(['forma_calculo_juros_encargos']) })));
    expect(avaliarNulidadeCda({ dados: semCda }).relevante).toBe(false);
  });

  it('sem execução: pedido de revisão (cancelamento da inscrição)', async () => {
    const dados = comInscricoes((ins) => ins.map((i) => ({ ...i, cda_anexada: 'sim', requisitos_cda: requisitos(['origem_natureza_fundamento_legal']) })), dadosPrescricao({ ajuizada: false }));
    const t = await textoDaPeca(avaliarNulidadeCda({ dados }), dados);
    expect(t).toContain('PEDIDO DE REVISÃO DE DÍVIDA INSCRITA');
    expect(t).toContain('o cancelamento da(s) inscrição(ões)');
  });
});

describe('cobrança indevida', () => {
  const quitado = (data, fonte = 'darf.pdf') => ({ situacao: 'sim', data, fonte });

  it('período quitado antes da inscrição: tese pelo art. 156, I; duplicidade entre duas CDAs: tese', async () => {
    const dados = comInscricoes((ins) => [
      { ...ins[0], data_inscricao: dt('10/01/2022'), periodos: [{ ...ins[0].periodos[0], quitacao_integral: quitado('15/05/2019') }, ins[0].periodos[1]] },
      { ...ins[0], numero_cda: '99 9 99 999999-99', data_inscricao: dt('10/01/2023'), periodos: [ins[0].periodos[1]] },
    ]);
    const av = avaliarCobrancaIndevida({ dados });
    expect(av.status).toBe('ok');
    expect(av.fatos.pagos).toHaveLength(1);
    expect(av.fatos.duplicados).toEqual([{ tributo: 'Imposto de Renda Pessoa Física', periodo: '2019', cdas: ['12 3 45 678901-23', '99 9 99 999999-99'] }]);
    const t = await textoDaPeca(av, dados);
    expect(t).toContain('DO PAGAMENTO ANTERIOR À INSCRIÇÃO');
    expect(t).toContain('pago em 15/05/2019, conforme darf.pdf');
    expect(t).toContain('DA COBRANÇA EM DUPLICIDADE');
    expect(t).toContain('[CONFIRMAR:');
  });

  it('quitação sem data: bloqueada; sem quitação nem duplicidade: nada', () => {
    const semData = comInscricoes((ins) => [{ ...ins[0], periodos: [{ ...ins[0].periodos[0], quitacao_integral: { situacao: 'sim', data: '', fonte: '' } }] }]);
    expect(avaliarCobrancaIndevida({ dados: semData }).status).toBe('bloqueada');
    expect(avaliarCobrancaIndevida({ dados: dadosPrescricao() }).relevante).toBe(false);
  });
});

describe('normalização dos campos novos', () => {
  it('sem a CDA anexada os requisitos são "não verificável"; redirecionamento ausente vira "não consta"', () => {
    const n = normalizarDadosPeca({ inscricoes: [{ numero_cda: '1', cda_anexada: 'não', requisitos_cda: { domicilio: 'ausente' }, periodos: [] }] });
    expect(Object.values(n.inscricoes[0].requisitos_cda).every((v) => v === 'não verificável')).toBe(true);
    expect(n.redirecionamento.houve).toBe('não consta');
    const c = normalizarDadosPeca({ inscricoes: [{ numero_cda: '1', cda_anexada: 'sim', requisitos_cda: { domicilio: 'ausente', valor_originario: 'x' }, periodos: [{ periodo: '2020', quitacao_integral: { situacao: 'sim', data: '2020-01-01' } }] }] });
    expect(c.inscricoes[0].requisitos_cda.domicilio).toBe('ausente');
    expect(c.inscricoes[0].requisitos_cda.valor_originario).toBe('não verificável');
    expect(c.inscricoes[0].periodos[0].quitacao_integral).toEqual({ situacao: 'sim', data: '', fonte: '' });
  });
});
