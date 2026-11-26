// api/_pecas-teses-novas.js
//
// Texto das peças das NOVAS TESES (api/_motor-teses-novas.js), no modelo genérico (api/_pecas-extras.js):
//   ilegitimidade_passiva — exceção do SÓCIO redirecionado (Súmula 430; Temas 962, 981 e 444/STJ);
//   nulidade_cda          — exceção (ou revisão, sem execução) pela falta de requisito essencial da CDA;
//   cobranca_indevida     — exceção (ou revisão) por pagamento anterior à inscrição e/ou duplicidade.
// MINUTAS pendentes de revisão da advogada (templates/pecas/REVISAO_JURIDICA.md). Sem travessão (regra J01).
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

import { preencher } from './_contexto-peca.js';
import { secao, cit, pedidos, confirmar, listaCdas, execucaoAjuizada } from './_pecas-extras.js';
import { NOME_REQUISITO } from './_motor-teses-novas.js';

const CABIMENTO = [
  'A exceção de pré-executividade é admissível na execução fiscal relativamente às matérias conhecíveis de ofício que não demandem dilação probatória, conforme a Súmula 393 do Superior Tribunal de Justiça:',
  cit('Súmula 393/STJ: A exceção de pré-executividade é admissível na execução fiscal relativamente às matérias conhecíveis de ofício que não demandem dilação probatória.'),
];

const HONORARIOS = 'a condenação da exequente ao pagamento de honorários advocatícios, nos termos do art. 85, §§ 2º e 3º, do CPC;';

export function exequenteDe(dados) {
  return dados?.processo_execucao?.exequente || dados?.ente_credor?.nome || preencher('exequente');
}

// ---- Ilegitimidade passiva do sócio ------------------------------------------------------------------------------------
const FUNDAMENTO_TEXTO = {
  mero_inadimplemento: 'o simples inadimplemento do crédito tributário pela sociedade',
  dissolucao_irregular: 'a suposta dissolução irregular da sociedade',
};

function pecaIlegitimidade(av, dados) {
  const f = av.fatos;
  const socio = f.socio || preencher('nome do(a) sócio(a) excipiente');
  const empresa = dados?.executado?.nome || preencher('nome da empresa executada');
  const args = f.argumentos || [];
  const pedido = dados?.redirecionamento?.data_pedido_redirecionamento?.data;

  const fatos = secao('DOS FATOS', [
    `Trata-se de execução fiscal ajuizada por ${exequenteDe(dados)} em face de **${empresa}**, para a cobrança do crédito tributário consubstanciado na(s) CDA(s) nº ${listaCdas(dados)}.`,
    `${pedido ? `Em ${pedido}, a` : 'A'} exequente requereu o redirecionamento da execução ao(à) excipiente, com fundamento em ${FUNDAMENTO_TEXTO[f.fundamento] || preencher('fundamento do redirecionamento')}, o que foi deferido por decisão de ${preencher('data da decisão que incluiu o(a) sócio(a)')}.`,
    'O nome do(a) excipiente **não consta** da Certidão de Dívida Ativa que instrui a execução. Como se demonstrará, a sua inclusão no polo passivo é indevida.',
  ]);

  const cabimento = secao('DO CABIMENTO DA EXCEÇÃO DE PRÉ-EXECUTIVIDADE', [
    ...CABIMENTO,
    'A legitimidade das partes é matéria de ordem pública, que o juiz conhece de ofício, em qualquer tempo e grau de jurisdição (art. 485, VI e § 3º, do CPC). No caso, a ilegitimidade se demonstra pelos documentos já constantes dos autos, sem necessidade de dilação probatória.',
    'Além disso, o nome do(a) excipiente não figura na CDA como corresponsável, de modo que não incide a orientação do REsp 1.110.925/SP (que afasta a exceção quando o sócio já consta do título): cabe à exequente, e não ao(à) excipiente, demonstrar a prática de ato ilícito que justifique o redirecionamento.',
  ]);

  const direito = [];
  const art135 = cit('Art. 135. São pessoalmente responsáveis pelos créditos correspondentes a obrigações tributárias resultantes de atos praticados com excesso de poderes ou infração de lei, contrato social ou estatutos: [...] III - os diretores, gerentes ou representantes de pessoas jurídicas de direito privado.');
  for (const a of args) {
    if (a.tipo === 'sumula_430') {
      direito.push(secao('DO MERO INADIMPLEMENTO: SÚMULA 430 DO STJ', [
        'A responsabilidade pessoal do sócio pelos débitos tributários da sociedade é excepcional e depende da prática de ato com excesso de poderes ou infração de lei, contrato social ou estatutos, nos termos do art. 135, III, do CTN:',
        art135,
        'O simples inadimplemento do tributo não configura, por si só, infração de lei apta a ensejar essa responsabilidade, como consolidado na Súmula 430 do Superior Tribunal de Justiça:',
        cit('Súmula 430/STJ: O inadimplemento da obrigação tributária pela sociedade não gera, por si só, a responsabilidade solidária do sócio-gerente.'),
        'No caso, a exequente não aponta nenhum ato ilícito praticado pelo(a) excipiente: funda o redirecionamento apenas na falta de pagamento, o que é insuficiente para incluí-lo(a) no polo passivo.',
      ], 'Ausência de ato ilícito do art. 135, III, do CTN.'));
    } else if (a.tipo === 'saida_antes_dissolucao') {
      direito.push(secao('DA RETIRADA REGULAR ANTERIOR À DISSOLUÇÃO IRREGULAR: TEMA 962 DO STJ', [
        'O redirecionamento fundado na dissolução irregular da sociedade (Súmula 435/STJ) só alcança quem tinha poderes de administração na data em que ela se configurou ou se presumiu. Não alcança o sócio que, ainda que gerente ao tempo do fato gerador, retirou-se regularmente da sociedade e não deu causa à dissolução posterior, como decidiu o Superior Tribunal de Justiça no julgamento do Tema 962, sob o rito dos recursos repetitivos:',
        cit('Tema 962/STJ: O redirecionamento da execução fiscal, quando fundado na dissolução irregular da pessoa jurídica executada ou na presunção de sua ocorrência, não pode ser autorizado contra o sócio ou o terceiro não sócio que, embora exercesse poderes de gerência ao tempo do fato gerador, sem incorrer em prática de atos com excesso de poderes ou infração à lei, ao contrato social ou aos estatutos, dele regularmente se retirou e não deu causa à sua posterior dissolução irregular, conforme art. 135, III, do CTN.'),
        `O(A) excipiente retirou-se regularmente da sociedade em **${f.data_saida}**, conforme ${preencher('alteração contratual registrada na Junta Comercial (Doc. nº)')}, antes da constatação da dissolução irregular, ocorrida em **${f.data_dissolucao}**. Não pode, portanto, responder por ela.`,
      ], 'Sócio retirante não responde pela dissolução posterior.'));
    } else if (a.tipo === 'nao_gerente_na_dissolucao') {
      direito.push(secao('DA AUSÊNCIA DE PODERES DE GERÊNCIA NA DATA DA DISSOLUÇÃO: TEMA 981 DO STJ', [
        'No julgamento do Tema 981, sob o rito dos recursos repetitivos, o Superior Tribunal de Justiça fixou que o redirecionamento fundado na dissolução irregular se dirige a quem tinha poderes de administração na data em que ela se configurou ou se presumiu:',
        cit('Tema 981/STJ: O redirecionamento da execução fiscal, quando fundado na dissolução irregular da pessoa jurídica executada ou na presunção de sua ocorrência, pode ser autorizado contra o sócio ou o terceiro não sócio, com poderes de administração na data em que configurada ou presumida a dissolução irregular, ainda que não tenha exercido poderes de gerência quando ocorrido o fato gerador do tributo não adimplido, conforme art. 135, III, do CTN.'),
        `Na data em que se constatou a dissolução irregular${f.data_dissolucao ? ` (**${f.data_dissolucao}**)` : ''}, o(a) excipiente não detinha poderes de administração da sociedade, conforme ${preencher('contrato social e alterações / ficha cadastral da Junta Comercial (Doc. nº)')}. Não pode, portanto, ser responsabilizado(a) pelo ilícito.`,
      ], 'O redirecionamento só alcança quem administrava a sociedade na dissolução.'));
    } else if (a.tipo === 'prescricao_redirecionamento') {
      direito.push(secao('DA PRESCRIÇÃO PARA O REDIRECIONAMENTO: TEMA 444 DO STJ', [
        `Ainda que se admitisse, em tese, a responsabilidade do(a) excipiente, a pretensão de redirecionar a execução estaria prescrita. A empresa executada foi citada em **${a.citacao}**, a dissolução irregular é anterior a essa citação, e o pedido de redirecionamento só foi formulado em **${a.pedido}**, mais de cinco anos depois.`,
        'No julgamento do Tema 444, sob o rito dos recursos repetitivos, o Superior Tribunal de Justiça fixou que, sendo o ato ilícito anterior à citação da pessoa jurídica, o prazo de cinco anos para o redirecionamento conta dessa citação, exigindo-se a demonstração da inércia da Fazenda Pública no quinquênio.',
        confirmar('demonstrar, com os andamentos do processo, a inércia da exequente entre a citação da empresa e o pedido de redirecionamento (Tema 444, item iii); se houve diligências úteis da Fazenda no período, ajustar ou retirar este tópico'),
      ], 'Pedido formulado mais de cinco anos após a citação da empresa.'));
    }
  }

  return {
    parte_nome: socio,
    qualificacao_parte: `inscrito(a) no CPF sob o nº ${f.socio_documento || preencher('CPF do(a) sócio(a)')}, incluído(a) no polo passivo da execução fiscal em epígrafe, movida em face de ${empresa}`,
    titulo_peca: 'EXCEÇÃO DE PRÉ-EXECUTIVIDADE',
    verbo_peca: 'à presença de Vossa Excelência, opor a presente',
    subtitulo_peca: 'em razão dos fatos e fundamentos que doravante serão expostos.',
    secoes: [
      fatos,
      cabimento,
      ...direito,
      pedidos([
        'o recebimento da presente exceção, com a suspensão de atos de constrição contra o(a) excipiente até a sua apreciação;',
        'a intimação da exequente para, querendo, manifestar-se;',
        `o acolhimento da exceção, com o reconhecimento da ilegitimidade passiva e a exclusão de **${socio}** do polo passivo da execução fiscal;`,
        'o levantamento de penhoras, bloqueios e restrições que recaiam sobre bens e valores do(a) excipiente;',
        'a condenação da exequente ao pagamento de honorários advocatícios, nos termos do art. 85, §§ 2º e 3º, do CPC, cabíveis na exclusão do sócio do polo passivo ainda que a execução não seja extinta (Tema 961/STJ).',
      ]),
    ],
  };
}

// ---- Nulidade da CDA ---------------------------------------------------------------------------------------------------
function pecaNulidade(av, dados) {
  const ajuizada = execucaoAjuizada(dados);
  const vicios = av.fatos.vicios || [];
  const cdas = vicios.map((v) => v.cda || preencher('nº da CDA')).join(', ');
  const fatos = secao('DOS FATOS', [
    ajuizada
      ? `Trata-se de execução fiscal ajuizada por ${exequenteDe(dados)} para a cobrança do crédito consubstanciado na(s) CDA(s) nº ${listaCdas(dados)}.`
      : `O(A) requerente teve inscrito em dívida ativa o débito objeto da(s) inscrição(ões) nº ${listaCdas(dados)}.`,
    `A(s) Certidão(ões) de Dívida Ativa nº ${cdas}, contudo, não preenche(m) os requisitos que a lei exige do título, como se demonstra.`,
  ]);
  const direito = secao('DA NULIDADE DA CERTIDÃO DE DÍVIDA ATIVA', [
    'O termo de inscrição em dívida ativa, e a certidão que o reproduz, devem indicar obrigatoriamente os elementos previstos no art. 202 do CTN e no art. 2º, § 5º, da Lei nº 6.830/1980:',
    cit('Art. 2º, § 5º, da Lei nº 6.830/1980: O Termo de Inscrição de Dívida Ativa deverá conter: I - o nome do devedor, dos co-responsáveis e, sempre que conhecido, o domicílio ou residência de um e de outros; II - o valor originário da dívida, bem como o termo inicial e a forma de calcular os juros de mora e demais encargos previstos em lei ou contrato; III - a origem, a natureza e o fundamento legal ou contratual da dívida; IV - a indicação, se for o caso, de estar a dívida sujeita à atualização monetária, bem como o respectivo fundamento legal e o termo inicial para o cálculo; V - a data e o número da inscrição, no Registro de Dívida Ativa; e VI - o número do processo administrativo ou do auto de infração, se neles estiver apurado o valor da dívida.'),
    'No caso, faltam ao título requisitos essenciais:',
    ...vicios.map((v) => `CDA nº ${v.cda || preencher('nº da CDA')}: não indica ${v.essenciais.map((k) => NOME_REQUISITO[k]).join('; ')}.`),
    'Esses elementos não são mera formalidade: sem eles, o devedor não conhece a origem, a natureza e a forma de cálculo do débito que lhe é cobrado, e fica impedido de exercer o contraditório e a ampla defesa. A consequência é a nulidade da inscrição e do processo de cobrança dela decorrente, nos termos do art. 203 do CTN:',
    cit('Art. 203. A omissão de quaisquer dos requisitos previstos no artigo anterior, ou o erro a eles relativo, são causas de nulidade da inscrição e do processo de cobrança dela decorrente, mas a nulidade poderá ser sanada até a decisão de primeira instância, mediante substituição da certidão nula, devolvido ao sujeito passivo, acusado ou interessado o prazo para defesa, que somente poderá versar sobre a parte modificada.'),
    ajuizada
      ? 'Sem título que preencha os requisitos legais, falta à execução título executivo certo, líquido e exigível, o que a torna nula (art. 803, I, do CPC).'
      : 'Sem os requisitos legais, a inscrição não pode subsistir e deve ser cancelada.',
  ], 'Ausência de requisitos essenciais do título.');
  return {
    titulo_peca: ajuizada ? 'EXCEÇÃO DE PRÉ-EXECUTIVIDADE' : 'PEDIDO DE REVISÃO DE DÍVIDA INSCRITA',
    verbo_peca: ajuizada ? 'à presença de Vossa Excelência, opor a presente' : 'à presença de Vossa Senhoria, apresentar o presente',
    secoes: [
      fatos,
      ...(ajuizada
        ? [secao('DO CABIMENTO DA EXCEÇÃO DE PRÉ-EXECUTIVIDADE', [...CABIMENTO, 'A nulidade do título executivo é matéria de ordem pública, que se verifica pela simples leitura da CDA juntada aos autos, sem dilação probatória (art. 803, parágrafo único, do CPC).'])]
        : []),
      direito,
      pedidos(
        ajuizada
          ? [
              'o recebimento da presente exceção e a intimação da exequente para, querendo, manifestar-se;',
              `o acolhimento da exceção, com o reconhecimento da nulidade da(s) CDA(s) nº ${cdas} e a extinção da execução fiscal (art. 203 do CTN e art. 803, I, do CPC);`,
              HONORARIOS,
              'a liberação de eventuais restrições e constrições existentes nos autos.',
            ]
          : [`o cancelamento da(s) inscrição(ões) nº ${cdas}, por nulidade (art. 203 do CTN);`, 'a baixa de eventuais protestos e anotações no CADIN decorrentes da(s) inscrição(ões).'],
        ajuizada ? 'Isto posto, requer a Vossa Excelência:' : 'Isto posto, requer a Vossa Senhoria:',
      ),
    ],
  };
}

// ---- Cobrança indevida (pagamento anterior à inscrição, duplicidade) ------------------------------------------------------
function pecaCobrancaIndevida(av, dados) {
  const ajuizada = execucaoAjuizada(dados);
  const { pagos = [], duplicados = [] } = av.fatos;
  const secoes = [
    secao('DOS FATOS', [
      ajuizada
        ? `Trata-se de execução fiscal ajuizada por ${exequenteDe(dados)} para a cobrança do crédito consubstanciado na(s) CDA(s) nº ${listaCdas(dados)}.`
        : `O(A) requerente teve inscrito em dívida ativa o débito objeto da(s) inscrição(ões) nº ${listaCdas(dados)}.`,
      'Parte do valor cobrado, todavia, não é devida, como se demonstra pelos documentos anexos.',
    ]),
  ];
  if (ajuizada) {
    secoes.push(secao('DO CABIMENTO DA EXCEÇÃO DE PRÉ-EXECUTIVIDADE', [
      ...CABIMENTO,
      'A extinção do crédito pelo pagamento e a cobrança em duplicidade se provam por documentos (comprovantes de recolhimento e as próprias certidões), sem dilação probatória. A presunção de certeza e liquidez da dívida ativa é relativa e cede diante de prova inequívoca (art. 3º, parágrafo único, da Lei nº 6.830/1980).',
    ]));
  }
  if (pagos.length) {
    secoes.push(secao('DO PAGAMENTO ANTERIOR À INSCRIÇÃO', [
      'O pagamento extingue o crédito tributário, nos termos do art. 156, I, do CTN:',
      cit('Art. 156. Extinguem o crédito tributário: I - o pagamento;'),
      'Os créditos abaixo foram integralmente quitados antes da inscrição em dívida ativa:',
      ...pagos.map((p) => `CDA nº ${p.cda || preencher('nº da CDA')}, período ${p.periodo || preencher('período')}: pago em **${p.data}**, conforme ${p.fonte || preencher('comprovante de pagamento (Doc. nº)')}.${p.posteriorInscricao ? ` ${confirmar('o pagamento é posterior à inscrição; ajustar o pedido (extinção pelo pagamento, sem cobrança indevida até a data)')}` : ''}`),
      'Extinto pelo pagamento, o crédito não podia ser inscrito em dívida ativa nem cobrado: falta ao título a certeza e a exigibilidade que lhe dariam suporte.',
    ], 'Extinção do crédito tributário (art. 156, I, do CTN).'));
  }
  if (duplicados.length) {
    secoes.push(secao('DA COBRANÇA EM DUPLICIDADE', [
      'O mesmo tributo, relativo ao mesmo período de apuração, é cobrado em mais de uma inscrição:',
      ...duplicados.map((d) => `${d.tributo || 'Tributo'}, período ${d.periodo}: CDAs nº ${d.cdas.join(' e ')}.`),
      'A cobrança em duplicidade do mesmo débito viola a certeza do título e importa enriquecimento sem causa da Fazenda Pública, devendo ser cancelada a inscrição repetida.',
      confirmar('conferir que as inscrições se referem ao mesmo débito, e não a parcelas ou fatos geradores distintos do mesmo período'),
    ], 'O mesmo débito não pode ser cobrado duas vezes.'));
  }
  const lista = ajuizada
    ? [
        'o recebimento da presente exceção e a intimação da exequente para, querendo, manifestar-se;',
        pagos.length ? `o reconhecimento da extinção, pelo pagamento, dos créditos relativos a ${pagos.map((p) => `CDA nº ${p.cda} / período ${p.periodo}`).join('; ')}, com a extinção da execução quanto a eles;` : '',
        duplicados.length ? `o reconhecimento da cobrança em duplicidade e a extinção da execução quanto à(s) inscrição(ões) repetida(s) (${duplicados.map((d) => d.cdas[1]).join(', ')});` : '',
        HONORARIOS,
        'a liberação de eventuais restrições e constrições existentes nos autos.',
      ]
    : [
        pagos.length ? `o cancelamento da inscrição quanto aos créditos pagos (${pagos.map((p) => `CDA nº ${p.cda} / período ${p.periodo}`).join('; ')});` : '',
        duplicados.length ? `o cancelamento da(s) inscrição(ões) em duplicidade (${duplicados.map((d) => d.cdas[1]).join(', ')});` : '',
        'a baixa de eventuais protestos e anotações no CADIN decorrentes da cobrança indevida.',
      ];
  secoes.push(pedidos(lista, ajuizada ? 'Isto posto, requer a Vossa Excelência:' : 'Isto posto, requer a Vossa Senhoria:'));
  return {
    titulo_peca: ajuizada ? 'EXCEÇÃO DE PRÉ-EXECUTIVIDADE' : 'PEDIDO DE REVISÃO DE DÍVIDA INSCRITA',
    verbo_peca: ajuizada ? 'à presença de Vossa Excelência, opor a presente' : 'à presença de Vossa Senhoria, apresentar o presente',
    secoes,
  };
}

const NOME_MODELO = {
  ilegitimidade_passiva: 'Exceção de Pré-Executividade: ilegitimidade passiva do sócio',
  nulidade_cda: 'Exceção de Pré-Executividade: nulidade da CDA',
  cobranca_indevida: 'Exceção de Pré-Executividade: cobrança indevida',
};

/** A peça de uma nova tese (avaliação com status 'ok' de api/_motor-teses-novas.js). */
export function montarPecaTeseNova(avaliacao, dados) {
  if (avaliacao.tese === 'ilegitimidade_passiva') return pecaIlegitimidade(avaliacao, dados);
  if (avaliacao.tese === 'nulidade_cda') return pecaNulidade(avaliacao, dados);
  if (avaliacao.tese === 'cobranca_indevida') return pecaCobrancaIndevida(avaliacao, dados);
  throw new Error(`tese nova desconhecida: ${avaliacao.tese}`);
}

export function nomeModeloTeseNova(avaliacao, dados) {
  const nome = NOME_MODELO[avaliacao.tese];
  return execucaoAjuizada(dados) ? nome : nome.replace('Exceção de Pré-Executividade', 'Pedido de Revisão de Dívida Inscrita');
}
