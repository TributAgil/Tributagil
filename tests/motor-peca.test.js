import { describe, it, expect } from 'vitest';
import {
  avaliarPeca,
  avaliarPecas,
  calcularPrescricaoOrdinaria,
  calcularDecadencia,
  escolherTemplate,
  formatarDataBR,
  parseDataBR,
  somarAnos,
  TEMPLATES,
  MSG_SEM_MODELO,
  AVISO_CREDITO_DECLARADO,
  MSG_VENCIMENTO_NAO_IDENTIFICADO,
} from '../api/_motor-peca.js';
import {
  AGORA,
  dt,
  dadosPrescricao,
  dadosDecadencia,
  dadosIntercorrente,
  periodoDecadencia,
  periodoNeutro,
  intimacao,
  evento,
  parecerFavoravel,
} from './fixtures-peca.js';

const f = (d) => formatarDataBR(d);
const ordinaria = (dados, parecer = []) => avaliarPeca({ dados, tese: 'prescricao_ordinaria', conclusoesParecer: parecer, agora: AGORA });
const decadencia = (dados, parecer = []) => avaliarPeca({ dados, tese: 'decadencia', conclusoesParecer: parecer, agora: AGORA });
const intercorrente = (dados, parecer = []) => avaliarPeca({ dados, tese: 'prescricao_intercorrente', conclusoesParecer: parecer, agora: AGORA });

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
    const r = calcularPrescricaoOrdinaria({ vencimento: dt('30/04/2019', 'extrato.pdf'), entrega: dt('27/01/2020', 'recibo.pdf') });
    expect(f(r.consumacao)).toBe('27/01/2025');
  });
});

describe('prescrição ordinária — caso real do modelo (EPE prescrição)', () => {
  it('ajuizamento em 20/09/2025: os dois períodos estão prescritos e o modelo é a EPE de prescrição', () => {
    const r = ordinaria(dadosPrescricao(), parecerFavoravel('prescricao'));
    expect(r.status).toBe('ok');
    expect(r.template).toBe(TEMPLATES.EPE_PRESCRICAO);
    expect(r.creditos).toHaveLength(2);
    expect(r.creditos.map((c) => [f(c.termoInicial), f(c.consumacao)])).toEqual([
      ['27/01/2020', '27/01/2025'],
      ['30/06/2020', '30/06/2025'],
    ]);
  });

  it('protesto POSTERIOR à consumação (03/07/2025) vira aviso, não bloqueio', () => {
    const r = ordinaria(dadosPrescricao(), parecerFavoravel('prescricao'));
    expect(r.status).toBe('ok');
    expect(r.avisos.join(' ')).toMatch(/posterior à consumação/);
  });
});

describe('casos-limite da prescrição ordinária', () => {
  const soSegundoPeriodo = (dados) => {
    dados.inscricoes[0].periodos = [dados.inscricoes[0].periodos[1]]; // consumação 30/06/2025
    return dados;
  };

  it('ajuizamento NO PRÓPRIO DIA da consumação: não está prescrito (só é prescrito se for posterior)', () => {
    const dados = soSegundoPeriodo(dadosPrescricao());
    dados.processo_execucao.data_ajuizamento = dt('30/06/2025', 'x');
    const r = ordinaria(dados);
    expect(r.status).toBe('sem_tese');
    expect(r.omitidos[0].prescrito).toBe(false);
  });

  it('ajuizamento um dia depois da consumação: prescrito', () => {
    const dados = soSegundoPeriodo(dadosPrescricao());
    dados.processo_execucao.data_ajuizamento = dt('01/07/2025', 'x');
    expect(ordinaria(dados, parecerFavoravel('prescricao')).status).toBe('ok');
  });

  it('termo inicial em 29/02: consumação em 01/03 do ano não bissexto', () => {
    const dados = dadosPrescricao();
    dados.processo_execucao.data_ajuizamento = dt('01/03/2025', 'x');
    dados.inscricoes[0].periodos = [
      periodoNeutro({ periodo: '2019', modalidade_lancamento: 'homologacao_declarado', tipo_declaracao: 'DIRPF', data_vencimento: dt('29/02/2020', 'x'), data_entrega_declaracao: dt('10/02/2020', 'x') }),
    ];
    const r = ordinaria(dados);
    expect(f(r.omitidos[0].consumacao)).toBe('01/03/2025');
    expect(r.status).toBe('sem_tese'); // ajuizamento no mesmo dia da consumação
  });

  it('data inválida bloqueia a peça com motivo, sem presumir', () => {
    const dados = dadosPrescricao();
    dados.inscricoes[0].periodos[0].data_entrega_declaracao = dt('31/02/2020', 'x');
    const r = ordinaria(dados, parecerFavoravel('prescricao'));
    expect(r.bloqueios.join(' ')).toMatch(/data de entrega da declaração inválida/);
    expect(r.status).toBe('bloqueada');
  });

  it('parcelamento NO MEIO do prazo bloqueia e lista o evento', () => {
    const dados = dadosPrescricao();
    dados.inscricoes[0].eventos_interruptivos = [{ tipo: 'parcelamento', data: '10/05/2022', fonte: 'extrato.pdf' }];
    const r = ordinaria(dados, parecerFavoravel('prescricao'));
    expect(r.status).toBe('bloqueada');
    expect(r.template).toBeNull();
    expect(r.bloqueios.join(' ')).toMatch(/parcelamento em 10\/05\/2022/);
    expect(r.bloqueios.join(' ')).toMatch(/análise manual/);
  });

  it('evento com data inválida também bloqueia', () => {
    const dados = dadosPrescricao();
    dados.inscricoes[0].eventos_interruptivos = [{ tipo: 'pagamento', data: '', fonte: 'x' }];
    expect(ordinaria(dados, parecerFavoravel('prescricao')).status).toBe('bloqueada');
  });

  it('execução informada sem data de ajuizamento bloqueia (não usa a data de hoje)', () => {
    const dados = dadosPrescricao();
    dados.processo_execucao.data_ajuizamento = dt('', '');
    const r = ordinaria(dados, parecerFavoravel('prescricao'));
    expect(r.status).toBe('bloqueada');
    expect(r.bloqueios.join(' ')).toMatch(/ajuizamento/);
  });

  it('modalidade de lançamento não identificada bloqueia (nunca presume declarado ou não)', () => {
    const dados = dadosPrescricao();
    dados.inscricoes[0].periodos[0].modalidade_lancamento = '';
    const r = ordinaria(dados, parecerFavoravel('prescricao'));
    expect(r.status).toBe('bloqueada');
    expect(r.bloqueios.join(' ')).toMatch(/modalidade de lançamento não identificada/);
  });
});

describe('coerência com o parecer', () => {
  it('parecer SEM conclusão favorável + motor prescrito: bloqueia e mostra a divergência', () => {
    const r = ordinaria(dadosPrescricao(), [{ tipo: 'prescricao', severidade: 'desfavoravel' }]);
    expect(r.status).toBe('bloqueada');
    expect(r.divergencias[0]).toMatch(/parecer salvo não traz conclusão favorável/);
  });

  it('parecer favorável + motor NÃO conclui prescrição: bloqueia e mostra a divergência', () => {
    const dados = dadosPrescricao();
    dados.processo_execucao.data_ajuizamento = dt('01/01/2025', 'x'); // antes das duas consumações
    const r = ordinaria(dados, parecerFavoravel('prescricao'));
    expect(r.status).toBe('bloqueada');
    expect(r.divergencias[0]).toMatch(/cálculo da peça não confirma/);
  });
});

describe('decadência — marco do art. 173, I conta do VENCIMENTO', () => {
  // Auto de infração de IRPJ: fato gerador 31/12/2017, vencimento 31/01/2018, sem pagamento antecipado
  const irpj = (extra = {}) =>
    periodoDecadencia({
      periodo: '2017',
      data_fato_gerador: dt('31/12/2017', 'auto.pdf'),
      data_vencimento: dt('31/01/2018', 'auto.pdf'),
      data_notificacao_lancamento: dt('15/03/2024', 'auto.pdf'),
      ...extra,
    });

  it('art. 173, I: marco 01/01/2019 → termo 01/01/2024 → notificação 15/03/2024 → decaído', () => {
    const r = decadencia(dadosDecadencia({ periodos: [irpj()] }), parecerFavoravel('decadencia'));
    expect(r.status).toBe('ok');
    expect(r.template).toBe(TEMPLATES.EPE_DECADENCIA);
    const c = r.creditos[0];
    expect(c.regra).toBe('art_173_I');
    expect([f(c.marcoInicial), f(c.termoFinal), f(c.notificacao)]).toEqual(['01/01/2019', '01/01/2024', '15/03/2024']);
    expect(c.decaido).toBe(true);
    expect(r.decadenciaTotal).toBe(true);
  });

  it('fato gerador 30/06/2017 com vencimento 31/07/2017: marco 01/01/2018 → termo 01/01/2023', () => {
    const c = calcularDecadencia({ fatoGerador: dt('30/06/2017', 'x'), vencimento: dt('31/07/2017', 'x'), houvePagamentoAntecipado: 'não', imputacaoDolo: 'não' });
    expect([f(c.marcoInicial), f(c.termoFinal)]).toEqual(['01/01/2018', '01/01/2023']);
  });

  it('vencimento em OUTRO ano que o fato gerador: conta do ano do vencimento (a leitura conservadora)', () => {
    // Contando pelo fato gerador (31/12/2017) o marco seria 01/01/2018; pelo vencimento (31/01/2018) é 01/01/2019
    const c = calcularDecadencia({ fatoGerador: dt('31/12/2017', 'x'), vencimento: dt('31/01/2018', 'x'), houvePagamentoAntecipado: 'não', imputacaoDolo: 'não' });
    expect(f(c.marcoInicial)).toBe('01/01/2019');
  });

  it('art. 173, I SEM vencimento identificado: bloqueia com o aviso, e não conta pelo fato gerador', () => {
    const r = decadencia(dadosDecadencia({ periodos: [irpj({ data_vencimento: dt('', '') })] }), parecerFavoravel('decadencia'));
    expect(r.status).toBe('bloqueada');
    expect(r.bloqueios.join(' ')).toContain(MSG_VENCIMENTO_NAO_IDENTIFICADO);
    expect(r.creditos).toHaveLength(0);
  });

  it('vencimento COM data mas SEM fonte também não vale', () => {
    const c = calcularDecadencia({ fatoGerador: dt('31/12/2017', 'x'), vencimento: dt('31/01/2018', ''), houvePagamentoAntecipado: 'não', imputacaoDolo: 'não' });
    expect(c.ok).toBe(false);
    expect(c.motivo).toBe(MSG_VENCIMENTO_NAO_IDENTIFICADO);
  });

  it('com pagamento antecipado e sem dolo: art. 150 §4º → termo 31/12/2022 → decaído (não precisa de vencimento)', () => {
    const r = decadencia(
      dadosDecadencia({ periodos: [irpj({ houve_pagamento_antecipado: 'sim', fonte_pagamento_antecipado: 'darf.pdf', data_vencimento: dt('', '') })] }),
      parecerFavoravel('decadencia'),
    );
    const c = r.creditos[0];
    expect(c.regra).toBe('art_150_par_4');
    expect([f(c.marcoInicial), f(c.termoFinal)]).toEqual(['31/12/2017', '31/12/2022']);
    expect(c.decaido).toBe(true);
    expect(c.fontePagamento).toBe('darf.pdf');
  });

  it('com pagamento antecipado mas dolo/fraude IMPUTADO: força o art. 173, I', () => {
    const r = decadencia(
      dadosDecadencia({ periodos: [irpj({ houve_pagamento_antecipado: 'sim', imputacao_dolo_fraude_simulacao: 'sim' })] }),
      parecerFavoravel('decadencia'),
    );
    const c = r.creditos[0];
    expect(c.regra).toBe('art_173_I');
    expect(c.doloImputado).toBe(true);
    expect(f(c.marcoInicial)).toBe('01/01/2019');
  });

  it('dolo "não consta" com art. 150 §4º: gera, mas pede CONFIRMAR a ausência de imputação', () => {
    const r = decadencia(
      dadosDecadencia({ periodos: [irpj({ houve_pagamento_antecipado: 'sim', imputacao_dolo_fraude_simulacao: 'não consta' })] }),
      parecerFavoravel('decadencia'),
    );
    expect(r.status).toBe('ok');
    expect(r.creditos[0].confirmarDolo).toBe(true);
    // e "não" (confirmado no lançamento) não pede confirmação
    const ok = decadencia(dadosDecadencia({ periodos: [irpj({ houve_pagamento_antecipado: 'sim', imputacao_dolo_fraude_simulacao: 'não' })] }), parecerFavoravel('decadencia'));
    expect(ok.creditos[0].confirmarDolo).toBe(false);
  });

  it('"não consta" pagamento antecipado NÃO é presumido', () => {
    const c = calcularDecadencia({ fatoGerador: dt('30/06/2005', 'x'), vencimento: dt('31/07/2005', 'x'), houvePagamentoAntecipado: 'não consta', imputacaoDolo: 'não' });
    expect(c.ok).toBe(false);
    expect(c.motivo).toMatch(/pagamento antecipado/);
  });

  it('crédito DECLARADO (DCTF): não há decadência — bloqueia com o aviso da Súmula 436', () => {
    const declarado = periodoNeutro({
      periodo: '2017',
      modalidade_lancamento: 'homologacao_declarado',
      tipo_declaracao: 'DCTF',
      data_entrega_declaracao: dt('15/05/2018', 'dctf.pdf'),
      data_vencimento: dt('31/01/2018', 'dctf.pdf'),
    });
    const r = decadencia(dadosDecadencia({ periodos: [declarado] }), parecerFavoravel('decadencia'));
    expect(r.status).toBe('bloqueada');
    expect(r.bloqueios).toContain(AVISO_CREDITO_DECLARADO);
    expect(AVISO_CREDITO_DECLARADO).toBe('Crédito constituído por declaração do contribuinte: a tese de decadência não se aplica ao valor declarado.');
  });

  it('declarado + não declarado na mesma CDA: a decadência cobre só o não declarado e AVISA do declarado', () => {
    const declarado = periodoNeutro({ periodo: '2016', modalidade_lancamento: 'homologacao_declarado', tipo_declaracao: 'DCTF', data_entrega_declaracao: dt('15/05/2017', 'x'), data_vencimento: dt('31/01/2017', 'x') });
    const r = decadencia(dadosDecadencia({ periodos: [declarado, irpj()] }), parecerFavoravel('decadencia'));
    expect(r.status).toBe('ok');
    expect(r.creditos).toHaveLength(1);
    expect(r.avisos).toContain(AVISO_CREDITO_DECLARADO);
  });

  it('lançamento anterior anulado por vício formal: BLOQUEIA (art. 173, II reabre o prazo)', () => {
    const r = decadencia(
      dadosDecadencia({ periodos: [irpj({ lancamento_anterior_anulado_vicio_formal: 'sim', data_decisao_anulatoria: dt('10/10/2020', 'acordao.pdf') })] }),
      parecerFavoravel('decadencia'),
    );
    expect(r.status).toBe('bloqueada');
    expect(r.bloqueios.join(' ')).toMatch(/173, II/);
  });

  it('vício formal "não consta": não bloqueia, só avisa', () => {
    const r = decadencia(dadosDecadencia({ periodos: [irpj({ lancamento_anterior_anulado_vicio_formal: 'não consta' })] }), parecerFavoravel('decadencia'));
    expect(r.status).toBe('ok');
    expect(r.avisos.join(' ')).toMatch(/vício formal/);
  });

  it('CDA com dois períodos, um decaído e outro dentro do prazo: decadência PARCIAL', () => {
    const dentro = irpj({ periodo: '2020', data_fato_gerador: dt('31/12/2020', 'x'), data_vencimento: dt('31/01/2021', 'x'), data_notificacao_lancamento: dt('15/03/2024', 'x') });
    const r = decadencia(dadosDecadencia({ periodos: [irpj(), dentro] }), parecerFavoravel('decadencia'));
    expect(r.status).toBe('ok');
    expect(r.decadenciaParcial).toBe(true);
    expect(r.decadenciaTotal).toBe(false);
    expect(r.creditos.map((c) => c.periodo)).toEqual(['2017']);
    expect(r.avaliados.map((c) => [c.periodo, c.decaido])).toEqual([['2017', true], ['2020', false]]);
  });

  it('compara com a NOTIFICAÇÃO (não com o ajuizamento): notificação dentro do prazo não decai, mesmo com ajuizamento tardio', () => {
    const r = decadencia(dadosDecadencia({ periodos: [periodoDecadencia({ data_notificacao_lancamento: dt('01/01/2009', 'x') })] }));
    expect(r.status).toBe('sem_tese');
  });

  it('parcelamento antes da notificação bloqueia (pode ser confissão); pagamento só avisa', () => {
    const dados = dadosDecadencia();
    dados.inscricoes[0].eventos_interruptivos = [{ tipo: 'parcelamento', data: '01/03/2009', fonte: 'x' }];
    expect(decadencia(dados, parecerFavoravel('decadencia')).status).toBe('bloqueada');
    dados.inscricoes[0].eventos_interruptivos = [{ tipo: 'pagamento', data: '01/03/2009', fonte: 'x' }];
    const r = decadencia(dados, parecerFavoravel('decadencia'));
    expect(r.status).toBe('ok');
    expect(r.avisos.join(' ')).toMatch(/pagamento antecipado/);
  });
});

describe('decadência — escolha entre EPE e Revisão', () => {
  it('com execução → EPE de decadência; sem execução → Revisão PGFN de decadência', () => {
    expect(decadencia(dadosDecadencia(), parecerFavoravel('decadencia')).template).toBe(TEMPLATES.EPE_DECADENCIA);
    const rev = decadencia(dadosDecadencia({ ajuizada: false }), parecerFavoravel('decadencia'));
    expect(rev.status).toBe('ok');
    expect(rev.template).toBe(TEMPLATES.REVISAO_PGFN_DECADENCIA);
  });
});

describe('prescrição intercorrente — reaproveita _motor-prazos.js', () => {
  it('ciência em 10/03/2017 → fim da suspensão 10/03/2018 → consumação 10/03/2023 → sem interrupção → gera', () => {
    const r = intercorrente(dadosIntercorrente(), parecerFavoravel('prescricao_intercorrente'));
    expect(r.status).toBe('ok');
    expect(r.template).toBe(TEMPLATES.EPE_INTERCORRENTE);
    expect(r.intercorrente).toMatchObject({
      dataIntimacao: '10/03/2017',
      dataFimSuspensao: '10/03/2018',
      dataPrazoFinal: '10/03/2023',
      objetoNaoLocalizado: 'devedor_e_bens',
      fonteIntimacao: 'certidao_oficial.pdf',
      ciclosInterrompidos: [],
    });
    expect(r.intercorrente.cdasCobertas).toEqual(['44 1 15 000999-00']);
  });

  it('com penhora EFETIVA em 2020 dentro do prazo: o ciclo é interrompido → não gera', () => {
    const dados = dadosIntercorrente({ eventos: [intimacao('10/03/2017'), evento('penhora_constricao', '15/06/2020')] });
    const r = intercorrente(dados);
    expect(r.status).toBe('sem_tese');
    expect(avaliarPecas({ dados, agora: AGORA }).pecas).toHaveLength(0);
  });

  it('parecer favorável mas o motor interrompeu o ciclo: bloqueia mostrando a divergência', () => {
    const dados = dadosIntercorrente({ eventos: [intimacao('10/03/2017'), evento('penhora_constricao', '15/06/2020')] });
    const r = intercorrente(dados, parecerFavoravel('prescricao_intercorrente'));
    expect(r.status).toBe('bloqueada');
    expect(r.divergencias[0]).toMatch(/cálculo da peça não confirma/);
  });

  it('dois ciclos: o 1º interrompido por citação, o 2º ativo e reconhecido → gera, listando o ciclo interrompido', () => {
    const dados = dadosIntercorrente({
      eventos: [intimacao('10/03/2012', 'devedor'), evento('citacao', '20/08/2013'), intimacao('10/03/2017', 'bens')],
    });
    const r = intercorrente(dados, parecerFavoravel('prescricao_intercorrente'));
    expect(r.status).toBe('ok');
    expect(r.intercorrente.dataIntimacao).toBe('10/03/2017');
    expect(r.intercorrente.objetoNaoLocalizado).toBe('bens');
    expect(r.intercorrente.ciclosInterrompidos).toEqual([
      { dataIntimacao: '10/03/2012', dataInterrupcao: '20/08/2013', categoria: 'citacao', eventoExtenso: 'citação do executado' },
    ]);
  });

  it('prazo ainda em curso (consumação futura): não gera', () => {
    const dados = dadosIntercorrente({ eventos: [intimacao('10/03/2022')] });
    expect(intercorrente(dados).status).toBe('sem_tese');
  });

  it('sem execução ajuizada não há EPE de intercorrente', () => {
    const r = intercorrente(dadosIntercorrente({ ajuizada: false }), parecerFavoravel('prescricao_intercorrente'));
    expect(r.status).toBe('indisponivel');
    expect(r.mensagem).toBe(MSG_SEM_MODELO);
  });

  it('inscrições sem prescrição reconhecida: gera e AVISA que a peça cobre só parte das CDAs', () => {
    const dados = dadosIntercorrente({
      eventos: [{ ...intimacao('10/03/2017'), inscricao: '44 1 15 000999-00' }],
    });
    dados.inscricoes.push({ numero_cda: '44 1 15 000888-11', tributo: 'IRPJ', processo_administrativo: '', periodos: [], eventos_interruptivos: [] });
    const r = intercorrente(dados, parecerFavoravel('prescricao_intercorrente'));
    expect(r.status).toBe('ok');
    expect(r.intercorrente.cdasCobertas).toEqual(['44 1 15 000999-00']);
    expect(r.avisos.join(' ')).toMatch(/cobre apenas parte das CDAs.*44 1 15 000888-11/);
  });

  it('duas inscrições reconhecidas com datas DIFERENTES: não escolhe por conta própria, bloqueia', () => {
    const dados = dadosIntercorrente({
      eventos: [
        { ...intimacao('10/03/2017'), inscricao: 'A' },
        { ...intimacao('10/03/2016'), inscricao: 'B' },
      ],
    });
    const r = intercorrente(dados, parecerFavoravel('prescricao_intercorrente'));
    expect(r.status).toBe('bloqueada');
    expect(r.bloqueios.join(' ')).toMatch(/datas diferentes entre inscrições/);
  });

  it('parcelamento dentro do prazo (o motor de intercorrente não o enxerga): bloqueia', () => {
    const dados = dadosIntercorrente();
    dados.inscricoes[0].eventos_interruptivos = [{ tipo: 'parcelamento', data: '10/05/2019', fonte: 'extrato.pdf' }];
    const r = intercorrente(dados, parecerFavoravel('prescricao_intercorrente'));
    expect(r.status).toBe('bloqueada');
    expect(r.bloqueios.join(' ')).toMatch(/parcelamento em 10\/05\/2019/);
  });
});

describe('matriz de templates', () => {
  it('matriz completa', () => {
    expect(escolherTemplate('prescricao_ordinaria', true)).toBe(TEMPLATES.EPE_PRESCRICAO);
    expect(escolherTemplate('prescricao_ordinaria', false)).toBe(TEMPLATES.REVISAO_PGFN_PRESCRICAO);
    expect(escolherTemplate('decadencia', true)).toBe(TEMPLATES.EPE_DECADENCIA);
    expect(escolherTemplate('decadencia', false)).toBe(TEMPLATES.REVISAO_PGFN_DECADENCIA);
    expect(escolherTemplate('prescricao_intercorrente', true)).toBe(TEMPLATES.EPE_INTERCORRENTE);
    expect(escolherTemplate('prescricao_intercorrente', false)).toBeNull();
  });

  it('prescrição sem execução ajuizada: aferição até a data de geração, modelo = Revisão PGFN', () => {
    const r = ordinaria(dadosPrescricao({ ajuizada: false }), parecerFavoravel('prescricao'));
    expect(r.status).toBe('ok');
    expect(r.template).toBe(TEMPLATES.REVISAO_PGFN_PRESCRICAO);
    expect(r.dataReferencia).toBe('11/10/2026');
    expect(r.avisos.join(' ')).toMatch(/data de geração/);
  });
});

describe('mais de uma peça no mesmo caso (o usuário escolhe)', () => {
  it('prescrição ordinária + decadência: AS DUAS aparecem, cada uma com o seu modelo (não se funde nem se escolhe "a que tem mais créditos")', () => {
    const dados = dadosPrescricao();
    dados.inscricoes[0].periodos.push(periodoDecadencia({ periodo: '2005', data_notificacao_lancamento: dt('22/08/2013', 'x') }));
    const parecer = [...parecerFavoravel('prescricao'), ...parecerFavoravel('decadencia')];
    const { pecas } = avaliarPecas({ dados, conclusoesParecer: parecer, agora: AGORA });
    expect(pecas.map((p) => [p.tese, p.status, p.template])).toEqual([
      ['prescricao_ordinaria', 'ok', TEMPLATES.EPE_PRESCRICAO],
      ['decadencia', 'ok', TEMPLATES.EPE_DECADENCIA],
    ]);
    expect(pecas[0].creditos).toHaveLength(2);
    expect(pecas[1].creditos).toHaveLength(1);
  });

  it('decadência de um período + prescrição intercorrente da execução: duas peças disponíveis', () => {
    const dados = dadosDecadencia();
    dados.eventos_execucao = [intimacao('10/03/2017')];
    const parecer = [...parecerFavoravel('decadencia'), ...parecerFavoravel('prescricao_intercorrente')];
    const { pecas } = avaliarPecas({ dados, conclusoesParecer: parecer, agora: AGORA });
    expect(pecas.map((p) => [p.tese, p.template])).toEqual([
      ['decadencia', TEMPLATES.EPE_DECADENCIA],
      ['prescricao_intercorrente', TEMPLATES.EPE_INTERCORRENTE],
    ]);
  });

  it('um bloqueio afeta só a tese a que ele pertence (cada tese tem o seu status)', () => {
    const dados = dadosPrescricao();
    dados.inscricoes[0].eventos_interruptivos = [{ tipo: 'parcelamento', data: '10/05/2022', fonte: 'x' }];
    const parecer = parecerFavoravel('prescricao');
    const { pecas } = avaliarPecas({ dados, conclusoesParecer: parecer, agora: AGORA });
    expect(pecas.map((p) => [p.tese, p.status])).toEqual([['prescricao_ordinaria', 'bloqueada']]);
  });

  it('tese sem relação com o caso não aparece (sem eventos de não localização, sem períodos do tipo)', () => {
    const { pecas } = avaliarPecas({ dados: dadosPrescricao(), conclusoesParecer: parecerFavoravel('prescricao'), agora: AGORA });
    expect(pecas.map((p) => p.tese)).toEqual(['prescricao_ordinaria']);
  });

  it('parecer favorável a uma tese que o motor não confirma aparece como bloqueada (divergência), não some', () => {
    const { pecas } = avaliarPecas({ dados: dadosPrescricao(), conclusoesParecer: parecerFavoravel('decadencia'), agora: AGORA });
    const dec = pecas.find((p) => p.tese === 'decadencia');
    expect(dec.status).toBe('bloqueada');
    expect(dec.divergencias[0]).toMatch(/cálculo da peça não confirma/);
  });
});
