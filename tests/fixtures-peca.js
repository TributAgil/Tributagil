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
    { nome: 'Advogada Um', oab: '11.111', uf: 'BA' },
    { nome: 'Advogada Dois', oab: '22.222', uf: 'BA' },
  ],
};

const executadoCompleto = {
  nome: 'Maria Exemplo da Silva',
  documento: '000.000.000-00',
  nacionalidade: 'brasileira',
  estado_civil: 'solteira',
  profissao: 'servidora pública',
  endereco: 'Rua das Flores, 10, Salvador/BA',
};

const dt = (data, fonte) => ({ data, fonte });

/** Execução ajuizada em 20/09/2025; 2 períodos DIRPF (um por regra de termo inicial); protesto após a consumação. */
export function dadosPrescricao({ executado = executadoCompleto, ajuizada = true, protesto = true, paf = '12345.000000/2024-00' } = {}) {
  return {
    alerta_ilegivel: '',
    ente_credor: { esfera: 'União', nome: 'Fazenda Nacional' },
    orgao_cobranca: 'PGFN',
    processo_execucao: ajuizada
      ? {
          numero: '1234567-60.2025.4.01.3300',
          vara: '3ª Vara Federal de Execução Fiscal',
          comarca_secao: 'Salvador/BA',
          data_ajuizamento: dt('20/09/2025', 'peticao_inicial.pdf'),
          data_despacho_citatorio: dt('29/09/2025', 'despacho.pdf'),
          data_citacao: dt('', ''),
        }
      : { numero: '', vara: '', comarca_secao: 'Salvador/BA', data_ajuizamento: dt('', ''), data_despacho_citatorio: dt('', ''), data_citacao: dt('', '') },
    executado,
    inscricoes: [
      {
        numero_cda: '12 3 45 678901-23',
        tributo: 'Imposto de Renda Pessoa Física',
        processo_administrativo: paf,
        periodos: [
          {
            periodo: '2018',
            modalidade_lancamento: 'homologacao_declarado',
            tipo_declaracao: 'DIRPF',
            data_entrega_declaracao: dt('27/01/2020', 'recibo_2018.pdf'),
            data_vencimento: dt('30/04/2019', 'extrato_cda.pdf'),
            data_fato_gerador: dt('', ''),
            houve_pagamento_antecipado: 'não consta',
            indicio_dolo_fraude_simulacao: 'não consta',
            data_notificacao_lancamento: dt('', ''),
          },
          {
            periodo: '2019',
            modalidade_lancamento: 'homologacao_declarado',
            tipo_declaracao: 'DIRPF',
            data_entrega_declaracao: dt('14/04/2020', 'recibo_2019.pdf'),
            data_vencimento: dt('30/06/2020', 'extrato_cda.pdf'),
            data_fato_gerador: dt('', ''),
            houve_pagamento_antecipado: 'não consta',
            indicio_dolo_fraude_simulacao: 'não consta',
            data_notificacao_lancamento: dt('', ''),
          },
        ],
        eventos_interruptivos: protesto ? [{ tipo: 'protesto', data: '03/07/2025', fonte: 'extrato_cda.pdf' }] : [],
      },
    ],
  };
}

/** Decadência (lançamento de ofício sem pagamento antecipado → art. 173, I). */
export function dadosDecadencia({ pagamento = 'não' } = {}) {
  return {
    alerta_ilegivel: '',
    ente_credor: { esfera: 'União', nome: 'Fazenda Nacional' },
    orgao_cobranca: 'PGFN',
    processo_execucao: {
      numero: '9999999-00.2014.4.01.3300',
      vara: '5ª Vara Federal de Execução Fiscal',
      comarca_secao: 'Salvador/BA',
      data_ajuizamento: dt('10/10/2014', 'peticao_inicial.pdf'),
      data_despacho_citatorio: dt('', ''),
      data_citacao: dt('', ''),
    },
    executado: executadoCompleto,
    inscricoes: [
      {
        numero_cda: '70 6 14 000111-22',
        tributo: 'IRPF',
        processo_administrativo: '',
        periodos: [
          {
            periodo: '2005',
            modalidade_lancamento: 'oficio',
            tipo_declaracao: '',
            data_entrega_declaracao: dt('', ''),
            data_vencimento: dt('', ''),
            data_fato_gerador: dt('30/06/2005', 'auto_infracao.pdf'),
            houve_pagamento_antecipado: pagamento,
            indicio_dolo_fraude_simulacao: 'não',
            data_notificacao_lancamento: dt('22/08/2013', 'auto_infracao.pdf'),
          },
        ],
        eventos_interruptivos: [],
      },
    ],
  };
}

export const parecerFavoravel = (tipo) => [{ tipo, severidade: 'favoravel', confianca: 90 }];
