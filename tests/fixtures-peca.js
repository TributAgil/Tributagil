// Fixtures compartilhadas pelos testes do motor, do contexto e da renderização.
// Dados FICTÍCIOS (nenhum documento ou parte reais) que reproduzem a estrutura
// dos casos dos modelos da advogada.

export const AGORA = new Date(Date.UTC(2026, 9, 11)); // 11/10/2026

export const escritorio = {
  nome: 'Escritório Exemplo Advocacia',
  cidade: 'Brumado',
  uf: 'BA',
  email: 'contato@exemplo.adv.br',
  site: 'www.exemplo.adv.br',
  endereco: 'Rua Exemplo, 100, Centro, Brumado/BA',
  advogados: [
    { nome: 'Advogada Um', oab: '11.111', uf: 'BA', genero: 'f' },
    { nome: 'Advogada Dois', oab: '22.222', uf: 'BA', genero: 'f' },
  ],
};

export const executadoCompleto = {
  nome: 'Maria Exemplo da Silva',
  documento: '000.000.000-00',
  nacionalidade: 'brasileira',
  estado_civil: 'solteira',
  profissao: 'servidora pública',
  endereco: 'Rua das Flores, 10, Salvador/BA',
};

export const dt = (data, fonte) => ({ data, fonte });
const semData = () => dt('', '');

const processoAjuizado = (extra = {}) => ({
  numero: '1234567-60.2025.4.01.3300',
  exequente: 'União (Fazenda Nacional)',
  vara: '3ª Vara Federal de Execução Fiscal',
  comarca_secao: 'Salvador/BA',
  data_ajuizamento: dt('20/09/2025', 'peticao_inicial.pdf'),
  data_despacho_citatorio: dt('29/09/2025', 'despacho.pdf'),
  data_citacao: semData(),
  ...extra,
});

const semExecucao = () => ({
  numero: '',
  exequente: '',
  vara: '',
  comarca_secao: 'Salvador/BA',
  data_ajuizamento: semData(),
  data_despacho_citatorio: semData(),
  data_citacao: semData(),
});

/** Período com TODOS os campos do schema (neutros), para as fixtures só sobrescreverem o que importa. */
export const periodoNeutro = (extra = {}) => ({
  periodo: '',
  modalidade_lancamento: '',
  tipo_declaracao: '',
  data_entrega_declaracao: semData(),
  data_vencimento: semData(),
  data_fato_gerador: semData(),
  houve_pagamento_antecipado: 'não consta',
  fonte_pagamento_antecipado: '',
  imputacao_dolo_fraude_simulacao: 'não consta',
  imputacao_dolo_fraude_simulacao_fonte: '',
  lancamento_anterior_anulado_vicio_formal: 'não consta',
  lancamento_anterior_anulado_vicio_formal_fonte: '',
  data_decisao_anulatoria: semData(),
  data_notificacao_lancamento: semData(),
  ...extra,
});

/** Execução ajuizada em 20/09/2025; 2 períodos DIRPF (um por regra de termo inicial); protesto após a consumação. */
export function dadosPrescricao({ executado = executadoCompleto, ajuizada = true, protesto = true, paf = '12345.000000/2024-00' } = {}) {
  return {
    alerta_ilegivel: '',
    ente_credor: { esfera: 'União', nome: 'Fazenda Nacional' },
    orgao_cobranca: 'PGFN',
    processo_execucao: ajuizada ? processoAjuizado() : semExecucao(),
    executado,
    inscricoes: [
      {
        numero_cda: '12 3 45 678901-23',
        tributo: 'Imposto de Renda Pessoa Física',
        processo_administrativo: paf,
        periodos: [
          periodoNeutro({
            periodo: '2018',
            modalidade_lancamento: 'homologacao_declarado',
            tipo_declaracao: 'DIRPF',
            data_entrega_declaracao: dt('27/01/2020', 'recibo_2018.pdf'),
            data_vencimento: dt('30/04/2019', 'extrato_cda.pdf'), // anterior à entrega
          }),
          periodoNeutro({
            periodo: '2019',
            modalidade_lancamento: 'homologacao_declarado',
            tipo_declaracao: 'DIRPF',
            data_entrega_declaracao: dt('14/04/2020', 'recibo_2019.pdf'),
            data_vencimento: dt('30/06/2020', 'extrato_cda.pdf'), // posterior à entrega
          }),
        ],
        eventos_interruptivos: protesto ? [{ tipo: 'protesto', data: '03/07/2025', fonte: 'extrato_cda.pdf' }] : [],
      },
    ],
    eventos_execucao: [],
  };
}

/** Período de decadência (auto de infração): FG 30/06/2005, vencimento 31/07/2005, sem pagamento antecipado → art. 173, I. */
export const periodoDecadencia = (extra = {}) =>
  periodoNeutro({
    periodo: '2005',
    modalidade_lancamento: 'oficio',
    data_fato_gerador: dt('30/06/2005', 'auto_infracao.pdf'),
    data_vencimento: dt('31/07/2005', 'auto_infracao.pdf'),
    houve_pagamento_antecipado: 'não',
    imputacao_dolo_fraude_simulacao: 'não',
    imputacao_dolo_fraude_simulacao_fonte: 'auto_infracao.pdf',
    lancamento_anterior_anulado_vicio_formal: 'não',
    data_notificacao_lancamento: dt('22/08/2013', 'auto_infracao.pdf'),
    ...extra,
  });

/**
 * Decadência. Por padrão com execução ajuizada (→ EPE); `ajuizada: false` → Revisão PGFN.
 * `pagamento` e `periodos` permitem variar a regra e a quantidade de períodos.
 */
export function dadosDecadencia({ pagamento = 'não', periodos, ajuizada = true, ente = 'União', protesto = false, tributo = 'IRPF' } = {}) {
  return {
    alerta_ilegivel: '',
    ente_credor: { esfera: ente, nome: ente === 'União' ? 'Fazenda Nacional' : 'Estado da Bahia' },
    orgao_cobranca: ente === 'União' ? 'PGFN' : 'PGE',
    processo_execucao: ajuizada
      ? processoAjuizado({ numero: '9999999-00.2014.4.01.3300', vara: '5ª Vara Federal de Execução Fiscal', data_ajuizamento: dt('10/10/2014', 'peticao_inicial.pdf'), data_despacho_citatorio: semData() })
      : semExecucao(),
    executado: executadoCompleto,
    inscricoes: [
      {
        numero_cda: '70 6 14 000111-22',
        tributo,
        processo_administrativo: '',
        periodos: periodos || [periodoDecadencia({ houve_pagamento_antecipado: pagamento })],
        eventos_interruptivos: protesto ? [{ tipo: 'protesto', data: '05/05/2015', fonte: 'extrato.pdf' }] : [],
      },
    ],
    eventos_execucao: [],
  };
}

/**
 * Intercorrente. Padrão: execução ajuizada em 2015; Fazenda ciente da não localização em 10/03/2017
 * (→ fim da suspensão 10/03/2018 → consumação 10/03/2023); nenhum evento interruptivo.
 */
export function dadosIntercorrente({ eventos, protesto = false, ajuizada = true } = {}) {
  return {
    alerta_ilegivel: '',
    ente_credor: { esfera: 'União', nome: 'Fazenda Nacional' },
    orgao_cobranca: 'PGFN',
    processo_execucao: ajuizada
      ? processoAjuizado({ numero: '5555555-10.2015.4.01.3300', data_ajuizamento: dt('15/05/2015', 'peticao_inicial.pdf'), data_despacho_citatorio: semData() })
      : semExecucao(),
    executado: executadoCompleto,
    inscricoes: [
      {
        numero_cda: '44 1 15 000999-00',
        tributo: 'IRPJ',
        processo_administrativo: '',
        periodos: [],
        eventos_interruptivos: protesto ? [{ tipo: 'protesto', data: '02/02/2016', fonte: 'extrato.pdf' }] : [],
      },
    ],
    eventos_execucao: eventos || [
      { categoria: 'intimacao_nao_localizacao_bens', data: '10/03/2017', inscricao: '', objeto_nao_localizado: 'devedor_e_bens', fonte: 'certidao_oficial.pdf' },
    ],
  };
}

export const intimacao = (data, objeto = 'devedor_e_bens', fonte = 'certidao_oficial.pdf') => ({
  categoria: 'intimacao_nao_localizacao_bens',
  data,
  inscricao: '',
  objeto_nao_localizado: objeto,
  fonte,
});
export const evento = (categoria, data, fonte = 'movimentacao.pdf') => ({ categoria, data, inscricao: '', objeto_nao_localizado: 'não consta', fonte });

export const parecerFavoravel = (tipo) => [{ tipo, severidade: 'favoravel', confianca: 90 }];
