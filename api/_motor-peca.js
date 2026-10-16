// api/_motor-peca.js
//
// Motor DETERMINÍSTICO da peça processual (EPE / Revisão de Débito Fiscal).
// Mesmo princípio de _motor-prazos.js: a IA extrai FATOS tipados com fonte
// (api/_schema-dados-peca.js); aqui o CÓDIGO soma prazos, compara datas,
// decide se a peça pode ser gerada e escolhe o modelo. Nenhuma data de
// consumação, nenhum "prescrito/decaído" e nenhuma escolha de template vem de
// texto livre do modelo. Puro: sem I/O, sem relógio implícito (a data atual
// entra por parâmetro) — por isso é testável sem rede nem banco.
//
// UMA AVALIAÇÃO POR TESE (prescrição ordinária, decadência, prescrição
// intercorrente), cada uma com o seu status, bloqueios e modelo: um caso pode
// ter mais de uma peça disponível (ex.: decadência de alguns períodos e
// prescrição intercorrente da execução) e quem escolhe qual gerar é o usuário —
// os modelos NÃO são fundidos. Ver avaliarPecas().
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

import { calcularPrescricaoIntercorrente } from './_motor-prazos.js';

export const PRAZO_ANOS = 5;

export const TEMPLATES = {
  EPE_PRESCRICAO: 'EPE_prescricao_ordinaria',
  EPE_DECADENCIA: 'EPE_decadencia',
  EPE_INTERCORRENTE: 'EPE_prescricao_intercorrente',
  REVISAO_PGFN_PRESCRICAO: 'Revisao_PGFN_prescricao_ordinaria',
  REVISAO_PGFN_DECADENCIA: 'Revisao_PGFN_decadencia',
};

export const TESES = ['prescricao_ordinaria', 'decadencia', 'prescricao_intercorrente'];

export const MSG_SEM_MODELO = 'Modelo de peça ainda não disponível para este cenário';
export const MSG_BLOQUEADA = 'A peça não pode ser gerada automaticamente.';
export const AVISO_CREDITO_DECLARADO =
  'Crédito constituído por declaração do contribuinte: a tese de decadência não se aplica ao valor declarado.';
export const MSG_VENCIMENTO_NAO_IDENTIFICADO =
  'Vencimento não identificado: necessário para contar a decadência pelo art. 173, I';

// ---------------------------------------------------------------------------
// Datas — parse estrito DD/MM/AAAA em UTC (mesma convenção de _motor-prazos.js:
// nada aqui usa hora do dia, só o dia calendário, sem deslocamento de fuso).
// ---------------------------------------------------------------------------

export function parseDataBR(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str || '').trim());
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  // Rejeita datas que o Date "normaliza" em silêncio (ex.: 31/02).
  if (data.getUTCDate() !== Number(dia) || data.getUTCMonth() !== Number(mes) - 1) return null;
  return data;
}

export function formatarDataBR(data) {
  const dia = String(data.getUTCDate()).padStart(2, '0');
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${data.getUTCFullYear()}`;
}

// Soma N anos civis. 29/fev + N anos em ano não bissexto vira 1º/mar (rollover
// do Date) — mesma convenção de _motor-prazos.js, coberta por teste.
export function somarAnos(data, anos) {
  return new Date(Date.UTC(data.getUTCFullYear() + anos, data.getUTCMonth(), data.getUTCDate()));
}

// A extração devolve cada data como { data, fonte }; os testes e chamadores
// internos podem passar a string direto. Aceita as duas formas.
const dataStr = (v) => (typeof v === 'string' ? v : typeof v?.data === 'string' ? v.data : '');
const fonteStr = (v) => (v && typeof v === 'object' && typeof v.fonte === 'string' ? v.fonte : '');
const preenchido = (v) => dataStr(v).trim() !== '';
const tresEstados = (v) => {
  const x = String(v ?? '').trim().toLowerCase();
  if (x === 'sim') return 'sim';
  if (x === 'não' || x === 'nao') return 'não';
  return 'não consta';
};

// ---------------------------------------------------------------------------
// Cálculos por período
// ---------------------------------------------------------------------------

/**
 * Prescrição ordinária (art. 174 CTN, Súmula 436/STJ, Tema 265/STJ):
 * termo inicial = a data POSTERIOR entre vencimento e entrega da declaração;
 * consumação = termo inicial + 5 anos (mesma data, 5 anos depois — convenção do
 * modelo; a leitura "dia seguinte" do Tema 265 é questão em aberto, registrada
 * em templates/pecas/REVISAO_JURIDICA.md).
 */
export function calcularPrescricaoOrdinaria({ vencimento, entrega }) {
  const venc = parseDataBR(dataStr(vencimento));
  const entr = parseDataBR(dataStr(entrega));
  if (!venc || !entr) {
    const faltam = [];
    if (!venc) faltam.push(preenchido(vencimento) ? 'data de vencimento inválida' : 'data de vencimento');
    if (!entr) faltam.push(preenchido(entrega) ? 'data de entrega da declaração inválida' : 'data de entrega da declaração');
    return { ok: false, motivo: faltam.join(' e ') };
  }
  const entregaPosterior = entr.getTime() > venc.getTime();
  const termoInicial = entregaPosterior ? entr : venc;
  return {
    ok: true,
    termoInicial,
    consumacao: somarAnos(termoInicial, PRAZO_ANOS),
    regraTermo: entregaPosterior ? 'entrega_da_declaracao' : 'vencimento',
  };
}

/**
 * Decadência (CTN). A regra depende do pagamento antecipado e da imputação de dolo:
 *  - com pagamento antecipado e SEM imputação de dolo/fraude/simulação: art. 150 §4º →
 *    marco = fato gerador; termo final = fato gerador + 5 anos;
 *  - sem pagamento antecipado, OU com dolo/fraude/simulação imputado (mesmo havendo
 *    pagamento): art. 173, I → marco = 1º de janeiro do ano seguinte ao do VENCIMENTO
 *    (é quando o lançamento "poderia ter sido efetuado"); termo final = marco + 5 anos.
 *    Contar do fato gerador antecipa o marco e poderia afirmar decadência antes da hora;
 *    contar do vencimento é a leitura conservadora (ver REVISAO_JURIDICA.md).
 *    Sem vencimento COM FONTE, não se calcula: devolve indeterminado.
 * "Não consta" em pagamento antecipado NÃO é presumido (indeterminado) — exceto quando o
 * dolo imputado já força o art. 173, I. "Não consta" em dolo só sinaliza `confirmarDolo`.
 *
 * @param {{ fatoGerador: any, vencimento: any, houvePagamentoAntecipado: string, imputacaoDolo: string }} a
 */
export function calcularDecadencia({ fatoGerador, vencimento, houvePagamentoAntecipado, imputacaoDolo }) {
  const fg = parseDataBR(dataStr(fatoGerador));
  if (!fg) {
    return { ok: false, motivo: preenchido(fatoGerador) ? 'data do fato gerador inválida' : 'data do fato gerador' };
  }
  const pagamento = tresEstados(houvePagamentoAntecipado);
  const dolo = tresEstados(imputacaoDolo);

  let regra;
  if (dolo === 'sim') regra = 'art_173_I';
  else if (pagamento === 'sim') regra = 'art_150_par_4';
  else if (pagamento === 'não') regra = 'art_173_I';
  else return { ok: false, motivo: 'confirmação de pagamento antecipado (consta como "não consta")' };

  let marcoInicial;
  if (regra === 'art_150_par_4') {
    marcoInicial = fg;
  } else {
    const venc = parseDataBR(dataStr(vencimento));
    if (!venc || fonteStr(vencimento).trim() === '') {
      return { ok: false, motivo: MSG_VENCIMENTO_NAO_IDENTIFICADO, vencimentoAusente: true };
    }
    marcoInicial = new Date(Date.UTC(venc.getUTCFullYear() + 1, 0, 1));
  }
  return {
    ok: true,
    regra,
    marcoInicial,
    termoFinal: somarAnos(marcoInicial, PRAZO_ANOS),
    doloImputado: dolo === 'sim',
    // art. 150 §4º pressupõe ausência de dolo: se o documento não permite afirmar, o advogado confirma
    confirmarDolo: regra === 'art_150_par_4' && dolo === 'não consta',
  };
}

// ---------------------------------------------------------------------------
// Escolha do modelo
// ---------------------------------------------------------------------------

function execucaoAjuizada(processo) {
  return Boolean(processo && (String(processo.numero || '').trim() || preenchido(processo.data_ajuizamento)));
}

/**
 * Escolha do modelo — matriz decidida em código, nunca pelo modelo de IA.
 *               | execução ajuizada | só inscrição em dívida ativa
 * prescrição    | EPE prescrição    | Revisão PGFN prescrição
 * decadência    | EPE decadência    | Revisão PGFN decadência
 * intercorrente | EPE intercorrente | n/a (sem modelo)
 */
export function escolherTemplate(tese, ajuizada) {
  if (tese === 'prescricao_ordinaria') return ajuizada ? TEMPLATES.EPE_PRESCRICAO : TEMPLATES.REVISAO_PGFN_PRESCRICAO;
  if (tese === 'decadencia') return ajuizada ? TEMPLATES.EPE_DECADENCIA : TEMPLATES.REVISAO_PGFN_DECADENCIA;
  if (tese === 'prescricao_intercorrente') return ajuizada ? TEMPLATES.EPE_INTERCORRENTE : null;
  return null;
}

const TIPO_CONCLUSAO = {
  prescricao_ordinaria: 'prescricao',
  decadencia: 'decadencia',
  prescricao_intercorrente: 'prescricao_intercorrente',
};
const NOME_TESE = { prescricao_ordinaria: 'prescrição', decadencia: 'decadência', prescricao_intercorrente: 'prescrição intercorrente' };

const parecerFavoravel = (tese, conclusoes) =>
  (Array.isArray(conclusoes) ? conclusoes : []).some((c) => c?.tipo === TIPO_CONCLUSAO[tese] && c?.severidade === 'favoravel');

/**
 * Compara o que o motor concluiu com as `conclusoes` já salvas do parecer.
 * Qualquer assimetria bloqueia a peça: não é função desta etapa decidir qual
 * dos dois está certo.
 */
function divergenciaComParecer(tese, motorConclui, conclusoes) {
  const favoravel = parecerFavoravel(tese, conclusoes);
  if (favoravel === motorConclui) return null;
  return motorConclui
    ? `O cálculo da peça conclui pela ${NOME_TESE[tese]}, mas o parecer salvo não traz conclusão favorável nesse sentido.`
    : `O parecer salvo é favorável à ${NOME_TESE[tese]}, mas o cálculo da peça não confirma.`;
}

const rotuloPeriodo = (cda, periodo) => `${cda || 'CDA'} / ${periodo || 'período não identificado'}`;

// ---------------------------------------------------------------------------
// Avaliação — prescrição ordinária
// ---------------------------------------------------------------------------

function avaliarOrdinaria({ dados, referencia, avisosRef }) {
  const bloqueios = [];
  const avisos = [...avisosRef];
  const prescritos = [];
  const naoConfigurados = [];
  let periodosDoTipo = 0;

  for (const inscricao of dados?.inscricoes || []) {
    const cda = inscricao?.numero_cda || '';
    const eventos = Array.isArray(inscricao?.eventos_interruptivos) ? inscricao.eventos_interruptivos : [];

    for (const p of inscricao?.periodos || []) {
      if (p?.modalidade_lancamento !== 'homologacao_declarado') continue;
      periodosDoTipo++;
      const base = { cda, periodo: p?.periodo || '', modalidade: p.modalidade_lancamento, tipo_declaracao: p?.tipo_declaracao || '' };

      const calc = calcularPrescricaoOrdinaria({ vencimento: p.data_vencimento, entrega: p.data_entrega_declaracao });
      if (!calc.ok) {
        bloqueios.push(`${rotuloPeriodo(cda, base.periodo)}: faltam dados para o cálculo da prescrição (${calc.motivo}).`);
        continue;
      }
      const registro = {
        ...base,
        tese: 'prescricao_ordinaria',
        entrega: parseDataBR(dataStr(p.data_entrega_declaracao)),
        vencimento: parseDataBR(dataStr(p.data_vencimento)),
        termoInicial: calc.termoInicial,
        consumacao: calc.consumacao,
        regraTermo: calc.regraTermo,
        fonteEntrega: fonteStr(p.data_entrega_declaracao),
        fonteVencimento: fonteStr(p.data_vencimento),
      };
      if (referencia) registro.prescrito = referencia.getTime() > calc.consumacao.getTime();

      // Evento potencialmente interruptivo/suspensivo no prazo: BLOQUEIA. Evento posterior à
      // consumação não revive prazo já extinto (o próprio modelo diz isso do protesto) — vira
      // aviso, não bloqueio.
      for (const ev of eventos) {
        const d = parseDataBR(dataStr(ev?.data));
        const rotulo = `${ev?.tipo || 'evento'} em ${dataStr(ev?.data) || '[sem data]'}`;
        if (!d) {
          bloqueios.push(`${cda || 'CDA'}: evento "${rotulo}" com data inválida ou ausente — exige análise manual.`);
        } else if (d.getTime() >= calc.termoInicial.getTime() && d.getTime() <= calc.consumacao.getTime()) {
          bloqueios.push(
            `${rotuloPeriodo(cda, base.periodo)}: ${rotulo} dentro do prazo prescricional (${formatarDataBR(calc.termoInicial)} a ${formatarDataBR(calc.consumacao)}) — pode interromper ou suspender o prazo; o caso exige análise manual.`,
          );
        } else if (d.getTime() > calc.consumacao.getTime() && referencia && d.getTime() <= referencia.getTime()) {
          avisos.push(`${rotuloPeriodo(cda, base.periodo)}: ${rotulo} é posterior à consumação do prazo e, em tese, não o interrompe — conferir.`);
        }
      }
      (registro.prescrito ? prescritos : naoConfigurados).push(registro);
    }
  }
  return { creditos: prescritos, omitidos: naoConfigurados, avaliados: [...prescritos, ...naoConfigurados], bloqueios, avisos, n: periodosDoTipo };
}

// ---------------------------------------------------------------------------
// Avaliação — decadência
// ---------------------------------------------------------------------------

function avaliarDecadencia({ dados }) {
  const bloqueios = [];
  const avisos = [];
  const decaidos = [];
  const dentroDoPrazo = [];
  let periodosDoTipo = 0;
  let declarados = 0;
  let avisouVicio = false;

  for (const inscricao of dados?.inscricoes || []) {
    const cda = inscricao?.numero_cda || '';
    const eventos = Array.isArray(inscricao?.eventos_interruptivos) ? inscricao.eventos_interruptivos : [];

    for (const p of inscricao?.periodos || []) {
      // Pela Súmula 436/STJ a declaração CONSTITUI o crédito: não há lançamento a decair.
      if (p?.modalidade_lancamento === 'homologacao_declarado') {
        declarados++;
        continue;
      }
      if (p?.modalidade_lancamento !== 'homologacao_nao_declarado' && p?.modalidade_lancamento !== 'oficio') continue;
      periodosDoTipo++;
      const rotulo = rotuloPeriodo(cda, p?.periodo);

      // Art. 173, II, CTN: lançamento anterior anulado por vício FORMAL reabre o prazo — análise manual.
      const vicio = tresEstados(p?.lancamento_anterior_anulado_vicio_formal);
      if (vicio === 'sim') {
        bloqueios.push(
          `${rotulo}: consta lançamento anterior anulado por vício formal — o art. 173, II, do CTN reabre o prazo decadencial; o caso exige análise manual.`,
        );
        continue;
      }
      if (vicio === 'não consta' && !avisouVicio) {
        avisouVicio = true;
        avisos.push('Não consta dos documentos se houve lançamento anterior anulado por vício formal (art. 173, II, CTN) — conferir antes de protocolar.');
      }

      const calc = calcularDecadencia({
        fatoGerador: p.data_fato_gerador,
        vencimento: p.data_vencimento,
        houvePagamentoAntecipado: p.houve_pagamento_antecipado,
        imputacaoDolo: p.imputacao_dolo_fraude_simulacao,
      });
      const notificacao = parseDataBR(dataStr(p.data_notificacao_lancamento));
      if (!calc.ok || !notificacao) {
        const faltam = [];
        if (!calc.ok) faltam.push(calc.motivo);
        if (!notificacao) faltam.push(preenchido(p.data_notificacao_lancamento) ? 'data da notificação do lançamento inválida' : 'data da notificação do lançamento');
        bloqueios.push(
          calc.vencimentoAusente && notificacao
            ? `${rotulo}: ${MSG_VENCIMENTO_NAO_IDENTIFICADO}.`
            : `${rotulo}: faltam dados para o cálculo da decadência (${faltam.join(' e ')}).`,
        );
        continue;
      }

      const registro = {
        cda,
        periodo: p?.periodo || '',
        tese: 'decadencia',
        modalidade: p.modalidade_lancamento,
        regra: calc.regra,
        doloImputado: calc.doloImputado,
        confirmarDolo: calc.confirmarDolo,
        pagamentoAntecipado: tresEstados(p.houve_pagamento_antecipado),
        fontePagamento: p.fonte_pagamento_antecipado || '',
        fatoGerador: parseDataBR(dataStr(p.data_fato_gerador)),
        fonteFatoGerador: fonteStr(p.data_fato_gerador),
        vencimento: parseDataBR(dataStr(p.data_vencimento)),
        marcoInicial: calc.marcoInicial,
        termoFinal: calc.termoFinal,
        notificacao,
        fonteNotificacao: fonteStr(p.data_notificacao_lancamento),
        // Decadência compara com a NOTIFICAÇÃO do lançamento, não com o ajuizamento.
        decaido: notificacao.getTime() > calc.termoFinal.getTime(),
      };

      // Decadência não se interrompe. Mas parcelamento/compensação/protesto antes da notificação
      // podem indicar confissão/constituição do crédito — isso bloqueia. Pagamento é o próprio
      // fato que define a regra do art. 150 §4º; aparece só como aviso.
      for (const ev of eventos) {
        const d = parseDataBR(dataStr(ev?.data));
        const tipo = String(ev?.tipo || '').toLowerCase();
        const rotuloEv = `${ev?.tipo || 'evento'} em ${dataStr(ev?.data) || '[sem data]'}`;
        if (!d) {
          bloqueios.push(`${cda || 'CDA'}: evento "${rotuloEv}" com data inválida ou ausente — exige análise manual.`);
        } else if (registro.fatoGerador && d.getTime() >= registro.fatoGerador.getTime() && d.getTime() <= notificacao.getTime()) {
          if (tipo === 'pagamento') avisos.push(`${rotulo}: ${rotuloEv} — conferir se coincide com o pagamento antecipado informado.`);
          else bloqueios.push(`${rotulo}: ${rotuloEv} antes da notificação do lançamento — pode configurar confissão/constituição do crédito; o caso exige análise manual.`);
        }
      }
      (registro.decaido ? decaidos : dentroDoPrazo).push(registro);
    }
  }

  if (declarados > 0) {
    avisos.push(AVISO_CREDITO_DECLARADO);
    // Só períodos declarados: não há o que alegar de decadência — a peça não pode ser gerada.
    if (periodosDoTipo === 0) bloqueios.push(AVISO_CREDITO_DECLARADO);
  }
  return {
    creditos: decaidos,
    omitidos: dentroDoPrazo,
    avaliados: [...decaidos, ...dentroDoPrazo],
    bloqueios,
    avisos,
    n: periodosDoTipo,
    declarados,
  };
}

// ---------------------------------------------------------------------------
// Avaliação — prescrição intercorrente (reusa _motor-prazos.js, sem reimplementar a conta)
// ---------------------------------------------------------------------------

const EVENTO_EXTENSO = {
  citacao: 'citação do executado',
  penhora_constricao: 'constrição patrimonial efetiva',
  requerimento_constricao: 'requerimento de constrição patrimonial',
};

function avaliarIntercorrente({ dados, agora }) {
  const bloqueios = [];
  const avisos = [];
  const eventos = (dados?.eventos_execucao || []).map((e) => ({
    data: e.data,
    inscricao: e.inscricao || '',
    categoria: e.categoria,
    fonte: e.fonte,
  }));
  const resultados = calcularPrescricaoIntercorrente(eventos, agora);
  const nomesCda = (dados?.inscricoes || []).map((i) => i?.numero_cda).filter(Boolean);

  // Só interessa quem tem ciclo ATIVO e RECONHECIDO hoje.
  const reconhecidos = resultados
    .map((r) => ({ r, ativo: r.ciclos.find((c) => c.status === 'ativo' && c.reconhecida) }))
    .filter((x) => x.ativo);

  const base = { creditos: [], omitidos: [], avaliados: [], bloqueios, avisos, n: resultados.length, intercorrente: null };
  if (reconhecidos.length === 0) return base;

  // Mais de um grupo reconhecido com DATAS DIFERENTES: o modelo é de um único episódio — não escolho no lugar do advogado.
  const assinatura = (c) => `${c.dataIntimacao}|${c.dataFimSuspensao}|${c.dataPrazoFinal}`;
  const distintos = [...new Set(reconhecidos.map((x) => assinatura(x.ativo)))];
  if (distintos.length > 1) {
    bloqueios.push(
      `Há prescrição intercorrente reconhecida com datas diferentes entre inscrições (${reconhecidos
        .map((x) => `${x.r.inscricao}: ciência em ${x.ativo.dataIntimacao}`)
        .join('; ')}) — o modelo trata um único episódio; o caso exige análise manual.`,
    );
    return { ...base, intercorrente: null };
  }

  const ativo = reconhecidos[0].ativo;
  const grupoExecucao = reconhecidos.some((x) => x.r.inscricao === '(execução)');
  const cobertas = grupoExecucao ? nomesCda : reconhecidos.map((x) => x.r.inscricao);
  const naoCobertas = nomesCda.filter((n) => !cobertas.includes(n));
  if (naoCobertas.length > 0) {
    avisos.push(`A peça cobre apenas parte das CDAs: não há prescrição intercorrente reconhecida para ${naoCobertas.join(', ')}.`);
  }

  // O que não foi localizado, lido do evento de intimação que abriu o ciclo.
  const intimacao = eventos
    .map((e, i) => ({ e, o: dados.eventos_execucao[i] }))
    .find(({ e }) => e.categoria === 'intimacao_nao_localizacao_bens' && e.data === ativo.dataIntimacao);
  const objeto = intimacao?.o?.objeto_nao_localizado || 'não consta';

  // Ciclos anteriores interrompidos (de qualquer grupo reconhecido), para o parágrafo explicativo.
  const interrompidos = reconhecidos
    .flatMap((x) => x.r.ciclos.filter((c) => c.status === 'interrompido'))
    .map((c) => ({
      dataIntimacao: c.dataIntimacao,
      dataInterrupcao: c.requerimentoRetroativo?.data || '',
      categoria: c.requerimentoRetroativo?.categoria || '',
      eventoExtenso: EVENTO_EXTENSO[c.requerimentoRetroativo?.categoria] || 'evento interruptivo',
    }));

  // Suspensão por parcelamento/compensação/pagamento dentro do prazo: o motor de intercorrente não enxerga
  // esses eventos — na dúvida, análise manual (mesma postura conservadora das outras teses).
  const ini = parseDataBR(ativo.dataIntimacao);
  const fim = parseDataBR(ativo.dataPrazoFinal);
  for (const insc of dados?.inscricoes || []) {
    if (!cobertas.includes(insc?.numero_cda)) continue;
    for (const ev of insc?.eventos_interruptivos || []) {
      const tipo = String(ev?.tipo || '').toLowerCase();
      if (!['parcelamento', 'pagamento', 'compensacao'].includes(tipo)) continue;
      const d = parseDataBR(dataStr(ev?.data));
      if (!d) {
        bloqueios.push(`${insc.numero_cda}: evento "${tipo}" com data inválida ou ausente — exige análise manual.`);
      } else if (ini && fim && d.getTime() >= ini.getTime() && d.getTime() <= fim.getTime()) {
        bloqueios.push(
          `${insc.numero_cda}: ${tipo} em ${dataStr(ev.data)} dentro do prazo da prescrição intercorrente (${ativo.dataIntimacao} a ${ativo.dataPrazoFinal}) — pode suspender o prazo; o caso exige análise manual.`,
        );
      }
    }
  }

  const registro = { cdas: cobertas, tese: 'prescricao_intercorrente' };
  return {
    ...base,
    creditos: cobertas.length ? cobertas.map((cda) => ({ ...registro, cda })) : [{ ...registro, cda: '' }],
    intercorrente: {
      dataIntimacao: ativo.dataIntimacao,
      fonteIntimacao: ativo.fonteIntimacao,
      dataFimSuspensao: ativo.dataFimSuspensao,
      dataPrazoFinal: ativo.dataPrazoFinal,
      objetoNaoLocalizado: objeto,
      ciclosInterrompidos: interrompidos,
      cdasCobertas: cobertas,
    },
  };
}

// ---------------------------------------------------------------------------
// Avaliação por tese e lista de peças disponíveis
// ---------------------------------------------------------------------------

/**
 * Avalia UMA tese.
 * @param {object} args
 * @param {object} args.dados  saída normalizada de ESQUEMA_DADOS_PECA
 * @param {string} args.tese   'prescricao_ordinaria' | 'decadencia' | 'prescricao_intercorrente'
 * @param {Array}  [args.conclusoesParecer]  `analises.resultado.conclusoes`
 * @param {Date}   [args.agora]  data de geração (referência quando não há execução ajuizada)
 * @returns {{ tese: string, status: 'ok'|'bloqueada'|'indisponivel'|'sem_tese', relevante: boolean,
 *   template: string|null, creditos: object[], omitidos: object[], avaliados: object[], avisos: string[],
 *   bloqueios: string[], divergencias: string[], dataReferencia: string, mensagem: string,
 *   intercorrente: object|null, decadenciaTotal?: boolean, decadenciaParcial?: boolean }}
 */
export function avaliarPeca({ dados, tese, conclusoesParecer = [], agora = new Date() }) {
  const processo = dados?.processo_execucao || {};
  const ajuizada = execucaoAjuizada(processo);

  // Data de referência da prescrição ORDINÁRIA: ajuizamento (execução) ou geração (revisão PGFN).
  let referencia = null;
  const avisosRef = [];
  const bloqueiosRef = [];
  if (tese === 'prescricao_ordinaria') {
    if (ajuizada) {
      referencia = parseDataBR(dataStr(processo.data_ajuizamento));
      if (!referencia) {
        bloqueiosRef.push(
          preenchido(processo.data_ajuizamento)
            ? 'A data de ajuizamento da execução é inválida.'
            : 'A data de ajuizamento da execução não consta dos documentos.',
        );
      }
    } else {
      referencia = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
      avisosRef.push('Sem execução fiscal ajuizada: a prescrição foi aferida até a data de geração da peça.');
    }
  }

  let r;
  if (tese === 'prescricao_ordinaria') r = avaliarOrdinaria({ dados, referencia, avisosRef });
  else if (tese === 'decadencia') r = avaliarDecadencia({ dados });
  else if (tese === 'prescricao_intercorrente') r = avaliarIntercorrente({ dados, agora });
  else throw new Error(`tese desconhecida: ${tese}`);

  const bloqueios = [...bloqueiosRef, ...r.bloqueios];

  // Período sem modalidade identificada: pode ser declarado ou não — bloqueia as duas teses de período.
  if (tese !== 'prescricao_intercorrente') {
    for (const insc of dados?.inscricoes || []) {
      for (const p of insc?.periodos || []) {
        if (!['homologacao_declarado', 'homologacao_nao_declarado', 'oficio'].includes(p?.modalidade_lancamento)) {
          bloqueios.push(`${rotuloPeriodo(insc?.numero_cda, p?.periodo)}: modalidade de lançamento não identificada — exige análise manual.`);
        }
      }
    }
  }

  const motorConclui = r.creditos.length > 0;
  const divergencia = divergenciaComParecer(tese, motorConclui, conclusoesParecer);
  const divergencias = divergencia ? [divergencia] : [];
  const relevante = r.n > 0 || parecerFavoravel(tese, conclusoesParecer) || divergencias.length > 0;

  const avisos = [...r.avisos];
  if (tese !== 'decadencia' && motorConclui && r.omitidos.length > 0) {
    avisos.push(`${r.omitidos.length} período(s) não estão prescritos e ficaram fora da peça.`);
  }
  if (tese === 'decadencia' && motorConclui && r.omitidos.length > 0) {
    avisos.push(`${r.omitidos.length} período(s) estão dentro do prazo decadencial: a peça pede a retificação parcial da inscrição.`);
  }

  const template = escolherTemplate(tese, ajuizada);
  const comum = {
    tese,
    relevante,
    creditos: r.creditos,
    omitidos: r.omitidos,
    avaliados: r.avaliados,
    avisos,
    bloqueios,
    divergencias,
    dataReferencia: referencia ? formatarDataBR(referencia) : '',
    intercorrente: r.intercorrente || null,
    ...(tese === 'decadencia'
      ? { decadenciaTotal: motorConclui && r.omitidos.length === 0, decadenciaParcial: motorConclui && r.omitidos.length > 0 }
      : {}),
  };

  if (bloqueios.length > 0 || divergencias.length > 0) {
    return { ...comum, status: 'bloqueada', template: null, mensagem: MSG_BLOQUEADA };
  }
  if (!motorConclui) {
    return { ...comum, status: 'sem_tese', template: null, mensagem: `O cálculo não identificou ${NOME_TESE[tese]} consumada.` };
  }
  if (!template) return { ...comum, status: 'indisponivel', template: null, mensagem: MSG_SEM_MODELO };
  return { ...comum, status: 'ok', template, mensagem: '' };
}

/**
 * Todas as peças que o caso comporta, uma por tese, cada uma com o seu status. Quem escolhe
 * qual gerar é o usuário (os modelos não são fundidos). Teses sem relação com o caso (ex.: sem
 * execução e sem eventos de não localização) não aparecem.
 */
export function avaliarPecas({ dados, conclusoesParecer = [], agora = new Date() }) {
  const pecas = TESES.map((tese) => avaliarPeca({ dados, tese, conclusoesParecer, agora })).filter(
    (p) => p.status !== 'sem_tese' && p.relevante,
  );
  return { pecas, dataReferencia: pecas.find((p) => p.dataReferencia)?.dataReferencia || '' };
}

export default { avaliarPeca, avaliarPecas, calcularPrescricaoOrdinaria, calcularDecadencia, escolherTemplate };
