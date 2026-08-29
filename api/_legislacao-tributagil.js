// api/_legislacao-tributagil.js
//
// Corpus curado de legislação/jurisprudência sobre prescrição e decadência
// tributária, usado para popular `legislacao_chunks` (ver scripts/seed-legislacao.mjs
// e o README). Cada entrada é uma unidade citável inteira (artigo, parágrafo,
// inciso ou súmula/tema completos — nunca fragmentados), com metadado de
// citação (norma + identificador) exigido pela persona "Lu" em toda resposta.
//
// Fonte: base fornecida por Luan (2.1) + verificação/complementos (2.2).
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

export const LEGISLACAO_TRIBUTAGIL = [
  // ---- 2.1 — Base fornecida por Luan ---------------------------------------
  {
    norma: 'CF/88',
    identificador: 'art. 146, III, "b"',
    texto_integral:
      'Art. 146. Cabe à lei complementar: [...] III - estabelecer normas gerais em matéria de legislação tributária, especialmente sobre: [...] b) obrigação, lançamento, crédito, prescrição e decadência tributários. ' +
      'Fixa que prescrição e decadência tributárias são matéria reservada à lei complementar — fundamento usado pela Súmula Vinculante 8 do STF.',
  },
  {
    norma: 'Súmula Vinculante STF',
    identificador: 'Súmula Vinculante 8',
    texto_integral:
      'São inconstitucionais o parágrafo único do artigo 5º do Decreto-Lei nº 1.569/1977 e os artigos 45 e 46 da Lei nº 8.212/1991, que tratam de prescrição e decadência de crédito tributário. ' +
      'Fundamento: prescrição e decadência tributárias só podem ser disciplinadas por lei complementar (CF/88, art. 146, III, "b"); os dispositivos declarados inconstitucionais tentavam regular o tema por lei ordinária.',
  },
  {
    norma: 'CTN',
    identificador: 'art. 156, V',
    texto_integral:
      'Art. 156. Extinguem o crédito tributário: [...] V - a prescrição e a decadência. ' +
      'Base legal de que prescrição e decadência são causas de extinção do crédito tributário.',
  },
  {
    norma: 'CTN',
    identificador: 'art. 173, I',
    texto_integral:
      'Art. 173. O direito de a Fazenda Pública constituir o crédito tributário extingue-se após 5 (cinco) anos, contados: I - do primeiro dia do exercício seguinte àquele em que o lançamento poderia ter sido efetuado. ' +
      'Regra geral de decadência. Aplica-se aos tributos sujeitos a lançamento de ofício ou por declaração, e também aos sujeitos a lançamento por homologação quando NÃO houve antecipação de pagamento (ver Súmula 555/STJ).',
  },
  {
    norma: 'CTN',
    identificador: 'art. 150, §4º',
    texto_integral:
      'Art. 150, §4º. Se a lei não fixar prazo à homologação, será ele de cinco anos, a contar da ocorrência do fato gerador; expirado esse prazo sem que a Fazenda Pública se tenha pronunciado, considera-se homologado o lançamento e definitivamente extinto o crédito, salvo se comprovada a ocorrência de dolo, fraude ou simulação. ' +
      'Regra de decadência para tributos sujeitos a lançamento por homologação (ex.: a maioria dos tributos federais/PIS-COFINS/ICMS/ISS por apuração própria): 5 anos contados do FATO GERADOR, não do exercício seguinte — desde que tenha havido antecipação de pagamento e não haja dolo/fraude/simulação (ver Súmula 555/STJ para o corte entre este artigo e o art. 173, I).',
  },
  {
    norma: 'CTN',
    identificador: 'art. 173, II',
    texto_integral:
      'Art. 173. [...] II - da data em que se tornar definitiva a decisão que houver anulado, por vício formal, o lançamento anteriormente efetuado. ' +
      'Reabre o prazo decadencial de 5 anos quando um lançamento anterior foi anulado por VÍCIO FORMAL (defeito na forma do ato) — não se aplica a vício material (erro na própria obrigação tributária), que não reabre prazo.',
  },
  {
    norma: 'CTN',
    identificador: 'art. 174',
    texto_integral:
      'Art. 174. A ação para a cobrança do crédito tributário prescreve em cinco anos, contados da data da sua constituição definitiva. Parágrafo único. A prescrição se interrompe: I - pelo despacho do juiz que ordenar a citação em execução fiscal; II - pelo protesto judicial; III - por qualquer ato judicial que constitua em mora o devedor; IV - por qualquer ato inequívoco ainda que extrajudicial, que importe em reconhecimento do débito pelo devedor. ' +
      'Regra geral de prescrição (cobrança do crédito já constituído): 5 anos da constituição definitiva, com hipóteses TAXATIVAS de interrupção — reinicia a contagem do zero a partir do ato interruptivo.',
  },
  {
    norma: 'LEF (Lei 6.830/80)',
    identificador: 'art. 40',
    texto_integral:
      'Art. 40. O Juiz suspenderá o curso da execução, enquanto não for localizado o devedor ou encontrados bens sobre os quais possa recair a penhora, e, nesses casos, não correrá o prazo de prescrição. §1º Suspenso o curso da execução, será aberta vista dos autos ao representante judicial da Fazenda Pública. §2º Decorrido o prazo máximo de 1 (um) ano, sem que seja localizado o devedor ou encontrados bens penhoráveis, o Juiz ordenará o arquivamento dos autos. §3º Encontrados que sejam, a qualquer tempo, o devedor ou os bens, serão desarquivados os autos para prosseguimento da execução. §4º Se da decisão que ordenar o arquivamento tiver decorrido o prazo prescricional, o juiz, depois de ouvida a Fazenda Pública, poderá, de ofício, reconhecer a prescrição intercorrente e decretá-la de imediato. §5º A manifestação prévia da Fazenda Pública prevista no §4º deste artigo será dispensada no caso de cobranças judiciais cujo valor seja inferior ao mínimo fixado por ato do Ministro de Estado da Fazenda. ' +
      'Base da PRESCRIÇÃO INTERCORRENTE: suspensão por não localização de devedor/bens, 1 ano de suspensão, depois arquivamento e início do prazo de 5 anos de prescrição intercorrente (ver Súmula 314/STJ e REsp 1.340.553/RS para os parâmetros atualizados de contagem, e a exigência de prévia intimação da Fazenda antes da decretação de ofício).',
  },
  {
    norma: 'CTN',
    identificador: 'art. 168, I',
    texto_integral:
      'Art. 168. O direito de pleitear a restituição extingue-se com o decurso do prazo de 5 (cinco) anos, contados: I - nas hipóteses dos incisos I e II do artigo 165, da data da extinção do crédito tributário. ' +
      'Prazo de 5 anos para repetição de indébito tributário, contado da extinção do crédito — combinado com a LC 118/2005 (art. 3º), que fixou essa contagem "a partir do pagamento" para fins de interpretação do art. 168, I, aplicável a ações ajuizadas após 9/6/2005 (STF, RE 566.621, repercussão geral).',
  },
  {
    norma: 'LC 118/2005',
    identificador: 'art. 3º',
    texto_integral:
      'Art. 3º Para efeito de interpretação do inciso I do art. 168 da Lei nº 5.172, de 25 de outubro de 1966 - Código Tributário Nacional, a extinção do crédito tributário ocorre, no caso de tributo sujeito a lançamento por homologação, no momento do pagamento antecipado de que trata o § 1º do art. 150 da referida Lei. ' +
      'Fixa que, para tributos por homologação, o prazo de repetição de indébito (CTN, art. 168, I) conta-se do PAGAMENTO antecipado, não da homologação — aplicável, pelo STF (RE 566.621), somente a ações ajuizadas a partir de 9/6/2005.',
  },
  {
    norma: 'CTN',
    identificador: 'art. 202',
    texto_integral:
      'Art. 202. O termo de inscrição da dívida ativa, autenticado pela autoridade competente, indicará obrigatoriamente: I - o nome do devedor e, sendo caso, o dos corresponsáveis, bem como, sempre que possível, o domicílio ou a residência de um e de outros; II - a quantia devida e a maneira de calcular os juros de mora acrescidos; III - a origem e natureza do crédito, mencionada especificamente a disposição da lei em que seja fundado; IV - a data em que foi inscrita; V - sendo caso, o número do processo administrativo de que se originar o crédito. ' +
      'Fixa os requisitos formais da Certidão de Dívida Ativa (CDA). A ausência de um requisito é VÍCIO FORMAL (não reabre prazo decadencial por si só, mas pode gerar nulidade da CDA); erro na própria existência/quantificação da obrigação é VÍCIO MATERIAL (mais grave, não sanável por substituição da CDA).',
  },

  // ---- 2.2 — Verificação e complementos --------------------------------
  {
    norma: 'Súmula STJ',
    identificador: 'Súmula 555',
    texto_integral:
      'Quando não houver declaração do débito, o prazo decadencial quinquenal para o Fisco constituir o crédito tributário conta-se exclusivamente na forma do art. 173, I, do CTN, nos casos em que a legislação atribui ao sujeito passivo o dever de antecipar o pagamento sem prévio exame da autoridade administrativa. ' +
      'Diferencia quando se aplica o art. 150, §4º (houve declaração/antecipação de pagamento pelo contribuinte: conta-se do fato gerador) do art. 173, I (não houve declaração/antecipação: conta-se do primeiro dia do exercício seguinte).',
  },
  {
    norma: 'Súmula STJ',
    identificador: 'Súmula 393',
    texto_integral:
      'A exceção de pré-executividade é admissível na execução fiscal relativamente às matérias conhecíveis de ofício que não demandem dilação probatória. ' +
      'Instrumento processual recomendado quando prescrição ou decadência já estão consumadas e a matéria é comprovável só com os documentos dos autos (não exige embargos à execução nem garantia do juízo).',
  },
  {
    norma: 'Súmula STJ',
    identificador: 'Súmula 314',
    texto_integral:
      'Em execução fiscal, não localizados bens penhoráveis, suspende-se o processo por um ano, findo o qual se inicia o prazo da prescrição quinquenal intercorrente. ' +
      'Base da prescrição intercorrente (LEF, art. 40): 1 ano de suspensão, depois 5 anos de prescrição. ATENÇÃO: os parâmetros de contagem foram atualizados/detalhados pelo REsp 1.340.553/RS (recurso repetitivo) — usar a súmula em conjunto com esse precedente, não isoladamente.',
  },
  {
    norma: 'STJ — Recurso Repetitivo',
    identificador: 'REsp 1.340.553/RS (Temas 566 a 571)',
    texto_integral:
      'Recurso repetitivo julgado em 12/9/2018 que fixou os parâmetros definitivos de contagem da prescrição intercorrente em execução fiscal (LEF, art. 40), atualizando a aplicação da Súmula 314/STJ. Entre os pontos fixados: (i) o prazo de 1 ano de suspensão se inicia automaticamente da ciência da Fazenda Pública sobre a não localização do devedor ou de bens penhoráveis, independentemente de despacho judicial; (ii) findo o prazo de suspensão, inicia-se automaticamente o prazo prescricional de 5 anos, também independentemente de despacho judicial; (iii) a efetiva penhora ou a citação válida do executado interrompe a prescrição intercorrente; (iv) a reconstituição da penhora sobre os mesmos bens não reinicia o prazo. ' +
      'É a fonte mais citada em decisões atuais sobre prescrição intercorrente — deve ser usada junto (não no lugar) da Súmula 314/STJ.',
  },
  {
    norma: 'Súmula STJ',
    identificador: 'Súmula 622',
    texto_integral:
      'A notificação do auto de infração faz cessar a contagem da decadência para a constituição do crédito tributário; exaurida a instância administrativa com o decurso do prazo para a impugnação ou com a notificação de seu julgamento definitivo e esgotado o prazo concedido pela Administração para o pagamento voluntário, inicia-se o prazo prescricional para a cobrança judicial. ' +
      'Resolve o ponto de transição entre decadência e prescrição no lançamento de ofício: a notificação do auto de infração encerra a decadência; a prescrição só começa a correr depois de esgotada a instância administrativa (impugnação/recurso julgados) e o prazo de pagamento voluntário.',
  },
  {
    norma: 'STF — Repercussão Geral',
    identificador: 'RE 636.562 (Tema 390)',
    texto_integral:
      'O Supremo Tribunal Federal, em repercussão geral, confirmou a constitucionalidade da sistemática de prescrição intercorrente prevista no art. 40 da Lei 6.830/1980 (LEF), inclusive quanto à possibilidade de reconhecimento de ofício pelo juiz. ' +
      'IMPORTANTE: a jurisprudência mais recente do STJ (aplicando o REsp 1.340.553/RS) exige que, mesmo no reconhecimento de ofício, a Fazenda Pública seja PREVIAMENTE INTIMADA antes da decretação da prescrição intercorrente, sob pena de nulidade por violação ao contraditório (LEF, art. 40, §4º).',
  },
];
