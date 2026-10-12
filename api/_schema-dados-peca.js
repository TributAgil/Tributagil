// api/_schema-dados-peca.js
//
// Esquema da chamada estruturada que alimenta a PEÇA (api/gerar-peca.js).
// A extração da fase 1 (_schema-extracao.js) não é persistida e o parecer
// salvo não liga fato a inscrição nem registra tipo de declaração, entrega da
// declaração ou pagamento antecipado — então a peça tem a sua própria
// extração, só de FATOS COM FONTE. Zero julgamento jurídico: nada aqui diz
// "prescrito" ou "decaído"; quem calcula e decide é api/_motor-peca.js.
//
// REGRA DE OURO (a mesma da extração): campo que não consta dos documentos
// recebe "" (ou "não consta" nos enums de três estados). NUNCA inventar,
// presumir ou "completar" por inferência — a peça trata o vazio como
// [PREENCHER] e o motor trata "não consta" como dado faltante que bloqueia.
//
// Datas sempre DD/MM/AAAA. Cada data vem em { data, fonte }, onde `fonte` é o
// nome do documento anexado de onde ela foi lida.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

const TEXTO = { type: 'STRING' };
const DATA_COM_FONTE = {
  type: 'OBJECT',
  propertyOrdering: ['data', 'fonte'],
  required: ['data', 'fonte'],
  properties: {
    data: { type: 'STRING', description: 'DD/MM/AAAA, exatamente como consta do documento. Vazio ("") se não constar.' },
    fonte: { type: 'STRING', description: 'Nome do documento anexado de onde a data foi lida. Vazio se a data for vazia.' },
  },
};

export const ESQUEMA_DADOS_PECA = {
  type: 'OBJECT',
  propertyOrdering: [
    'alerta_ilegivel',
    'ente_credor',
    'orgao_cobranca',
    'processo_execucao',
    'executado',
    'inscricoes',
  ],
  required: ['alerta_ilegivel', 'ente_credor', 'orgao_cobranca', 'processo_execucao', 'executado', 'inscricoes'],
  properties: {
    alerta_ilegivel: {
      type: 'STRING',
      description:
        'Vazio ("") quando os documentos foram lidos normalmente. Preenchido SOMENTE quando um documento está ilegível, corrompido ou vazio a ponto de impedir a extração — descreva qual e o problema.',
    },

    ente_credor: {
      type: 'OBJECT',
      propertyOrdering: ['esfera', 'nome'],
      required: ['esfera', 'nome'],
      properties: {
        esfera: { type: 'STRING', enum: ['União', 'Estado', 'Município', ''], description: 'Esfera do ente credor. "" se não constar.' },
        nome: { type: 'STRING', description: 'Ex.: "Fazenda Nacional", "Estado da Bahia". "" se não constar.' },
      },
    },
    orgao_cobranca: {
      type: 'STRING',
      description: 'Órgão que cobra o crédito: PGFN, PGE, Procuradoria Municipal etc. "" se não constar.',
    },

    processo_execucao: {
      type: 'OBJECT',
      propertyOrdering: ['numero', 'vara', 'comarca_secao', 'data_ajuizamento', 'data_despacho_citatorio', 'data_citacao'],
      required: ['numero', 'vara', 'comarca_secao', 'data_ajuizamento', 'data_despacho_citatorio', 'data_citacao'],
      description:
        'Execução fiscal JÁ AJUIZADA. Se os documentos não mostram execução ajuizada (só inscrição em dívida ativa), todos os campos ficam "" — isso decide o tipo de peça.',
      properties: {
        numero: { type: 'STRING', description: 'Número do processo da execução fiscal, como consta. "" se não houver execução.' },
        vara: { type: 'STRING', description: 'Vara, como consta (ex.: "3ª Vara Federal de Execução Fiscal"). "" se não constar.' },
        comarca_secao: { type: 'STRING', description: 'Comarca ou seção judiciária (ex.: "Salvador/BA"). "" se não constar.' },
        data_ajuizamento: DATA_COM_FONTE,
        data_despacho_citatorio: DATA_COM_FONTE,
        data_citacao: DATA_COM_FONTE,
      },
    },

    executado: {
      type: 'OBJECT',
      propertyOrdering: ['nome', 'documento', 'nacionalidade', 'estado_civil', 'profissao', 'endereco'],
      required: ['nome', 'documento', 'nacionalidade', 'estado_civil', 'profissao', 'endereco'],
      description: 'Executado (ou devedor, na via administrativa). O que não constar dos documentos fica "".',
      properties: {
        nome: TEXTO,
        documento: { type: 'STRING', description: 'CPF ou CNPJ, como consta. "" se não constar.' },
        nacionalidade: TEXTO,
        estado_civil: TEXTO,
        profissao: TEXTO,
        endereco: TEXTO,
      },
    },

    inscricoes: {
      type: 'ARRAY',
      minItems: 1,
      description: 'UMA entrada por inscrição/CDA presente nos documentos — nunca resumir "as demais".',
      items: {
        type: 'OBJECT',
        propertyOrdering: ['numero_cda', 'tributo', 'processo_administrativo', 'periodos', 'eventos_interruptivos'],
        required: ['numero_cda', 'tributo', 'processo_administrativo', 'periodos', 'eventos_interruptivos'],
        properties: {
          numero_cda: TEXTO,
          tributo: { type: 'STRING', description: 'Ex.: "Imposto de Renda Pessoa Física". "" se não constar.' },
          processo_administrativo: { type: 'STRING', description: 'Número do PAF de origem. "" se não constar.' },

          periodos: {
            type: 'ARRAY',
            description: 'UM item por período de apuração da inscrição.',
            items: {
              type: 'OBJECT',
              propertyOrdering: [
                'periodo',
                'modalidade_lancamento',
                'tipo_declaracao',
                'data_entrega_declaracao',
                'data_vencimento',
                'data_fato_gerador',
                'houve_pagamento_antecipado',
                'indicio_dolo_fraude_simulacao',
                'data_notificacao_lancamento',
              ],
              required: [
                'periodo',
                'modalidade_lancamento',
                'tipo_declaracao',
                'data_entrega_declaracao',
                'data_vencimento',
                'data_fato_gerador',
                'houve_pagamento_antecipado',
                'indicio_dolo_fraude_simulacao',
                'data_notificacao_lancamento',
              ],
              properties: {
                periodo: { type: 'STRING', description: 'Período de apuração como consta (ex.: "2018", "01/2015").' },
                modalidade_lancamento: {
                  type: 'STRING',
                  enum: ['homologacao_declarado', 'homologacao_nao_declarado', 'oficio'],
                  description:
                    'homologacao_declarado = o contribuinte entregou declaração que reconhece o débito; homologacao_nao_declarado = tributo por homologação sem declaração do débito; oficio = lançamento por auto de infração/notificação do Fisco.',
                },
                tipo_declaracao: {
                  type: 'STRING',
                  enum: ['DIRPF', 'DCTF', 'GIA', 'PGDAS-D', 'DEFIS', 'GFIP', 'outra', ''],
                  description: '"" se não houve declaração ou não consta.',
                },
                data_entrega_declaracao: DATA_COM_FONTE,
                data_vencimento: DATA_COM_FONTE,
                data_fato_gerador: DATA_COM_FONTE,
                houve_pagamento_antecipado: {
                  type: 'STRING',
                  enum: ['sim', 'não', 'não consta'],
                  description: 'Pagamento antecipado do tributo daquele período. "não consta" quando os documentos não permitem afirmar.',
                },
                indicio_dolo_fraude_simulacao: {
                  type: 'STRING',
                  enum: ['sim', 'não', 'não consta'],
                  description: '"sim" SOMENTE se um documento afirma dolo, fraude ou simulação (ex.: multa qualificada). Na dúvida, "não consta".',
                },
                data_notificacao_lancamento: DATA_COM_FONTE,
              },
            },
          },

          eventos_interruptivos: {
            type: 'ARRAY',
            description:
              'Eventos POTENCIALMENTE interruptivos/suspensivos desta inscrição (parcelamento, pagamento, protesto, compensação). Liste TODOS que constarem, sem julgar se de fato interrompem. Vazio se o extrato de débito não mostra nenhum.',
            items: {
              type: 'OBJECT',
              propertyOrdering: ['tipo', 'data', 'fonte'],
              required: ['tipo', 'data', 'fonte'],
              properties: {
                tipo: { type: 'STRING', enum: ['parcelamento', 'pagamento', 'protesto', 'compensacao'] },
                data: { type: 'STRING', description: 'DD/MM/AAAA. Vazio se não constar.' },
                fonte: TEXTO,
              },
            },
          },
        },
      },
    },
  },
};

export const PROMPT_DADOS_PECA = `Você extrai FATOS de documentos de um processo tributário para preencher uma peça processual. Você NÃO analisa, NÃO interpreta e NÃO calcula prazos — só transcreve o que está escrito.

TOLERÂNCIA ZERO PARA INVENÇÃO:
- Campo que não consta dos documentos recebe "" (ou "não consta" nos campos de três estados). Nunca presuma, nunca complete por inferência, nunca use conhecimento externo.
- Datas sempre em DD/MM/AAAA, exatamente como constam; cada data acompanhada do nome do documento anexado em "fonte".
- Uma entrada em "inscricoes" para CADA CDA/inscrição presente; um item em "periodos" para CADA período de apuração dela. Nunca resuma "as demais".
- Execução fiscal ajuizada = há número de processo de execução ou data de ajuizamento nos documentos. Se só há inscrição em dívida ativa, deixe todo "processo_execucao" vazio.
- "eventos_interruptivos": liste TODO parcelamento, pagamento, protesto e compensação que constar do extrato de débito, do anexo de ocorrências ou dos andamentos, sem julgar se interrompem o prazo.
- "houve_pagamento_antecipado" e "indicio_dolo_fraude_simulacao": use "não consta" quando os documentos não permitirem afirmar. "sim" em dolo/fraude/simulação só se um documento afirmar isso expressamente.
- Se um documento estiver ilegível, preencha "alerta_ilegivel" e extraia o que for possível dos demais.`;

export default ESQUEMA_DADOS_PECA;
