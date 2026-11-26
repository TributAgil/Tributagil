// api/_pecas-processuais.js
//
// Etapa 4: NOVAS PEÇAS processuais no modelo genérico (api/_pecas-extras.js):
//   embargos                      — embargos à execução fiscal (art. 16 da LEF), com tempestividade, garantia, matérias
//                                   de defesa do caso, efeito suspensivo (art. 919, § 1º, CPC), provas e valor da causa;
//   agravo                        — agravo de instrumento contra a decisão que rejeitou a exceção (art. 1.015,
//                                   parágrafo único, CPC), com tempestividade (15 dias úteis), peças e efeito suspensivo;
//   reconhecimento_intercorrente  — petição simples pedindo o reconhecimento da prescrição intercorrente (art. 40, § 4º,
//                                   LEF), com as datas do cálculo.
// As MATÉRIAS de defesa saem do cálculo do caso (as três teses originais e as novas), nunca da IA. Prazos são contados
// em código; feriados e suspensões não são conhecidos pelo sistema e saem como [CONFIRMAR].
// MINUTAS pendentes de revisão da advogada (templates/pecas/REVISAO_JURIDICA.md). Sem travessão (regra J01).
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

import { preencher } from './_contexto-peca.js';
import { prazoEmDiasUteis, prazoEmDiasCorridos } from './_feriados.js';
import { secao, cit, pedidos, confirmar, listaCdas, parseBR, formatarBR } from './_pecas-extras.js';
import { prazosDoCaso } from './_replica.js';
import { avaliarTesesNovas } from './_motor-teses-novas.js';
import { montarPecaTeseNova, exequenteDe } from './_pecas-teses-novas.js';

const rotulo = (c) => [c.cda && `CDA nº ${c.cda}`, c.periodo && `período ${c.periodo}`].filter(Boolean).join(', ') || 'crédito';

// ---- Prazos ------------------------------------------------------------------------------------------------------------
// Calendário forense em api/_feriados.js: fins de semana, feriados nacionais, dias sem expediente da Justiça Federal
// (Lei nº 5.010/1966) e a suspensão de 20/12 a 20/01 (art. 220 do CPC). Feriado local fica para conferir.

/** Justiça Federal quando a credora é a União (PGFN); senão, Justiça Estadual. */
export const justicaDoCaso = (dados) =>
  dados?.ente_credor?.esfera === 'União' || /^pgfn$/i.test(String(dados?.orgao_cobranca || '')) ? 'federal' : 'estadual';

/** Soma N dias úteis (exclui o dia do começo, art. 224 do CPC; sem fins de semana, feriados nem a suspensão). */
export function somarDiasUteis(inicio, n, justica = 'estadual') {
  return prazoEmDiasUteis(inicio, n, justica).final;
}

/** Soma N dias corridos (a suspensão não corre); fim em dia sem expediente prorroga (art. 224, § 1º, do CPC). */
export function somarDiasCorridos(inicio, n, justica = 'estadual') {
  return prazoEmDiasCorridos(inicio, n, justica).final;
}

/**
 * Prazo de um ato a partir da intimação.
 * @returns {null | { intimacao: string, final: string, vencido: boolean, feriados: string[], suspensao: boolean,
 *   finalCorridos?: string, vencidoCorridos?: boolean }}
 */
export function calcularPrazo({ data, dias, uteis, agora = new Date(), justica = 'estadual' }) {
  const ini = parseBR(data);
  if (!ini) return null;
  const hoje = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
  const principal = uteis ? prazoEmDiasUteis(ini, dias, justica) : prazoEmDiasCorridos(ini, dias, justica);
  const r = {
    intimacao: formatarBR(ini),
    final: formatarBR(principal.final),
    vencido: hoje > principal.final,
    feriados: principal.feriados,
    suspensao: principal.suspensao,
  };
  if (uteis === 'ambos') {
    const corridos = prazoEmDiasCorridos(ini, dias, justica);
    r.finalCorridos = formatarBR(corridos.final);
    r.vencidoCorridos = hoje > corridos.final;
    r.feriados = [...new Set([...principal.feriados, ...corridos.feriados])];
    r.suspensao = principal.suspensao || corridos.suspensao;
  }
  return r;
}

/** O que o cálculo já descontou e o que fica para o advogado conferir (vai no [CONFIRMAR] da peça). */
export function notaDoCalendario(prazo, justica) {
  const descontado = [
    'os fins de semana',
    justica === 'federal' ? 'os feriados nacionais e os dias sem expediente da Justiça Federal (Lei nº 5.010/1966, art. 62)' : 'os feriados nacionais e a Sexta-feira da Paixão',
  ];
  const detalhe = prazo.feriados.length ? ` (no período: ${prazo.feriados.join('; ')})` : '';
  const suspensao = prazo.suspensao ? ' e a suspensão de 20/12 a 20/01 (art. 220 do CPC)' : '';
  const conferir = justica === 'federal' ? 'feriados locais e portarias de suspensão do tribunal' : 'feriados estaduais e municipais, Carnaval, Corpus Christi e portarias de suspensão do tribunal';
  return `já descontados ${descontado.join(', ')}${detalhe}${suspensao}; conferir ${conferir}`;
}

// ---- Matérias de defesa do caso ------------------------------------------------------------------------------------------
const TEXTO_ART_174 =
  'Art. 174. A ação para a cobrança do crédito tributário prescreve em cinco anos, contados da data da sua constituição definitiva. Parágrafo único. A prescrição se interrompe: I - pelo despacho do juiz que ordenar a citação em execução fiscal; II - pelo protesto judicial; III - por qualquer ato judicial que constitua em mora o devedor; IV - por qualquer ato inequívoco ainda que extrajudicial, que importe em reconhecimento do débito pelo devedor.';
const TEXTO_ART_40_P4 =
  'Art. 40, § 4º, da Lei nº 6.830/1980: Se da decisão que ordenar o arquivamento tiver decorrido o prazo prescricional, o juiz, depois de ouvida a Fazenda Pública, poderá, de ofício, reconhecer a prescrição intercorrente e decretá-la de imediato.';

/**
 * As matérias de defesa que o cálculo do caso sustenta, como seções prontas, e o resumo (para pedidos e avisos).
 * @param {{ dados: object, agora?: Date, viaEmbargos?: boolean }} args  viaEmbargos: inclui a ilegitimidade mesmo com o
 *   nome do sócio na CDA (nos embargos cabe a prova que a exceção não admite)
 */
export function materiasDeDefesa({ dados, agora = new Date(), viaEmbargos = false }) {
  const prazos = prazosDoCaso({ dados, agora });
  const secoes = [];
  const nomes = [];

  const prescritos = prazos.ordinaria.filter((c) => c.consumado);
  if (prescritos.length) {
    nomes.push('prescrição');
    secoes.push(secao('DA PRESCRIÇÃO DO CRÉDITO TRIBUTÁRIO', [
      'A ação para a cobrança do crédito tributário prescreve em cinco anos, contados da sua constituição definitiva, nos termos do art. 174 do CTN:',
      cit(TEXTO_ART_174),
      'No caso, as datas constantes dos documentos demonstram que o prazo prescricional se consumou antes de qualquer causa interruptiva:',
      ...prescritos.map((c) => `${rotulo(c)}: termo inicial em ${formatarBR(c.inicio)} e consumação em **${formatarBR(c.fim)}**.`),
      'Consumada a prescrição, o crédito tributário está extinto (art. 156, V, do CTN) e não pode ser exigido.',
    ], 'Extinção do crédito pelo decurso do prazo quinquenal.'));
  }

  const decaidos = prazos.decadencia.filter((c) => c.consumado);
  if (decaidos.length) {
    nomes.push('decadência');
    secoes.push(secao('DA DECADÊNCIA DO DIREITO DE LANÇAR', [
      'O direito de a Fazenda Pública constituir o crédito tributário extingue-se em cinco anos (art. 173, I, e art. 150, § 4º, do CTN). No caso, o lançamento foi notificado depois de encerrado esse prazo:',
      ...decaidos.map((c) => `${rotulo(c)}: prazo decadencial encerrado em **${formatarBR(c.fim)}**; notificação do lançamento apenas em ${formatarBR(c.notificacao)}.`),
      'O lançamento realizado após o prazo decadencial não constitui validamente o crédito, que está extinto (art. 156, V, do CTN).',
    ], 'Lançamento posterior ao prazo decadencial.'));
  }

  const intercorrente = prazos.intercorrente.find((c) => c.consumado);
  if (intercorrente) {
    nomes.push('prescrição intercorrente');
    secoes.push(secao('DA PRESCRIÇÃO INTERCORRENTE', [
      `A Fazenda Pública tomou ciência da não localização do devedor ou de bens penhoráveis em **${formatarBR(intercorrente.inicio)}**. Findo o prazo de um ano de suspensão, iniciou-se automaticamente o prazo prescricional de cinco anos, consumado em **${formatarBR(intercorrente.fim)}**, sem que houvesse, no período, penhora efetiva ou citação (art. 40 da Lei nº 6.830/1980 e REsp 1.340.553/RS, Temas 566 a 571).`,
      cit(TEXTO_ART_40_P4),
      'Consumada a prescrição intercorrente, o crédito está extinto (art. 156, V, do CTN).',
    ], 'Inércia da exequente após a suspensão da execução.'));
  }

  for (const av of avaliarTesesNovas({ dados })) {
    const ilegitimidadeNaCda = viaEmbargos && av.tese === 'ilegitimidade_passiva' && av.relevante && dados?.redirecionamento?.socio_consta_na_cda === 'sim';
    if (ilegitimidadeNaCda) {
      nomes.push('ilegitimidade passiva');
      secoes.push(secao('DA ILEGITIMIDADE PASSIVA DO(A) SÓCIO(A)', [
        'Embora o nome do(a) embargante conste da Certidão de Dívida Ativa, a presunção daí decorrente é relativa e cede diante de prova em contrário (art. 3º, parágrafo único, da Lei nº 6.830/1980), que estes embargos admitem.',
        'A responsabilidade do sócio exige a prática de ato com excesso de poderes ou infração de lei, contrato social ou estatutos (art. 135, III, do CTN); o simples inadimplemento não basta (Súmula 430/STJ).',
        preencher('fatos e provas de que o(a) embargante não praticou ato do art. 135 do CTN (retirada da sociedade, ausência de poderes de gerência, regularidade da gestão)'),
      ]));
      continue;
    }
    if (av.status !== 'ok') continue;
    nomes.push({ ilegitimidade_passiva: 'ilegitimidade passiva', nulidade_cda: 'nulidade da CDA', cobranca_indevida: 'cobrança indevida' }[av.tese]);
    const fora = new Set(['DOS FATOS', 'DO CABIMENTO DA EXCEÇÃO DE PRÉ-EXECUTIVIDADE', 'DOS PEDIDOS']);
    secoes.push(...montarPecaTeseNova(av, dados).secoes.filter((s) => !fora.has(s.titulo)));
  }

  return { secoes, nomes };
}

const listaE = (itens) => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`);

// ---- Embargos à execução --------------------------------------------------------------------------------------------------
const GARANTIAS = { penhora: 'penhora', deposito: 'depósito em dinheiro', fianca_seguro: 'fiança bancária ou seguro garantia' };

export function pecaEmbargos({ dados, entrada = {}, agora = new Date() }) {
  const avisos = [];
  const garantia = GARANTIAS[entrada.forma_garantia] ? entrada.forma_garantia : 'penhora';
  const justica = justicaDoCaso(dados);
  const prazo = calcularPrazo({ data: entrada.data_garantia, dias: 30, uteis: 'ambos', agora, justica });
  const { secoes: materias, nomes } = materiasDeDefesa({ dados, agora, viaEmbargos: true });
  if (!prazo) avisos.push('Sem a data da garantia/intimação, a tempestividade saiu para preencher.');
  else if (prazo.vencidoCorridos) {
    avisos.push(prazo.vencido
      ? `Atenção: pelo cálculo, o prazo de 30 dias já venceu (${prazo.finalCorridos} em dias corridos; ${prazo.final} em dias úteis). Confira antes de protocolar.`
      : `Atenção: em dias corridos o prazo venceu em ${prazo.finalCorridos}; em dias úteis (art. 219 do CPC) vence em ${prazo.final}. Confira a contagem aplicável.`);
  }
  if (!materias.length) avisos.push('O cálculo do caso não sustentou nenhuma matéria de defesa: o tópico de mérito saiu para preencher.');

  const tempestividade = secao('DA TEMPESTIVIDADE E DA GARANTIA DO JUÍZO', [
    prazo
      ? `A execução está garantida por ${GARANTIAS[garantia]}, e o(a) embargante foi intimado(a) em **${prazo.intimacao}**. Os presentes embargos são opostos dentro do prazo de 30 (trinta) dias previsto no art. 16 da Lei nº 6.830/1980.`
      : `A execução está garantida por ${GARANTIAS[garantia]}, e o(a) embargante foi intimado(a) em ${preencher('data da intimação da penhora, do depósito ou da juntada da fiança')}. Os presentes embargos são opostos dentro do prazo de 30 (trinta) dias previsto no art. 16 da Lei nº 6.830/1980.`,
    cit('Art. 16. O executado oferecerá embargos, no prazo de 30 (trinta) dias, contados: I - do depósito; II - da juntada da prova da fiança bancária ou do seguro garantia; III - da intimação da penhora. § 1º Não são admissíveis embargos do executado antes de garantida a execução.'),
    prazo ? confirmar(`prazo final em ${prazo.finalCorridos} (dias corridos) ou ${prazo.final} (dias úteis, art. 219 do CPC); conferir a contagem aplicável. Cálculo ${notaDoCalendario(prazo, justica)}`) : '',
  ]);

  const fatos = secao('DOS FATOS', [
    `Trata-se de execução fiscal ajuizada por ${exequenteDe(dados)} para a cobrança do crédito tributário consubstanciado na(s) CDA(s) nº ${listaCdas(dados)}.`,
    `Garantido o juízo, o(a) embargante vem opor os presentes embargos, pois o crédito executado não pode ser exigido${nomes.length ? `, em razão da ${listaE(nomes)}` : ''}, como se demonstra.`,
  ]);

  const efeito = secao('DO EFEITO SUSPENSIVO', [
    'O juiz pode atribuir efeito suspensivo aos embargos quando verificados os requisitos da tutela provisória e garantida a execução (art. 919, § 1º, do CPC, aplicável às execuções fiscais):',
    cit('Art. 919. Os embargos à execução não terão efeito suspensivo. § 1º O juiz poderá, a requerimento do embargante, atribuir efeito suspensivo aos embargos quando verificados os requisitos para a concessão da tutela provisória e desde que a execução já esteja garantida por penhora, depósito ou caução suficientes.'),
    `A probabilidade do direito decorre ${nomes.length ? `da ${listaE(nomes)}, demonstrada documentalmente acima` : 'das razões expostas acima'}. O perigo de dano está no prosseguimento dos atos de expropriação sobre o bem dado em garantia, de difícil reversão. A execução está garantida, como demonstrado.`,
  ]);

  const provas = secao('DAS PROVAS E DO VALOR DA CAUSA', [
    'O(A) embargante protesta pela produção de todas as provas admitidas em direito, em especial a documental já anexada (art. 16, § 2º, da Lei nº 6.830/1980).',
    `Dá-se à causa o valor de ${preencher('valor do débito embargado (R$)')}.`,
  ]);

  return {
    avisos,
    materias: nomes,
    peca: {
      referencia_processo: `Distribuição por dependência à Execução Fiscal n.º ${dados?.processo_execucao?.numero || preencher('número da execução fiscal')}`,
      qualificacao_parte: 'já qualificado(a) nos autos da execução fiscal em epígrafe',
      verbo_peca: 'à presença de Vossa Excelência, com fundamento no art. 16 da Lei nº 6.830/1980, opor os presentes',
      titulo_peca: 'EMBARGOS À EXECUÇÃO FISCAL',
      subtitulo_peca: `em face de ${exequenteDe(dados)}, pelos fatos e fundamentos a seguir expostos.`,
      secoes: [
        tempestividade,
        fatos,
        ...(materias.length ? materias : [secao('DO MÉRITO', [preencher('matérias de defesa (o cálculo do caso não sustentou nenhuma automaticamente)')])]),
        efeito,
        provas,
        pedidos([
          'o recebimento dos presentes embargos, com a atribuição de efeito suspensivo, nos termos do art. 919, § 1º, do CPC;',
          'a intimação da embargada para, querendo, impugná-los no prazo legal (art. 17 da Lei nº 6.830/1980);',
          `a procedência dos embargos, com o reconhecimento da ${nomes.length ? listaE(nomes) : preencher('matéria de defesa')} e a extinção da execução fiscal${nomes.includes('ilegitimidade passiva') ? ' (ou a exclusão do(a) embargante do polo passivo)' : ''};`,
          'a condenação da embargada ao pagamento de honorários advocatícios, nos termos do art. 85, §§ 2º e 3º, do CPC;',
          'a produção de todas as provas admitidas em direito.',
        ]),
      ],
    },
  };
}

// ---- Agravo de instrumento ------------------------------------------------------------------------------------------------
export function pecaAgravo({ dados, entrada = {}, agora = new Date() }) {
  const avisos = [];
  const justica = justicaDoCaso(dados);
  const prazo = calcularPrazo({ data: entrada.data_intimacao_decisao, dias: 15, uteis: true, agora, justica });
  if (!prazo) avisos.push('Sem a data da intimação da decisão, a tempestividade saiu para preencher.');
  else if (prazo.vencido) avisos.push(`Atenção: pelo cálculo (15 dias úteis, descontados fins de semana, feriados nacionais e a suspensão de fim de ano), o prazo do agravo venceu em ${prazo.final}. Confira antes de protocolar.`);
  const { secoes: materias, nomes } = materiasDeDefesa({ dados, agora });
  if (!materias.length) avisos.push('O cálculo do caso não sustentou nenhuma matéria: as razões de reforma saíram para preencher.');

  const federal = justica === 'federal';
  const tribunal = String(entrada.tribunal || '').trim().slice(0, 120)
    || (federal ? `TRIBUNAL REGIONAL FEDERAL DA ${preencher('região')} REGIÃO` : `TRIBUNAL DE JUSTIÇA DO ESTADO DE ${preencher('estado')}`);
  const vara = dados?.processo_execucao?.vara || preencher('vara de origem');
  const decisao = String(entrada.resumo_decisao || '').trim().slice(0, 1500);

  return {
    avisos,
    materias: nomes,
    peca: {
      enderecamento: `EXCELENTÍSSIMO(A) SENHOR(A) DESEMBARGADOR(A) PRESIDENTE DO ${tribunal.toUpperCase()}.`,
      referencia_processo: `Processo de origem: Execução Fiscal n.º ${dados?.processo_execucao?.numero || preencher('número da execução fiscal')} (${vara})`,
      qualificacao_parte: 'já qualificado(a) nos autos de origem',
      verbo_peca: 'à presença de Vossa Excelência, com fundamento no art. 1.015, parágrafo único, do CPC, interpor o presente',
      titulo_peca: 'AGRAVO DE INSTRUMENTO, COM PEDIDO DE EFEITO SUSPENSIVO',
      subtitulo_peca: `contra a decisão que rejeitou a exceção de pré-executividade, em face de ${exequenteDe(dados)}, pelas razões a seguir expostas.`,
      secoes: [
        secao('DO CABIMENTO E DA TEMPESTIVIDADE', [
          'Cabe agravo de instrumento contra as decisões interlocutórias proferidas no processo de execução (art. 1.015, parágrafo único, do CPC), como a que rejeita a exceção de pré-executividade.',
          prazo
            ? `O(A) agravante foi intimado(a) da decisão em **${prazo.intimacao}**. O prazo de 15 (quinze) dias úteis (art. 1.003, § 5º, e art. 219 do CPC) se encerra em ${prazo.final}, de modo que o recurso é tempestivo.`
            : `O(A) agravante foi intimado(a) da decisão em ${preencher('data da intimação')}; o recurso é interposto no prazo de 15 (quinze) dias úteis (art. 1.003, § 5º, e art. 219 do CPC).`,
          prazo ? confirmar(`prazo final em ${prazo.final}, ${notaDoCalendario(prazo, justica)}`) : '',
        ]),
        secao('DAS PEÇAS QUE INSTRUEM O RECURSO', [
          'O agravo é instruído com as cópias exigidas pelo art. 1.017, I, do CPC: a petição inicial da execução, a exceção de pré-executividade, a manifestação da exequente, a decisão agravada, a certidão da intimação e as procurações. Tratando-se de processo eletrônico, a juntada é dispensada (art. 1.017, § 5º, do CPC).',
          preencher('lista dos documentos anexados (Doc. nº)'),
        ]),
        secao('DA DECISÃO AGRAVADA', [
          decisao ? `O juízo de origem decidiu: ${decisao}` : preencher('síntese da decisão que rejeitou a exceção de pré-executividade'),
          'A decisão merece reforma, pois as matérias alegadas são conhecíveis de ofício e estão provadas pelos documentos dos autos, sem necessidade de dilação probatória (Súmula 393/STJ).',
        ]),
        ...(materias.length ? materias : [secao('DAS RAZÕES DE REFORMA', [preencher('razões de reforma')])]),
        secao('DO PEDIDO DE EFEITO SUSPENSIVO', [
          'O relator pode atribuir efeito suspensivo ao agravo ou antecipar a tutela recursal (art. 1.019, I, do CPC):',
          cit('Art. 1.019. Recebido o agravo de instrumento no tribunal e distribuído imediatamente, se não for o caso de aplicação do art. 932, incisos III e IV, o relator, no prazo de 5 (cinco) dias: I - poderá atribuir efeito suspensivo ao recurso ou deferir, em antecipação de tutela, total ou parcialmente, a pretensão recursal, comunicando ao juiz sua decisão;'),
          `A probabilidade de provimento decorre ${nomes.length ? `da ${listaE(nomes)}, demonstrada documentalmente` : 'das razões expostas'}. O risco de dano grave está no prosseguimento da execução, com a prática de atos de constrição e expropriação sobre o patrimônio do(a) agravante.`,
        ]),
        pedidos([
          'a concessão de efeito suspensivo ao recurso, para sobrestar a execução fiscal até o seu julgamento (art. 1.019, I, do CPC);',
          'a intimação do(a) agravado(a) para, querendo, responder ao recurso (art. 1.019, II, do CPC);',
          `o provimento do agravo, para reformar a decisão agravada e acolher a exceção de pré-executividade, com o reconhecimento da ${nomes.length ? listaE(nomes) : preencher('matéria')} e a extinção da execução fiscal;`,
          'a condenação do(a) agravado(a) ao pagamento de honorários advocatícios, nos termos do art. 85, §§ 2º e 3º, do CPC.',
        ]),
      ],
    },
  };
}

// ---- Reconhecimento de ofício da intercorrente ----------------------------------------------------------------------------
export function pecaReconhecimento({ dados, agora = new Date() }) {
  const prazos = prazosDoCaso({ dados, agora });
  const ic = prazos.intercorrente.find((c) => c.consumado);
  if (!ic) return null;
  return {
    avisos: [],
    materias: ['prescrição intercorrente'],
    peca: {
      qualificacao_parte: 'já qualificado(a) nos autos em epígrafe',
      verbo_peca: 'à presença de Vossa Excelência, requerer o',
      titulo_peca: 'RECONHECIMENTO DA PRESCRIÇÃO INTERCORRENTE',
      subtitulo_peca: 'nos termos do art. 40, § 4º, da Lei nº 6.830/1980, pelas razões a seguir.',
      secoes: [
        secao('DA PRESCRIÇÃO INTERCORRENTE CONSUMADA', [
          `A Fazenda Pública tomou ciência da não localização do devedor ou de bens penhoráveis em **${formatarBR(ic.inicio)}**. O prazo de um ano de suspensão terminou e, em seguida, transcorreu integralmente o prazo prescricional de cinco anos, consumado em **${formatarBR(ic.fim)}**, sem penhora efetiva nem citação no período.`,
          'Nos termos fixados pelo Superior Tribunal de Justiça no REsp 1.340.553/RS (Temas 566 a 571), a contagem é automática e independe de decisão de suspensão ou de arquivamento; somente a efetiva constrição patrimonial e a efetiva citação interrompem o prazo.',
          cit(TEXTO_ART_40_P4),
          'O reconhecimento pode e deve ser feito de ofício, ouvida previamente a Fazenda Pública.',
        ]),
        pedidos([
          'a intimação da Fazenda Pública para manifestar-se, nos termos do art. 40, § 4º, da Lei nº 6.830/1980;',
          `o reconhecimento da prescrição intercorrente do crédito consubstanciado na(s) CDA(s) nº ${listaCdas(dados)} e a extinção da execução fiscal (art. 156, V, do CTN e art. 487, II, do CPC);`,
          'a liberação de eventuais restrições e constrições existentes nos autos.',
        ]),
      ],
    },
  };
}
