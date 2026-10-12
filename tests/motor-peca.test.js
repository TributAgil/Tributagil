import { describe, it, expect } from 'vitest';
import {
  avaliarPeca,
  calcularPrescricaoOrdinaria,
  calcularDecadencia,
  escolherTemplate,
  formatarDataBR,
  parseDataBR,
  somarAnos,
  TEMPLATES,
  MSG_SEM_MODELO,
} from '../api/_motor-peca.js';

const AGORA = new Date(Date.UTC(2026, 2, 17)); // 17/03/2026, data do modelo original
const f = (d) => formatarDataBR(d);

// Caso real do modelo da EPE de prescrição ordinária (DIRPF, execução em 20/09/2025).
function dadosPrescricao(extra = {}) {
  return {
    processo_execucao: { numero: '1234567-60.2025.4.01.3300', data_ajuizamento: '20/09/2025', ...(extra.processo || {}) },
    inscricoes: [
      {
        numero_cda: '50 1 23 023733-90',
        periodos: [
          {
            periodo: '2019',
            modalidade_lancamento: 'homologacao_declarado',
            tipo_declaracao: 'DIRPF',
            data_vencimento: '30/04/2019', // anterior à entrega
            data_entrega_declaracao: '27/01/2020',
          },
          {
            periodo: '2020',
            modalidade_lancamento: 'homologacao_declarado',
            tipo_declaracao: 'DIRPF',
            data_vencimento: '30/06/2020', // posterior à entrega
            data_entrega_declaracao: '14/04/2020',
          },
        ],
        eventos_interruptivos: extra.eventos || [],
      },
    ],
  };
}

const parecerFavoravel = (tipo) => [{ tipo, severidade: 'favoravel', confianca: 90 }];

describe('datas', () => {
  it('rejeita data inexistente e formato errado', () => {
    expect(parseDataBR('31/02/2020')).toBeNull();
    expect(parseDataBR('2020-02-31')).toBeNull();
    expect(parseDataBR('')).toBeNull();
    expect(f(parseDataBR('29/02/2020'))).toBe('29/02/2020');
  });

  it('29/fev + 5 anos em ano não bissexto cai em 01/03 (mesma convenção de _motor-prazos.js)', () => {
    expect(f(somarAnos(parseDataBR('29/02/2020'), 5))).toBe('01/03/2025');
    expect(f(somarAnos(parseDataBR('29/02/2020'), 4))).toBe('29/02/2024');
  });
});

describe('prescrição ordinária — termo inicial e consumação', () => {
  it('usa a data POSTERIOR entre vencimento e entrega', () => {
    const a = calcularPrescricaoOrdinaria({ vencimento: '30/04/2019', entrega: '27/01/2020' });
    expect(f(a.termoInicial)).toBe('27/01/2020');
    expect(a.regraTermo).toBe('entrega_da_declaracao');
    expect(f(a.consumacao)).toBe('27/01/2025');

    const b = calcularPrescricaoOrdinaria({ vencimento: '30/06/2020', entrega: '14/04/2020' });
    expect(f(b.termoInicial)).toBe('30/06/2020');
    expect(b.regraTermo).toBe('vencimento');
    expect(f(b.consumacao)).toBe('30/06/2025');
  });

  it('data inválida ou ausente não é presumida', () => {
    expect(calcularPrescricaoOrdinaria({ vencimento: '31/02/2020', entrega: '27/01/2020' })).toMatchObject({ ok: false });
    expect(calcularPrescricaoOrdinaria({ vencimento: '', entrega: '27/01/2020' }).motivo).toMatch(/vencimento/);
  });

  it('aceita o formato { data, fonte } devolvido pela extração', () => {
    const r = calcularPrescricaoOrdinaria({
      vencimento: { data: '30/04/2019', fonte: 'extrato.pdf' },
      entrega: { data: '27/01/2020', fonte: 'recibo.pdf' },
    });
    expect(f(r.consumacao)).toBe('27/01/2025');
  });
});

describe('avaliarPeca — caso real do modelo (EPE prescrição)', () => {
  it('ajuizamento em 20/09/2025: os dois períodos estão prescritos e o modelo é a EPE de prescrição', () => {
    const r = avaliarPeca({ dados: dadosPrescricao(), conclusoesParecer: parecerFavoravel('prescricao'), agora: AGORA });
    expect(r.status).toBe('ok');
    expect(r.tese).toBe('prescricao_ordinaria');
    expect(r.template).toBe(TEMPLATES.EPE_PRESCRICAO);
    expect(r.creditos).toHaveLength(2);
    expect(r.creditos.map((c) => [f(c.termoInicial), f(c.consumacao)])).toEqual([
      ['27/01/2020', '27/01/2025'],
      ['30/06/2020', '30/06/2025'],
    ]);
  });

  it('protesto POSTERIOR à consumação (03/07/2025) vira aviso, não bloqueio', () => {
    const r = avaliarPeca({
      dados: dadosPrescricao({ eventos: [{ tipo: 'protesto', data: '03/07/2025', fonte: 'extrato.pdf' }] }),
      conclusoesParecer: parecerFavoravel('prescricao'),
      agora: AGORA,
    });
    expect(r.status).toBe('ok');
    expect(r.avisos.join(' ')).toMatch(/posterior à consumação/);
  });
});

describe('casos-limite', () => {
  it('ajuizamento NO PRÓPRIO DIA da consumação: não está prescrito (só é prescrito se for posterior)', () => {
    const dados = dadosPrescricao({ processo: { data_ajuizamento: '30/06/2025' } });
    dados.inscricoes[0].periodos = [dados.inscricoes[0].periodos[1]]; // consumação 30/06/2025
    const r = avaliarPeca({ dados, conclusoesParecer: [], agora: AGORA });
    expect(r.status).toBe('sem_tese');
    expect(r.omitidos[0].prescrito).toBe(false);
  });

  it('ajuizamento um dia depois da consumação: prescrito', () => {
    const dados = dadosPrescricao({ processo: { data_ajuizamento: '01/07/2025' } });
    dados.inscricoes[0].periodos = [dados.inscricoes[0].periodos[1]];
    const r = avaliarPeca({ dados, conclusoesParecer: parecerFavoravel('prescricao'), agora: AGORA });
    expect(r.status).toBe('ok');
  });

  it('termo inicial em 29/02: consumação em 01/03 do ano não bissexto', () => {
    const dados = dadosPrescricao({ processo: { data_ajuizamento: '01/03/2025' } });
    dados.inscricoes[0].periodos = [
      { periodo: '2019', modalidade_lancamento: 'homologacao_declarado', tipo_declaracao: 'DIRPF', data_vencimento: '29/02/2020', data_entrega_declaracao: '10/02/2020' },
    ];
    const r = avaliarPeca({ dados, conclusoesParecer: [], agora: AGORA });
    expect(f(r.omitidos[0].consumacao)).toBe('01/03/2025');
    expect(r.status).toBe('sem_tese'); // ajuizamento no mesmo dia da consumação
  });

  it('data inválida bloqueia a peça com motivo, sem presumir', () => {
    const dados = dadosPrescricao();
    dados.inscricoes[0].periodos[0].data_entrega_declaracao = '31/02/2020';
    const r = avaliarPeca({ dados, conclusoesParecer: parecerFavoravel('prescricao'), agora: AGORA });
    expect(r.bloqueios.join(' ')).toMatch(/data de entrega da declaração inválida/);
    expect(r.status).toBe('bloqueada');
  });

  it('parcelamento NO MEIO do prazo bloqueia e lista o evento', () => {
    const r = avaliarPeca({
      dados: dadosPrescricao({ eventos: [{ tipo: 'parcelamento', data: '10/05/2022', fonte: 'extrato.pdf' }] }),
      conclusoesParecer: parecerFavoravel('prescricao'),
      agora: AGORA,
    });
    expect(r.status).toBe('bloqueada');
    expect(r.template).toBeNull();
    expect(r.bloqueios.join(' ')).toMatch(/parcelamento em 10\/05\/2022/);
    expect(r.bloqueios.join(' ')).toMatch(/análise manual/);
  });

  it('evento com data inválida também bloqueia', () => {
    const r = avaliarPeca({
      dados: dadosPrescricao({ eventos: [{ tipo: 'pagamento', data: '', fonte: 'x' }] }),
      conclusoesParecer: parecerFavoravel('prescricao'),
      agora: AGORA,
    });
    expect(r.status).toBe('bloqueada');
  });

  it('execução informada sem data de ajuizamento bloqueia (não usa a data de hoje)', () => {
    const r = avaliarPeca({
      dados: dadosPrescricao({ processo: { data_ajuizamento: '' } }),
      conclusoesParecer: parecerFavoravel('prescricao'),
      agora: AGORA,
    });
    expect(r.status).toBe('bloqueada');
    expect(r.bloqueios.join(' ')).toMatch(/ajuizamento/);
  });
});

describe('coerência com o parecer', () => {
  it('parecer SEM conclusão favorável + motor prescrito: bloqueia e mostra a divergência', () => {
    const r = avaliarPeca({ dados: dadosPrescricao(), conclusoesParecer: [{ tipo: 'prescricao', severidade: 'desfavoravel' }], agora: AGORA });
    expect(r.status).toBe('bloqueada');
    expect(r.divergencias[0]).toMatch(/parecer salvo não traz conclusão favorável/);
  });

  it('parecer favorável + motor NÃO conclui prescrição: bloqueia e mostra a divergência', () => {
    const dados = dadosPrescricao({ processo: { data_ajuizamento: '01/01/2025' } }); // antes das duas consumações
    const r = avaliarPeca({ dados, conclusoesParecer: parecerFavoravel('prescricao'), agora: AGORA });
    expect(r.status).toBe('bloqueada');
    expect(r.divergencias[0]).toMatch(/cálculo da peça não confirma/);
  });
});

describe('decadência — as duas regras', () => {
  const periodoDecadencia = (extra) => ({
    periodo: '2005',
    modalidade_lancamento: 'oficio',
    data_fato_gerador: '30/06/2005',
    data_notificacao_lancamento: '22/08/2013',
    ...extra,
  });
  const dadosDec = (periodo, processo = { numero: '9999999-00.2014.4.01.3300', data_ajuizamento: '10/10/2014' }) => ({
    processo_execucao: processo,
    inscricoes: [{ numero_cda: 'CDA-1', periodos: [periodo], eventos_interruptivos: [] }],
  });

  it('art. 150 §4º (com pagamento antecipado): fato gerador + 5 anos', () => {
    const c = calcularDecadencia({ fatoGerador: '30/06/2005', houvePagamentoAntecipado: 'sim', indicioDolo: 'não' });
    expect(c.regra).toBe('art_150_par_4');
    expect(f(c.marcoInicial)).toBe('30/06/2005');
    expect(f(c.termoFinal)).toBe('30/06/2010');
  });

  it('art. 173, I (sem pagamento): 1º de janeiro do exercício seguinte + 5 anos', () => {
    const c = calcularDecadencia({ fatoGerador: '30/06/2005', houvePagamentoAntecipado: 'não', indicioDolo: 'não' });
    expect(c.regra).toBe('art_173_I');
    expect(f(c.marcoInicial)).toBe('01/01/2006');
    expect(f(c.termoFinal)).toBe('01/01/2011');
  });

  it('com pagamento antecipado MAS indício de dolo/fraude: cai no art. 173, I', () => {
    const c = calcularDecadencia({ fatoGerador: '30/06/2005', houvePagamentoAntecipado: 'sim', indicioDolo: 'sim' });
    expect(c.regra).toBe('art_173_I');
  });

  it('"não consta" pagamento antecipado NÃO é presumido', () => {
    const c = calcularDecadencia({ fatoGerador: '30/06/2005', houvePagamentoAntecipado: 'não consta', indicioDolo: 'não' });
    expect(c.ok).toBe(false);
    expect(c.motivo).toMatch(/pagamento antecipado/);
  });

  it('compara com a NOTIFICAÇÃO do lançamento (não com o ajuizamento) e escolhe a EPE de decadência', () => {
    const r = avaliarPeca({
      dados: dadosDec(periodoDecadencia({ houve_pagamento_antecipado: 'não', indicio_dolo_fraude_simulacao: 'não' })),
      conclusoesParecer: parecerFavoravel('decadencia'),
      agora: AGORA,
    });
    expect(r.status).toBe('ok');
    expect(r.tese).toBe('decadencia');
    expect(r.template).toBe(TEMPLATES.EPE_DECADENCIA);
    expect(f(r.creditos[0].termoFinal)).toBe('01/01/2011');
  });

  it('notificação DENTRO do prazo: não decaiu, mesmo com ajuizamento tardio', () => {
    const r = avaliarPeca({
      dados: dadosDec(periodoDecadencia({ data_notificacao_lancamento: '01/01/2009', houve_pagamento_antecipado: 'não', indicio_dolo_fraude_simulacao: 'não' })),
      conclusoesParecer: [],
      agora: AGORA,
    });
    expect(r.status).toBe('sem_tese');
  });

  it('parcelamento antes da notificação bloqueia a decadência (pode ser confissão)', () => {
    const dados = dadosDec(periodoDecadencia({ houve_pagamento_antecipado: 'não', indicio_dolo_fraude_simulacao: 'não' }));
    dados.inscricoes[0].eventos_interruptivos = [{ tipo: 'parcelamento', data: '01/03/2009', fonte: 'x' }];
    const r = avaliarPeca({ dados, conclusoesParecer: parecerFavoravel('decadencia'), agora: AGORA });
    expect(r.status).toBe('bloqueada');
  });

  it('decadência SEM execução ajuizada: cenário sem modelo', () => {
    const r = avaliarPeca({
      dados: dadosDec(periodoDecadencia({ houve_pagamento_antecipado: 'não', indicio_dolo_fraude_simulacao: 'não' }), {}),
      conclusoesParecer: parecerFavoravel('decadencia'),
      agora: AGORA,
    });
    expect(r.status).toBe('indisponivel');
    expect(r.mensagem).toBe(MSG_SEM_MODELO);
  });
});

describe('matriz de templates e Revisão PGFN', () => {
  it('matriz', () => {
    expect(escolherTemplate('prescricao_ordinaria', true)).toBe(TEMPLATES.EPE_PRESCRICAO);
    expect(escolherTemplate('prescricao_ordinaria', false)).toBe(TEMPLATES.REVISAO_PGFN_PRESCRICAO);
    expect(escolherTemplate('decadencia', true)).toBe(TEMPLATES.EPE_DECADENCIA);
    expect(escolherTemplate('decadencia', false)).toBeNull();
    expect(escolherTemplate('prescricao_intercorrente', true)).toBeNull();
  });

  it('sem execução ajuizada: aferição até a data de geração, modelo = Revisão PGFN', () => {
    const dados = dadosPrescricao({ processo: { numero: '', data_ajuizamento: '' } });
    const r = avaliarPeca({ dados, conclusoesParecer: parecerFavoravel('prescricao'), agora: AGORA });
    expect(r.status).toBe('ok');
    expect(r.template).toBe(TEMPLATES.REVISAO_PGFN_PRESCRICAO);
    expect(r.dataReferencia).toBe('17/03/2026');
    expect(r.avisos.join(' ')).toMatch(/data de geração/);
  });
});

describe('tese com mais créditos', () => {
  it('prescrição (2 períodos) x decadência (1 período): gera prescrição e avisa do restante', () => {
    const dados = dadosPrescricao();
    dados.inscricoes[0].periodos.push({
      periodo: '2005',
      modalidade_lancamento: 'oficio',
      data_fato_gerador: '30/06/2005',
      data_notificacao_lancamento: '22/08/2013',
      houve_pagamento_antecipado: 'não',
      indicio_dolo_fraude_simulacao: 'não',
    });
    const r = avaliarPeca({ dados, conclusoesParecer: [...parecerFavoravel('prescricao'), ...parecerFavoravel('decadencia')], agora: AGORA });
    expect(r.tese).toBe('prescricao_ordinaria');
    expect(r.creditos).toHaveLength(2);
    expect(r.omitidos).toHaveLength(1);
    expect(r.avisos.join(' ')).toMatch(/precisam ser incluídos manualmente/);
  });
});
