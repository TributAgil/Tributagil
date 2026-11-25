import { describe, it, expect } from 'vitest';
import {
  lerValorBR,
  formatarBRL,
  honorariosArt85,
  montarRelatorio,
  relatorioHtml,
  relatorioTexto,
  valoresIniciais,
  SALARIO_MINIMO_PADRAO,
} from '../src/lib/relatorioCliente.js';

// Etapa 5: relatório para o cliente (linguagem simples, valores do escritório, honorários do art. 85, § 3º, do CPC).

const HOJE = new Date(Date.UTC(2026, 10, 25, 15));
const resultado = (extra = {}) => ({
  metadata: {
    processo: '1000002-10.2019.4.01.3300',
    parte_autora: 'União (Fazenda Nacional)',
    parte_reu: 'EMPRESA TESTE LTDA',
    valor_causa: 'R$ 500.000,00',
    local: '1ª Vara Federal de Execução Fiscal',
    ...extra.metadata,
  },
  conclusoes: extra.conclusoes || [
    { id: 1, tipo: 'prescricao', severidade: 'favoravel', titulo: 'Prescrição dos créditos de 2012', resumo: 'técnico' },
    { id: 2, tipo: 'prescricao', severidade: 'favoravel', titulo: 'Prescrição dos créditos de 2013', resumo: 'técnico' },
    { id: 3, tipo: 'cautela', severidade: 'atencao', titulo: 'Conferir se houve parcelamento em 2016' },
    { id: 4, tipo: 'decadencia', severidade: 'desfavoravel', titulo: 'Sem decadência' },
  ],
});
const escritorio = {
  nome: 'Silva & Souza Advocacia',
  cidade: 'Brumado',
  uf: 'BA',
  email: 'contato@exemplo.com',
  advogados: [{ nome: 'Ana Silva', oab: '11.111', uf: 'BA' }, { nome: '', oab: '' }],
};
const marcos = [
  { tese: 'prescricao_ordinaria', cda: '12 3 45 678901-23', periodo: '2012', data: '2017-02-20', tipo: 'consumado', condicao: '' },
  { tese: 'prescricao_intercorrente', cda: '12 3 45 678901-23', periodo: '', data: '2027-03-10', tipo: 'acompanhar', condicao: 'desde que não tenha havido penhora efetiva, citação ou outro ato interruptivo até essa data' },
];

describe('valores em reais', () => {
  it('lê o formato brasileiro e ignora o que não é número', () => {
    expect(lerValorBR('R$ 847.320,00')).toBe(847320);
    expect(lerValorBR('847320')).toBe(847320);
    expect(lerValorBR('1.234,5')).toBe(1234.5);
    expect(lerValorBR('1.234')).toBe(1234);
    expect(lerValorBR('1.234.567')).toBe(1234567);
    expect(lerValorBR('12.5')).toBe(12.5);
    expect(lerValorBR('Não identificado')).toBeNull();
    expect(lerValorBR('')).toBeNull();
    expect(formatarBRL(1234.5)).toBe('R$ 1.234,50');
  });
});

describe('honorários do art. 85, § 3º, do CPC (escada do § 5º)', () => {
  it('até 200 salários mínimos: 10% a 20%', () => {
    expect(honorariosArt85(100000, 1621)).toMatchObject({ min: 10000, max: 20000 });
  });
  it('R$ 500.000: 200 SM na faixa I e o resto na faixa II', () => {
    const h = honorariosArt85(500000, 1621);
    expect(h.faixas.map((f) => [f.inciso, f.valor])).toEqual([['I', 324200], ['II', 175800]]);
    expect(h.min).toBe(32420 + 14064);
    expect(h.max).toBe(64840 + 17580);
  });
  it('valor acima de 100.000 SM passa pelas cinco faixas; base zero ou inválida: null', () => {
    expect(honorariosArt85(200000 * 1621, 1621).faixas.map((f) => f.inciso)).toEqual(['I', 'II', 'III', 'IV', 'V']);
    expect(honorariosArt85(0)).toBeNull();
    expect(honorariosArt85(1000, 0)).toBeNull();
    expect(SALARIO_MINIMO_PADRAO).toBe(1621);
  });
});

describe('conteúdo do relatório', () => {
  it('execução com prescrição: explica em linguagem simples, lista os créditos, valores, honorários e próximos passos', () => {
    const r = montarRelatorio({
      resultado: resultado(),
      escritorio,
      marcos,
      valores: { total: 'R$ 500.000,00', atingido: '300.000,00', data_valores: '20/11/2026', incluir_honorarios: true },
      hoje: HOJE,
    });
    expect(r.cliente).toBe('EMPRESA TESTE LTDA');
    expect(r.achados.map((a) => a.tipo)).toEqual(['prescricao']); // dois itens do mesmo tipo viram uma explicação
    expect(r.resumo).toMatch(/Encontramos um fundamento a seu favor: prescrição\./);
    expect(r.achados[0].creditos).toEqual(['CDA nº 12 3 45 678901-23, período 2012: prescrita desde 20/02/2017']);
    expect(r.acompanhar[0]).toMatch(/pode ficar prescrita \(intercorrente\) em 10\/03\/2027, desde que não tenha havido penhora/);
    expect(r.atencao).toEqual(['Conferir se houve parcelamento em 2016']);
    expect(r.valores).toMatchObject({ total: 500000, atingido: 300000, restante: 200000, pct: 0.6 });
    expect(r.honorarios).toMatchObject({ base: 300000, min: 30000, max: 60000 });
    expect(r.passos[0]).toMatch(/exceção de pré-executividade/);
    expect(r.passos.join(' ')).toMatch(/parcelamento ou transação/); // sobra valor devido
    expect(r.pendencias).toEqual([]);
    expect(r.escritorio.advogados).toEqual(['Ana Silva | OAB BA 11.111']);
  });

  it('sem execução: pedido administrativo e nada de honorários (pendência só no formulário)', () => {
    const r = montarRelatorio({
      resultado: resultado({ metadata: { processo: 'Não identificado' }, conclusoes: [{ tipo: 'decadencia', severidade: 'favoravel', titulo: 'x' }] }),
      valores: { total: '1000', atingido: '1000', incluir_honorarios: true },
      hoje: HOJE,
    });
    expect(r.processo).toBe('');
    expect(r.honorarios).toBeNull();
    expect(r.passos[0]).toMatch(/pedido administrativo de revisão.*decadência/);
    expect(r.pendencias.join(' ')).toMatch(/via é administrativa/);
    expect(relatorioHtml(r)).not.toMatch(/Honorários/);
  });

  it('nada favorável: diz isso com clareza e não estima honorários', () => {
    const r = montarRelatorio({ resultado: resultado({ conclusoes: [{ tipo: 'prescricao', severidade: 'desfavoravel', titulo: 'x' }] }), valores: { incluir_honorarios: true, atingido: '100' }, hoje: HOJE });
    expect(r.achados).toEqual([]);
    expect(r.resumo).toMatch(/não encontramos prescrição ou decadência/);
    expect(r.honorarios).toBeNull();
    expect(r.passos.join(' ')).toMatch(/parcelamento ou transação/);
  });

  it('valor atingido maior que o total é limitado ao total; falta de valores vira pendência', () => {
    const r = montarRelatorio({ resultado: resultado(), valores: { total: '100', atingido: '500' }, hoje: HOJE });
    expect(r.valores.atingido).toBe(100);
    const s = montarRelatorio({ resultado: resultado(), valores: {}, hoje: HOJE });
    expect(s.pendencias).toHaveLength(2);
  });

  it('valores iniciais: o valor da causa vira o total sugerido; honorários ligados só com execução', () => {
    expect(valoresIniciais(resultado(), HOJE)).toMatchObject({ total: 'R$ 500.000,00', atingido: '', data_valores: '25/11/2026', incluir_honorarios: true });
    expect(valoresIniciais(resultado({ metadata: { processo: '—', valor_causa: 'Não identificado' } }), HOJE)).toMatchObject({ total: '', incluir_honorarios: false });
  });
});

describe('HTML e texto', () => {
  it('timbre, seções e escape de tudo que vem de fora; logo só data: ou https', () => {
    const r = montarRelatorio({
      resultado: resultado({ metadata: { parte_reu: 'ACME <script>alert(1)</script>' } }),
      escritorio,
      marcos,
      valores: { total: '500000', atingido: '300000', incluir_honorarios: true, observacoes: 'Reunião na <b>sexta</b>.' },
      hoje: HOJE,
    });
    const html = relatorioHtml(r, { logo: 'data:image/png;base64,AAAA' });
    expect(html).toContain('Silva &amp; Souza Advocacia');
    expect(html).toContain('<img src="data:image/png;base64,AAAA"');
    expect(html).toContain('ACME &lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Reunião na &lt;b&gt;sexta&lt;/b&gt;.');
    expect(html).toContain('Esse valor é pago pela Fazenda, não por você');
    expect(html).toContain('Brumado/BA, 25/11/2026.');
    expect(relatorioHtml(r, { logo: 'javascript:alert(1)' })).not.toContain('<img');
    const txt = relatorioTexto(r);
    expect(txt).toMatch(/^Silva & Souza Advocacia\nRelatório da análise do seu caso/);
    expect(txt).toContain('Estimativa entre R$ 30.000,00 e R$ 60.000,00');
  });
});
