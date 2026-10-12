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
    'eventos_execucao',
  ],
  required: ['alerta_ilegivel', 'ente_credor', 'orgao_cobranca', 'processo_execucao', 'executado', 'inscricoes', 'eventos_execucao'],
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
        esfera: { type: 'STRING', enum: ['União', 'Estado', 'Município', 'não consta'], description: 'Esfera do ente credor. "não consta" se não constar.' },
        nome: { type: 'STRING', description: 'Ex.: "Fazenda Nacional", "Estado da Bahia". "" se não constar.' },
      },
    },
    orgao_cobranca: {
      type: 'STRING',
      description: 'Órgão que cobra o crédito: PGFN, PGE, Procuradoria Municipal etc. "" se não constar.',
    },

    processo_execucao: {
      type: 'OBJECT',
      propertyOrdering: ['numero', 'exequente', 'vara', 'comarca_secao', 'data_ajuizamento', 'data_despacho_citatorio', 'data_citacao'],
      required: ['numero', 'exequente', 'vara', 'comarca_secao', 'data_ajuizamento', 'data_despacho_citatorio', 'data_citacao'],
      description:
        'Execução fiscal JÁ AJUIZADA. Se os documentos não mostram execução ajuizada (só inscrição em dívida ativa), todos os campos ficam "" — isso decide o tipo de peça.',
      properties: {
        numero: { type: 'STRING', description: 'Número do processo da execução fiscal, como consta. "" se não houver execução.' },
        exequente: { type: 'STRING', description: 'Exequente por extenso, como consta (ex.: "União (Fazenda Nacional)", "Estado da Bahia"). "" se não constar.' },
        vara: { type: 'STRING', description: 'SÓ a vara, como consta (ex.: "3ª Vara Federal de Execução Fiscal"), SEM a seção/subseção/comarca (essa vai em comarca_secao). "" se não constar.' },
        comarca_secao: { type: 'STRING', description: 'Comarca, seção ou subseção judiciária (ex.: "Salvador/BA", "Subseção Judiciária de Vitória da Conquista"). "" se não constar.' },
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
                'fonte_pagamento_antecipado',
                'imputacao_dolo_fraude_simulacao',
                'imputacao_dolo_fraude_simulacao_fonte',
                'lancamento_anterior_anulado_vicio_formal',
                'lancamento_anterior_anulado_vicio_formal_fonte',
                'data_decisao_anulatoria',
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
                'fonte_pagamento_antecipado',
                'imputacao_dolo_fraude_simulacao',
                'imputacao_dolo_fraude_simulacao_fonte',
                'lancamento_anterior_anulado_vicio_formal',
                'lancamento_anterior_anulado_vicio_formal_fonte',
                'data_decisao_anulatoria',
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
                  enum: ['DIRPF', 'DCTF', 'GIA', 'PGDAS-D', 'DEFIS', 'GFIP', 'outra', 'não consta'],
                  description: '"não consta" se não houve declaração ou não consta.',
                },
                data_entrega_declaracao: DATA_COM_FONTE,
                data_vencimento: DATA_COM_FONTE,
                data_fato_gerador: DATA_COM_FONTE,
                houve_pagamento_antecipado: {
                  type: 'STRING',
                  enum: ['sim', 'não', 'não consta'],
                  description: 'Pagamento antecipado do tributo daquele período. "não consta" quando os documentos não permitem afirmar.',
                },
                fonte_pagamento_antecipado: { type: 'STRING', description: 'Documento onde consta o pagamento antecipado ("" se não houve ou não consta).' },
                imputacao_dolo_fraude_simulacao: {
                  type: 'STRING',
                  enum: ['sim', 'não', 'não consta'],
                  description:
                    '"sim" SOMENTE se o lançamento/auto de infração IMPUTA ao contribuinte dolo, fraude ou simulação (ex.: multa qualificada de 150%). "não" quando o lançamento foi lido e não há imputação. "não consta" quando os documentos não permitem afirmar.',
                },
                imputacao_dolo_fraude_simulacao_fonte: { type: 'STRING', description: 'Documento lido para essa conclusão. "" se "não consta".' },
                lancamento_anterior_anulado_vicio_formal: {
                  type: 'STRING',
                  enum: ['sim', 'não', 'não consta'],
                  description:
                    '"sim" SOMENTE se os documentos mostram que um lançamento ANTERIOR do mesmo período foi anulado por vício formal (art. 173, II, CTN). "não consta" quando não há como afirmar.',
                },
                lancamento_anterior_anulado_vicio_formal_fonte: { type: 'STRING', description: 'Documento de onde isso foi lido. "" se não consta.' },
                data_decisao_anulatoria: DATA_COM_FONTE,
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

    eventos_execucao: {
      type: 'ARRAY',
      description:
        'Eventos do PROCESSO DE EXECUÇÃO usados para calcular a prescrição intercorrente (art. 40 da LEF). Vazio se não há execução ajuizada. Liste TODOS os que constarem, sem julgar o efeito.',
      items: {
        type: 'OBJECT',
        propertyOrdering: ['categoria', 'data', 'inscricao', 'objeto_nao_localizado', 'fonte'],
        required: ['categoria', 'data', 'inscricao', 'objeto_nao_localizado', 'fonte'],
        properties: {
          categoria: {
            type: 'STRING',
            enum: ['intimacao_nao_localizacao_bens', 'requerimento_constricao', 'penhora_constricao', 'citacao'],
            description:
              'intimacao_nao_localizacao_bens = a Fazenda tomou ciência de que o devedor ou bens penhoráveis não foram localizados (art. 40 LEF), data da CIÊNCIA; requerimento_constricao = pedido de Sisbajud/Renajud/Infojud/penhora protocolado pela Fazenda, data do PROTOCOLO; penhora_constricao = constrição efetivamente realizada (resultado), data em que se efetivou; citacao = citação do executado, ainda que por edital.',
          },
          data: { type: 'STRING', description: 'DD/MM/AAAA. Evento sem data legível não entra.' },
          inscricao: { type: 'STRING', description: 'Número da CDA a que o evento se refere. "" se o evento vale para a execução inteira (o caso normal).' },
          objeto_nao_localizado: {
            type: 'STRING',
            enum: ['devedor', 'bens', 'devedor_e_bens', 'não consta'],
            description: 'SÓ para intimacao_nao_localizacao_bens: o que não foi localizado. Para as demais categorias, "não consta".',
          },
          fonte: { type: 'STRING', description: 'Nome do documento anexado de onde o evento foi lido.' },
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
- "houve_pagamento_antecipado" e "imputacao_dolo_fraude_simulacao": use "não consta" quando os documentos não permitirem afirmar. "sim" em dolo/fraude/simulação só se o lançamento IMPUTA isso expressamente ao contribuinte (ex.: multa qualificada). Cada conclusão com o documento lido em "..._fonte".
- "eventos_execucao": só para execução já ajuizada. Registre TODA ciência da Fazenda sobre não localização do devedor ou de bens (com o que não foi localizado), TODO pedido de constrição (data do protocolo), TODA constrição efetiva e TODA citação, mesmo as antigas — a prescrição intercorrente depende de ver todos os episódios.
- "lancamento_anterior_anulado_vicio_formal": só "sim" se um documento mostra que um lançamento anterior do mesmo período foi anulado por vício formal.
- Se um documento estiver ilegível, preencha "alerta_ilegivel" e extraia o que for possível dos demais.`;

export default ESQUEMA_DADOS_PECA;
