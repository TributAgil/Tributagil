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
const REQUISITO = { type: 'STRING', enum: ['consta', 'ausente', 'não verificável'] };
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
    'redirecionamento',
  ],
  required: ['alerta_ilegivel', 'ente_credor', 'orgao_cobranca', 'processo_execucao', 'executado', 'inscricoes', 'eventos_execucao', 'redirecionamento'],
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
        propertyOrdering: [
          'numero_cda', 'tributo', 'processo_administrativo', 'data_inscricao', 'valor_consolidado', 'cda_anexada',
          'corresponsaveis', 'requisitos_cda', 'periodos', 'eventos_interruptivos',
        ],
        required: [
          'numero_cda', 'tributo', 'processo_administrativo', 'data_inscricao', 'valor_consolidado', 'cda_anexada',
          'corresponsaveis', 'requisitos_cda', 'periodos', 'eventos_interruptivos',
        ],
        properties: {
          numero_cda: TEXTO,
          tributo: { type: 'STRING', description: 'Ex.: "Imposto de Renda Pessoa Física". "" se não constar.' },
          processo_administrativo: { type: 'STRING', description: 'Número do PAF de origem. "" se não constar.' },
          data_inscricao: DATA_COM_FONTE,
          valor_consolidado: {
            type: 'STRING',
            description: 'Valor da dívida desta inscrição como consta (ex.: "R$ 12.345,67"), o mais atualizado que constar. "" se não constar.',
          },
          cda_anexada: {
            type: 'STRING',
            enum: ['sim', 'não'],
            description: '"sim" se o documento da própria CDA (certidão de dívida ativa ou termo de inscrição) está entre os anexos; "não" se só há extrato, andamentos ou outros documentos.',
          },
          corresponsaveis: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Nomes que a CDA lista como corresponsáveis (sócios, administradores). Vazio se não houver ou se a CDA não está anexada.',
          },
          requisitos_cda: {
            type: 'OBJECT',
            description:
              'Para cada requisito do art. 202 do CTN / art. 2º, § 5º, da LEF: "consta" se a CDA anexada o traz; "ausente" SOMENTE se a CDA está anexada e o requisito NÃO aparece nela; "não verificável" se a CDA não está anexada ou o trecho está ilegível.',
            propertyOrdering: [
              'nome_devedor', 'domicilio', 'valor_originario', 'forma_calculo_juros_encargos', 'origem_natureza_fundamento_legal',
              'data_numero_inscricao', 'processo_administrativo',
            ],
            required: [
              'nome_devedor', 'domicilio', 'valor_originario', 'forma_calculo_juros_encargos', 'origem_natureza_fundamento_legal',
              'data_numero_inscricao', 'processo_administrativo',
            ],
            properties: {
              nome_devedor: REQUISITO,
              domicilio: REQUISITO,
              valor_originario: REQUISITO,
              forma_calculo_juros_encargos: { ...REQUISITO, description: 'Termo inicial e forma de calcular juros de mora e demais encargos, com o fundamento legal.' },
              origem_natureza_fundamento_legal: { ...REQUISITO, description: 'Origem, natureza e fundamento legal da dívida.' },
              data_numero_inscricao: REQUISITO,
              processo_administrativo: { ...REQUISITO, description: 'Número do processo administrativo ou do auto de infração.' },
            },
          },

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
                'quitacao_integral',
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
                'quitacao_integral',
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
                    '"sim" SOMENTE se o lançamento/auto de infração IMPUTA ao contribuinte dolo, fraude ou simulação (ex.: multa qualificada de 150%). "não" SOMENTE se o documento AFIRMA expressamente que não há imputação ou traz a multa de ofício simples (ex.: 75%). Se o documento é omisso sobre multa e qualificação, ou não traz o auto de infração, o correto é "não consta": a ausência de menção NÃO é "não".',
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
                quitacao_integral: {
                  type: 'OBJECT',
                  description:
                    'Pagamento que QUITOU INTEGRALMENTE o débito deste período (comprovante, DARF, extrato mostrando "pago"/"quitado"). Pagamento parcial não entra aqui (vai em eventos_interruptivos).',
                  propertyOrdering: ['situacao', 'data', 'fonte'],
                  required: ['situacao', 'data', 'fonte'],
                  properties: {
                    situacao: { type: 'STRING', enum: ['sim', 'não', 'não consta'], description: '"sim" só se um documento comprova a quitação integral; "não consta" quando os documentos não permitem afirmar.' },
                    data: { type: 'STRING', description: 'DD/MM/AAAA do pagamento. "" se não constar.' },
                    fonte: { type: 'STRING', description: 'Documento que comprova. "" se não houver.' },
                  },
                },
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
              'intimacao_nao_localizacao_bens = a FAZENDA foi intimada, teve vista ou tomou ciência de que o devedor ou bens penhoráveis não foram localizados (art. 40 LEF), data da CIÊNCIA DA FAZENDA. NÃO é a data do AR devolvido, do mandado ou da certidão negativa do oficial de justiça: essa só vale se o documento mostrar que a Fazenda foi intimada dela, e então a data é a da intimação/ciência; requerimento_constricao = pedido de Sisbajud/Renajud/Infojud/penhora protocolado pela Fazenda, data do PROTOCOLO; penhora_constricao = constrição efetivamente realizada (resultado), data em que se efetivou; citacao = citação do executado, ainda que por edital.',
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

    redirecionamento: {
      type: 'OBJECT',
      description:
        'Redirecionamento da execução fiscal ao sócio/administrador (art. 135, III, do CTN). Se os documentos não mostram pedido ou decisão de redirecionamento, "houve" = "não consta" e o resto vazio.',
      propertyOrdering: [
        'houve', 'socio_nome', 'socio_documento', 'socio_consta_na_cda', 'fundamento', 'data_dissolucao_irregular',
        'socio_gerente_na_dissolucao', 'data_saida_socio', 'data_pedido_redirecionamento', 'fonte',
      ],
      required: [
        'houve', 'socio_nome', 'socio_documento', 'socio_consta_na_cda', 'fundamento', 'data_dissolucao_irregular',
        'socio_gerente_na_dissolucao', 'data_saida_socio', 'data_pedido_redirecionamento', 'fonte',
      ],
      properties: {
        houve: { type: 'STRING', enum: ['sim', 'não', 'não consta'], description: '"sim" se a Fazenda pediu ou o juízo deferiu a inclusão de sócio/administrador no polo passivo.' },
        socio_nome: { type: 'STRING', description: 'Nome do sócio/administrador redirecionado. "" se não houve.' },
        socio_documento: { type: 'STRING', description: 'CPF do sócio, como consta. "".' },
        socio_consta_na_cda: { type: 'STRING', enum: ['sim', 'não', 'não consta'], description: '"sim" se o nome do sócio JÁ consta da CDA como corresponsável; "não" se a CDA anexada não o traz; "não consta" se a CDA não está anexada.' },
        fundamento: {
          type: 'STRING',
          enum: ['mero_inadimplemento', 'dissolucao_irregular', 'outro', 'não consta'],
          description: 'O fundamento que a Fazenda/decisão invocou: mero_inadimplemento = só a falta de pagamento; dissolucao_irregular = empresa não encontrada no domicílio fiscal (certidão do oficial, Súmula 435/STJ); outro = outro ato do art. 135 (fraude, excesso de poderes...).',
        },
        data_dissolucao_irregular: DATA_COM_FONTE,
        socio_gerente_na_dissolucao: {
          type: 'STRING',
          enum: ['sim', 'não', 'não consta'],
          description: 'O sócio tinha poderes de administração na data em que a dissolução irregular foi constatada? Leia o contrato social / ficha da Junta. "não consta" se não há como afirmar.',
        },
        data_saida_socio: { ...DATA_COM_FONTE, description: 'Data em que o sócio se retirou regularmente da sociedade (alteração contratual registrada), se constar.' },
        data_pedido_redirecionamento: DATA_COM_FONTE,
        fonte: { type: 'STRING', description: 'Documento(s) de onde o redirecionamento foi lido.' },
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
- "houve_pagamento_antecipado" e "imputacao_dolo_fraude_simulacao": use "não consta" quando os documentos não permitirem afirmar. "sim" em dolo/fraude/simulação só se o lançamento IMPUTA isso expressamente ao contribuinte (ex.: multa qualificada). "não" em dolo/fraude/simulação só se o documento AFIRMA que não há imputação ou traz a multa de ofício simples (ex.: 75%); documento que não menciona multa nem qualificação é "não consta", nunca "não". Cada conclusão com o documento lido em "..._fonte".
- "eventos_execucao": só para execução já ajuizada. Registre TODA ciência da Fazenda sobre não localização do devedor ou de bens (com o que não foi localizado; AR devolvido, mandado negativo ou certidão do oficial de justiça NÃO são a ciência da Fazenda: sem intimação ou ciência da Fazenda no documento, não registre o evento), TODO pedido de constrição (data do protocolo), TODA constrição efetiva e TODA citação, mesmo as antigas — a prescrição intercorrente depende de ver todos os episódios.
- "lancamento_anterior_anulado_vicio_formal": só "sim" se um documento mostra que um lançamento anterior do mesmo período foi anulado por vício formal.
- "requisitos_cda": avalie SÓ se o documento da CDA (ou do termo de inscrição) está anexado ("cda_anexada" = "sim"); sem a CDA, todos ficam "não verificável". "ausente" só quando o requisito de fato não aparece na CDA anexada.
- "quitacao_integral": "sim" SOMENTE com documento que comprove o pagamento integral do débito daquele período; pagamento parcial fica em "eventos_interruptivos".
- "redirecionamento": transcreva o pedido/decisão de inclusão do sócio no polo passivo e os documentos societários (contrato, alterações, ficha da Junta, certidão do oficial de justiça), sem julgar se o redirecionamento é devido.
- Se um documento estiver ilegível, preencha "alerta_ilegivel" e extraia o que for possível dos demais.`;

export default ESQUEMA_DADOS_PECA;
