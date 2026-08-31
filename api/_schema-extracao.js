// api/_schema-extracao.js
//
// Fase 1 do parecer: EXTRAÇÃO PURA, sem julgamento jurídico.
//
// POR QUE ESTA FASE EXISTE: temperatura 0 + responseSchema + regra de
// enumeração (ver _schema-parecer.js) reduziram a variância entre execuções
// do mesmo processo, mas não a zeraram. Numa bateria de teste com o mesmo
// processo real, uma execução (com o esquema e a regra já em produção)
// devolveu ZERO pagamentos — a categoria de fato que decide 66% do valor da
// causa neste caso. Prompt-only bateu no teto: uma única chamada que tem que
// extrair TUDO e raciocinar sobre prescrição/decadência ao mesmo tempo
// sobrecarrega a tarefa, e sob essa carga uma categoria inteira pode sumir
// sem aviso.
//
// A saída é separar as duas tarefas em duas chamadas ao Gemini:
//   FASE 1 (este arquivo): só lista o que está escrito nos documentos. Zero
//   interpretação jurídica — nem "isso é prescrição", nem "isso é relevante".
//   Uma tarefa de LISTAR é mais estável que uma de LISTAR + JULGAR: é
//   exatamente o padrão observado nos testes (onde a instrução era
//   específica — "toda CDA", "todo pagamento" — as execuções convergiram;
//   onde dependia de julgamento de relevância, divergiram).
//
//   FASE 2 (_motor-tributagil.js + _schema-parecer.js, inalterados): recebe
//   a tabela desta fase como texto, NÃO os documentos brutos. Raciocina
//   sobre uma base fixa, em vez de garimpar datas ao mesmo tempo em que
//   aplica os módulos de decadência/prescrição.
//
// Isto não elimina toda variação (nenhuma chamada a um LLM é 100%
// determinística, nem a temperatura 0) — mas isola a variação de EXTRAÇÃO,
// que é a categoria mais perigosa (muda os fatos), da variação de
// REDAÇÃO/ÊNFASE na fase de raciocínio, que é tolerável.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

const TEXTO = { type: 'STRING' };

export const ESQUEMA_EXTRACAO = {
  type: 'OBJECT',
  propertyOrdering: ['alerta_ilegivel', 'metadata', 'eventos'],
  required: ['alerta_ilegivel', 'metadata', 'eventos'],
  properties: {
    alerta_ilegivel: {
      type: 'STRING',
      description:
        'Vazio ("") quando os documentos foram lidos normalmente. Preenchido SOMENTE quando um documento anexado está ilegível, corrompido ou vazio a ponto de impedir a extração — descreva qual documento e o problema.',
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

    eventos: {
      type: 'ARRAY',
      // Piso propositalmente alto: um processo de execução fiscal com N
      // inscrições tem, no mínimo, ~4 eventos por inscrição (vencimento,
      // notificação, inscrição em DA, ajuizamento é comum a todas) — abaixo
      // disso é sinal de extração incompleta, não de processo simples.
      minItems: 4,
      description:
        'TODO evento datado encontrado nos documentos, sem seleção de relevância — a seleção do que é "importante" acontece em uma etapa POSTERIOR, que você não está executando agora. Um item por evento. Nunca agregue vários eventos numa descrição só ("as demais CDAs", "os pagamentos subsequentes") — cada um é um item.',
      items: {
        type: 'OBJECT',
        propertyOrdering: ['id', 'data', 'inscricao', 'categoria', 'valor', 'descricao', 'fonte'],
        required: ['id', 'data', 'inscricao', 'categoria', 'valor', 'descricao', 'fonte'],
        properties: {
          id: { type: 'INTEGER' },
          data: { type: 'STRING', description: 'Formato DD/MM/AAAA. Data que não consta de documento não entra.' },
          inscricao: {
            type: 'STRING',
            description:
              'Número da inscrição/CDA/processo administrativo a que o evento se refere. Use "" quando o evento não é específico de uma inscrição (ex.: ajuizamento, despacho, citação).',
          },
          categoria: {
            type: 'STRING',
            enum: [
              'vencimento',
              'notificacao',
              'inscricao_divida_ativa',
              'pagamento',
              'parcelamento_adesao',
              'parcelamento_desistencia',
              'parcelamento_rescisao',
              'protesto',
              'protesto_cancelamento',
              'ajuizamento',
              'despacho',
              'citacao',
              'penhora_constricao',
              'prevencao',
              'outro',
            ],
          },
          valor: {
            type: 'STRING',
            description: 'Valor em R$ quando o evento tiver um (pagamento, vencimento). Use "" quando não houver.',
          },
          descricao: TEXTO,
          fonte: {
            type: 'STRING',
            description: 'Nome do documento anexado de onde o evento foi extraído. Obrigatório.',
          },
        },
      },
    },
  },
};

export const PROMPT_EXTRACAO = `Você é o módulo de EXTRAÇÃO do TributÁgil IA. Sua única função é ler os documentos anexados e listar TODO evento datado que encontrar. Você NÃO aplica direito tributário, NÃO calcula prazos, NÃO julga se algo é decadência ou prescrição, e NÃO decide o que é "importante" — isso é trabalho de uma etapa posterior, que você não executa.

[REGRAS]
1. Tolerância zero para invenção: todo evento deve ter correspondência exata num documento anexado. Nunca deduza, calcule ou presuma uma data que não está escrita.
2. Fonte única de verdade: você conhece exclusivamente o conteúdo dos documentos anexados a esta requisição. Proibido usar conhecimento prévio, buscar externamente, ou inventar partes/números/valores/datas.
3. Ao ler imagens de processos físicos, ignore carimbos de protocolo, rubricas sobrepostas e manchas de escaneamento — concentre-se no texto legível.

[O QUE PROCURAR — varra TODOS os documentos anexados, sem exceção]
- CDA (Certidão de Dívida Ativa) e seus anexos numerados: o corpo principal traz a data de inscrição em dívida ativa ("desde DD/MM/AAAA"); o "Anexo 1" (extrato dos débitos) traz vencimento, notificação/forma de constituição do débito, por natureza (IMPOSTO, MULTA); o "Anexo 3" (extrato de pagamentos) traz cada pagamento — data e valor.
- Petição inicial: partes, valor da causa, processo, pedidos, data de ajuizamento.
- Despacho, certidões de oficial de justiça, cartas de citação: datas de expedição/disponibilização.
- Anexos avulsos da PGFN — costumam vir rotulados apenas como "Outros Documentos", e por isso são os que mais passam despercebidos:
  * "ANEXO DE OCORRÊNCIAS COM POSSÍVEL IMPACTO NO PRAZO DA PRESCRIÇÃO" (histórico SISPAR, por inscrição). Percorra TODA linha, mesmo repetida entre inscrições diferentes. Traduza o rótulo cru para a categoria certa, sem descartar nenhuma linha: "CADASTR SOLIC NEGOC SISPAR" = mero pedido, categoria "outro"; "CADASTR DESP DEFERIDO SISPAR" = parcelamento_adesao; "DESISTENCIA PARC SISPAR" = parcelamento_desistencia; "RESCISAO PARC. SISPAR" = parcelamento_rescisao; "INCLUSAO DE PAGAMENTO" = pagamento (se não houver valor separado no anexo, registre com valor "" e cite a data — o valor exato normalmente está no Anexo 3 da CDA, como evento próprio).
  * "ANEXO DE PROTESTOS": todo protesto extrajudicial (categoria "protesto") e toda anuência/cancelamento (categoria "protesto_cancelamento").
- Extratos de débito (e-CAC/REGULARIZE/SEFAZ), declarações (DCTF, PGDAS-D, GFIP, DIRPF), comprovantes (DARF, DAS, GARE), acórdãos (DRJ/CARF), informações de prevenção.

[DISCIPLINA DE COBERTURA — o motivo desta chamada existir]
- Se o processo tem N inscrições/CDAs, TODAS as N aparecem, com os mesmos tipos de evento cada uma. Nunca resuma "as demais inscrições seguem o mesmo padrão" — repita o evento para cada uma, mesmo que a data e o valor sejam idênticos entre inscrições.
- Se um anexo (SISPAR ou protestos) cobre várias inscrições numa mesma linha (ex.: "rescisão para as inscrições X e Y"), gere um evento por inscrição, não um evento combinado.
- Um deferimento de parcelamento sem a rescisão correspondente (ou vice-versa) é sinal de leitura incompleta de um anexo com múltiplas páginas — releia antes de finalizar.
- Pagamento nunca é detalhe: é a categoria de evento mais frequentemente omitida em execuções anteriores deste sistema, e é frequentemente o fato que decide se uma inscrição está ou não exigível. Todo pagamento encontrado é um evento.

Se um documento anexado estiver ilegível, corrompido ou vazio a ponto de impedir a extração, preencha "alerta_ilegivel" descrevendo qual e o problema — mas ainda assim extraia normalmente tudo o que for legível nos demais documentos.`;

export default ESQUEMA_EXTRACAO;
