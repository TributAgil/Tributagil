// api/_schema-parecer.js
//
// Esquema de saída OBRIGATÓRIO do parecer (Gemini `responseSchema`).
//
// POR QUE ISSO EXISTE: sem esquema, o modelo recebia apenas
// `responseMimeType: 'application/json'` — o que garante JSON válido, mas
// deixa livre QUANTOS e QUAIS itens entregar. Três execuções do mesmo
// processo devolveram 4, 5 e 6 fatos, com CDAs presentes em uma execução e
// ausentes nas outras. Não era divergência de estilo: era divergência da
// base fática do parecer.
//
// O QUE ISSO GARANTE: a FORMA. Todas as chaves sempre presentes, os campos
// de classificação restritos aos valores válidos, e um piso de itens onde
// faz sentido.
//
// O QUE ISSO NÃO GARANTE: o CONTEÚDO. Nenhum esquema obriga o modelo a
// enxergar a 4ª CDA. Quem faz esse trabalho é a regra de enumeração fechada
// no prompt (ver `REGRA_ENUMERACAO` abaixo, usada em CerebroTributario.jsx)
// somada a `GEMINI_TEMPERATURE=0`. Os três se reforçam; nenhum basta sozinho.
//
// SOBRE O ALERTA DE DADOS INSUFICIENTES: o contrato antigo mandava o modelo
// responder APENAS `{"alerta_dados_insuficientes": "..."}` nesse caso, o que
// é incompatível com um esquema que exige as demais chaves. A solução é a
// chave existir SEMPRE, com string vazia quando está tudo certo — o teste do
// frontend (`if (resultadoIA.alerta_dados_insuficientes)`) continua valendo,
// porque string vazia é falsy. Nada mudou do lado da interface.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

const TEXTO = { type: 'STRING' };

export const ESQUEMA_PARECER = {
  type: 'OBJECT',
  // propertyOrdering: o Gemini respeita esta ordem ao serializar. Ordem de
  // saída estável = diffs entre versões do parecer legíveis.
  propertyOrdering: [
    'alerta_dados_insuficientes',
    'metadata',
    'fatos_importantes',
    'raciocinio',
    'conclusoes',
    'recomendacoes',
  ],
  required: [
    'alerta_dados_insuficientes',
    'metadata',
    'fatos_importantes',
    'raciocinio',
    'conclusoes',
    'recomendacoes',
  ],
  properties: {
    alerta_dados_insuficientes: {
      type: 'STRING',
      description:
        'Vazio ("") quando a análise foi concluída. Preenchido SOMENTE quando falta dado essencial, no formato "[ALERTA DE DADOS INSUFICIENTES] Necessário informar a data exata de <dado> para prosseguir." Quando preenchido, os demais campos podem vir vazios.',
    },

    metadata: {
      type: 'OBJECT',
      propertyOrdering: ['processo', 'parte_autora', 'parte_reu', 'valor_causa', 'local'],
      required: ['processo', 'parte_autora', 'parte_reu', 'valor_causa', 'local'],
      properties: {
        processo: TEXTO,
        parte_autora: TEXTO,
        parte_reu: TEXTO,
        valor_causa: TEXTO,
        local: TEXTO,
      },
      description:
        'Extraído EXATAMENTE dos documentos. Campo ausente nos autos recebe exatamente "Não identificado" — nunca inventar.',
    },

    fatos_importantes: {
      type: 'ARRAY',
      // O piso é o ponto do esquema que ataca a omissão silenciosa: um
      // parecer de execução fiscal sempre tem, no mínimo, notificação,
      // inscrição em dívida ativa e ajuizamento.
      minItems: 3,
      description:
        'Linha do tempo do caso, em ORDEM CRONOLÓGICA CRESCENTE. Um item por marco temporal, seguindo a regra de enumeração fechada do prompt.',
      items: {
        type: 'OBJECT',
        propertyOrdering: ['id', 'categoria', 'data', 'descricao', 'fonte', 'relevancia'],
        required: ['id', 'categoria', 'data', 'descricao', 'fonte', 'relevancia'],
        properties: {
          id: { type: 'INTEGER' },
          categoria: { type: 'STRING', enum: ['cronologica', 'processual', 'tributaria'] },
          data: { type: 'STRING', description: 'Formato DD/MM/AAAA.' },
          descricao: TEXTO,
          fonte: {
            type: 'STRING',
            description: 'Nome do documento anexado de onde a data foi extraída. Obrigatório.',
          },
          relevancia: { type: 'STRING', enum: ['critica', 'alta', 'media', 'baixa'] },
        },
      },
    },

    raciocinio: {
      type: 'ARRAY',
      minItems: 1,
      description: 'Um item por módulo do motor efetivamente aplicado.',
      items: {
        type: 'OBJECT',
        propertyOrdering: ['id', 'premissa', 'aplicacao', 'conclusao_logica', 'referencia'],
        required: ['id', 'premissa', 'aplicacao', 'conclusao_logica', 'referencia'],
        properties: {
          id: { type: 'INTEGER' },
          premissa: { type: 'STRING', description: 'A regra jurídica (DIREITO).' },
          aplicacao: { type: 'STRING', description: 'A aplicação ao caso concreto, com datas (FATO).' },
          conclusao_logica: TEXTO,
          referencia: { type: 'STRING', description: 'CTN / LEF / Súmula / REsp.' },
        },
      },
    },

    conclusoes: {
      type: 'ARRAY',
      minItems: 1,
      items: {
        type: 'OBJECT',
        propertyOrdering: [
          'id', 'tipo', 'severidade', 'titulo', 'resumo', 'fundamento_legal', 'confianca',
        ],
        required: [
          'id', 'tipo', 'severidade', 'titulo', 'resumo', 'fundamento_legal', 'confianca',
        ],
        properties: {
          id: { type: 'INTEGER' },
          tipo: {
            type: 'STRING',
            enum: ['prescricao', 'decadencia', 'prescricao_intercorrente', 'cautela', 'procedimental'],
          },
          severidade: {
            type: 'STRING',
            enum: ['favoravel', 'atencao', 'neutro', 'desfavoravel'],
          },
          titulo: TEXTO,
          resumo: TEXTO,
          fundamento_legal: TEXTO,
          confianca: { type: 'INTEGER', description: '0 a 100.' },
        },
      },
    },

    recomendacoes: {
      type: 'ARRAY',
      items: TEXTO,
      description: 'Ações estratégicas. Vazio quando não houver recomendação cabível.',
    },
  },
};

// Regra de enumeração fechada — o par obrigatório do esquema.
//
// O esquema impede um parecer malformado; esta regra impede um parecer
// INCOMPLETO. Sem ela, "fatos importantes" continua sendo um juízo de valor
// do modelo, e o que é "importante" muda a cada execução.
export const REGRA_ENUMERACAO = `ENUMERAÇÃO OBRIGATÓRIA DE "fatos_importantes" — regra fechada, não é juízo de relevância:
1. Percorra os documentos e identifique TODAS as CDAs / inscrições em dívida ativa presentes, sem exceção. Para CADA UMA, registre um item para cada marco que constar: vencimento do tributo, notificação do lançamento, inscrição em dívida ativa e termo inicial da prescrição. Se o processo tem 4 CDAs, as 4 aparecem — nunca resuma "as demais CDAs" nem selecione as mais relevantes.
2. Registre sempre, quando constarem dos autos: ajuizamento da execução, despacho que ordena a citação, citação do executado, penhora/constrição, e intimação da Fazenda sobre não localização de devedor ou bens.
3. Percorra o "ANEXO DE OCORRÊNCIAS COM POSSÍVEL IMPACTO NO PRAZO DA PRESCRIÇÃO" (documento avulso da PGFN, costuma vir como "Outros Documentos") e registre TODAS as linhas, uma por item, com a data e a inscrição. Os rótulos aparecem crus e devem ser traduzidos sem serem descartados: "CADASTR SOLIC NEGOC SISPAR" = solicitação de negociação; "CADASTR DESP DEFERIDO SISPAR" = parcelamento deferido (adesão); "DESISTENCIA PARC SISPAR" = desistência; "RESCISAO PARC. SISPAR" = rescisão; "INCLUSAO DE PAGAMENTO" = pagamento incluído. O anexo se chama assim porque a própria Fazenda o considera relevante para o prazo — nunca o ignore. Uma rescisão sem a adesão correspondente é sinal de leitura incompleta: volte ao anexo.
4. Registre CADA pagamento constante do "EXTRATO DE PAGAMENTOS" da CDA (normalmente Anexo 3) e de extratos de débito, um item por pagamento, com a data, o valor e a inscrição a que se refere. Relevância mínima "alta": pagamento parcial interrompe a prescrição (art. 174, parágrafo único, IV) e é frequentemente o fato que decide a exigibilidade de uma inscrição. Nunca trate pagamento como detalhe contábil, nem o agregue com outros.
4.1. Registre CADA protesto extrajudicial e cada cancelamento/anuência de cancelamento constante do anexo de protestos, com data e inscrição.
5. Ordene os itens por DATA CRESCENTE, do mais antigo para o mais recente, misturando livremente as CDAs — a ordenação é pela data, nunca por documento.
6. Todo item cita em "fonte" o documento de origem. Data que não constar de documento não entra na lista.`;

export default ESQUEMA_PARECER;
