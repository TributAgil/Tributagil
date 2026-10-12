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
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

export const PRAZO_ANOS = 5;

export const TEMPLATES = {
  EPE_PRESCRICAO: 'EPE_prescricao_ordinaria',
  EPE_DECADENCIA: 'EPE_decadencia',
  REVISAO_PGFN_PRESCRICAO: 'Revisao_PGFN_prescricao_ordinaria',
};

export const MSG_SEM_MODELO = 'Modelo de peça ainda não disponível para este cenário';

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
 * Decadência. Regra pelo pagamento antecipado:
 *  - sim (e sem indício de dolo/fraude/simulação): art. 150 §4º → fato gerador + 5 anos;
 *  - não, ou com dolo/fraude/simulação: art. 173, I → 1º de janeiro do exercício
 *    seguinte ao do fato gerador + 5 anos.
 * "Não consta" em qualquer dos dois campos decisivos NÃO é presumido: devolve
 * indeterminado e o chamador bloqueia a peça.
 */
export function calcularDecadencia({ fatoGerador, houvePagamentoAntecipado, indicioDolo }) {
  const fg = parseDataBR(dataStr(fatoGerador));
  if (!fg) {
    return { ok: false, motivo: preenchido(fatoGerador) ? 'data do fato gerador inválida' : 'data do fato gerador' };
  }
  const pagamento = String(houvePagamentoAntecipado || '').toLowerCase();
  const dolo = String(indicioDolo || 'não').toLowerCase();
  if (pagamento !== 'sim' && pagamento !== 'não' && pagamento !== 'nao') {
    return { ok: false, motivo: 'confirmação de pagamento antecipado (consta como "não consta")' };
  }
  if (dolo === 'não consta' || dolo === 'nao consta') {
    return { ok: false, motivo: 'confirmação sobre indício de dolo, fraude ou simulação (consta como "não consta")' };
  }

  const aplicaArt150 = pagamento === 'sim' && dolo !== 'sim';
  const marcoInicial = aplicaArt150
    ? fg
    : new Date(Date.UTC(fg.getUTCFullYear() + 1, 0, 1));
  return {
    ok: true,
    regra: aplicaArt150 ? 'art_150_par_4' : 'art_173_I',
    marcoInicial,
    termoFinal: somarAnos(marcoInicial, PRAZO_ANOS),
  };
}

// ---------------------------------------------------------------------------
// Avaliação da peça inteira
// ---------------------------------------------------------------------------

function execucaoAjuizada(processo) {
  return Boolean(processo && (String(processo.numero || '').trim() || preenchido(processo.data_ajuizamento)));
}

/**
 * Escolha do modelo — matriz decidida em código, nunca pelo modelo de IA.
 *               | execução ajuizada | só inscrição em dívida ativa
 * prescrição    | EPE prescrição    | Revisão PGFN prescrição
 * decadência    | EPE decadência    | (sem modelo)
 * intercorrente | (sem modelo)      | n/a
 */
export function escolherTemplate(tese, ajuizada) {
  if (tese === 'prescricao_ordinaria') return ajuizada ? TEMPLATES.EPE_PRESCRICAO : TEMPLATES.REVISAO_PGFN_PRESCRICAO;
  if (tese === 'decadencia') return ajuizada ? TEMPLATES.EPE_DECADENCIA : null;
  return null;
}

const TIPO_CONCLUSAO = { prescricao_ordinaria: 'prescricao', decadencia: 'decadencia' };

/**
 * Compara o que o motor concluiu com as `conclusoes` já salvas do parecer.
 * Qualquer assimetria bloqueia a peça: não é função desta etapa decidir qual
 * dos dois está certo.
 */
function divergenciaComParecer(tese, motorConclui, conclusoesParecer) {
  const tipo = TIPO_CONCLUSAO[tese];
  const doTipo = (Array.isArray(conclusoesParecer) ? conclusoesParecer : []).filter((c) => c?.tipo === tipo);
  const parecerFavoravel = doTipo.some((c) => c?.severidade === 'favoravel');
  if (parecerFavoravel === motorConclui) return null;
  return motorConclui
    ? `O cálculo da peça conclui pela ${tese === 'decadencia' ? 'decadência' : 'prescrição'}, mas o parecer salvo não traz conclusão favorável nesse sentido.`
    : `O parecer salvo é favorável à ${tese === 'decadencia' ? 'decadência' : 'prescrição'}, mas o cálculo da peça não confirma.`;
}

/**
 * @param {object} args
 * @param {object} args.dados  saída de ESQUEMA_DADOS_PECA (ver _schema-dados-peca.js)
 * @param {Array}  [args.conclusoesParecer]  `analises.resultado.conclusoes`
 * @param {Date}   [args.agora]  data de geração (referência quando não há execução ajuizada)
 * @returns {{ status: 'ok'|'bloqueada'|'indisponivel'|'sem_tese', tese: string|null,
 *   template: string|null, creditos: object[], omitidos: object[], avisos: string[],
 *   bloqueios: string[], divergencias: string[], dataReferencia: string, mensagem?: string }}
 */
export function avaliarPeca({ dados, conclusoesParecer = [], agora = new Date() }) {
  const processo = dados?.processo_execucao || {};
  const ajuizada = execucaoAjuizada(processo);
  const bloqueios = [];
  const avisos = [];

  // ---- Data de referência: ajuizamento (execução) ou geração (revisão PGFN) ----
  let referencia;
  if (ajuizada) {
    referencia = parseDataBR(dataStr(processo.data_ajuizamento));
    if (!referencia) {
      bloqueios.push(
        preenchido(processo.data_ajuizamento)
          ? 'A data de ajuizamento da execução é inválida.'
          : 'A data de ajuizamento da execução não consta dos documentos.',
      );
    }
  } else {
    referencia = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
    avisos.push('Sem execução fiscal ajuizada: a prescrição foi aferida até a data de geração da peça.');
  }

  // ---- Cálculo por período, de todas as inscrições ----
  const prescritos = [];
  const decaidos = [];
  const naoConfigurados = [];

  for (const inscricao of dados?.inscricoes || []) {
    const cda = inscricao?.numero_cda || '';
    const eventos = Array.isArray(inscricao?.eventos_interruptivos) ? inscricao.eventos_interruptivos : [];

    for (const p of inscricao?.periodos || []) {
      const base = { cda, periodo: p?.periodo || '', modalidade: p?.modalidade_lancamento || '', tipo_declaracao: p?.tipo_declaracao || '' };

      if (p?.modalidade_lancamento === 'homologacao_declarado') {
        const calc = calcularPrescricaoOrdinaria({ vencimento: p.data_vencimento, entrega: p.data_entrega_declaracao });
        if (!calc.ok) {
          bloqueios.push(`${cda || 'CDA'} / ${base.periodo}: faltam dados para o cálculo da prescrição (${calc.motivo}).`);
          continue;
        }
        const registro = {
          ...base,
          tese: 'prescricao_ordinaria',
          termoInicial: calc.termoInicial,
          consumacao: calc.consumacao,
          regraTermo: calc.regraTermo,
          fonteEntrega: fonteStr(p.data_entrega_declaracao),
          fonteVencimento: fonteStr(p.data_vencimento),
        };
        if (referencia) registro.prescrito = referencia.getTime() > calc.consumacao.getTime();

        // Evento potencialmente interruptivo/suspensivo no prazo: BLOQUEIA. Evento
        // posterior à consumação não revive prazo já extinto (o próprio modelo
        // diz isso do protesto) — vira aviso, não bloqueio.
        for (const ev of eventos) {
          const d = parseDataBR(dataStr(ev?.data));
          const rotulo = `${ev?.tipo || 'evento'} em ${dataStr(ev?.data) || '[sem data]'}`;
          if (!d) {
            bloqueios.push(`${cda || 'CDA'}: evento "${rotulo}" com data inválida ou ausente — exige análise manual.`);
          } else if (d.getTime() >= calc.termoInicial.getTime() && d.getTime() <= calc.consumacao.getTime()) {
            bloqueios.push(
              `${cda || 'CDA'} / ${base.periodo}: ${rotulo} dentro do prazo prescricional (${formatarDataBR(calc.termoInicial)} a ${formatarDataBR(calc.consumacao)}) — pode interromper ou suspender o prazo; o caso exige análise manual.`,
            );
          } else if (d.getTime() > calc.consumacao.getTime() && referencia && d.getTime() <= referencia.getTime()) {
            avisos.push(`${cda || 'CDA'} / ${base.periodo}: ${rotulo} é posterior à consumação do prazo e, em tese, não o interrompe — conferir.`);
          }
        }

        (registro.prescrito ? prescritos : naoConfigurados).push(registro);
      } else if (p?.modalidade_lancamento === 'homologacao_nao_declarado' || p?.modalidade_lancamento === 'oficio') {
        const calc = calcularDecadencia({
          fatoGerador: p.data_fato_gerador,
          houvePagamentoAntecipado: p.houve_pagamento_antecipado,
          indicioDolo: p.indicio_dolo_fraude_simulacao,
        });
        const notificacao = parseDataBR(dataStr(p.data_notificacao_lancamento));
        if (!calc.ok || !notificacao) {
          const faltam = [];
          if (!calc.ok) faltam.push(calc.motivo);
          if (!notificacao) faltam.push(preenchido(p.data_notificacao_lancamento) ? 'data da notificação do lançamento inválida' : 'data da notificação do lançamento');
          bloqueios.push(`${cda || 'CDA'} / ${base.periodo}: faltam dados para o cálculo da decadência (${faltam.join(' e ')}).`);
          continue;
        }
        const registro = {
          ...base,
          tese: 'decadencia',
          regra: calc.regra,
          fatoGerador: parseDataBR(dataStr(p.data_fato_gerador)),
          marcoInicial: calc.marcoInicial,
          termoFinal: calc.termoFinal,
          notificacao,
          // Decadência compara com a NOTIFICAÇÃO do lançamento, não com o ajuizamento.
          decaido: notificacao.getTime() > calc.termoFinal.getTime(),
        };

        // Decadência não se interrompe. Mas parcelamento/compensação/protesto
        // antes da notificação podem indicar confissão/constituição do crédito —
        // isso bloqueia. Pagamento é o próprio fato que define a regra do
        // art. 150 §4º; aparece só como aviso.
        for (const ev of eventos) {
          const d = parseDataBR(dataStr(ev?.data));
          const tipo = String(ev?.tipo || '').toLowerCase();
          const rotulo = `${ev?.tipo || 'evento'} em ${dataStr(ev?.data) || '[sem data]'}`;
          if (!d) {
            bloqueios.push(`${cda || 'CDA'}: evento "${rotulo}" com data inválida ou ausente — exige análise manual.`);
          } else if (d.getTime() >= calc.marcoInicial.getTime() && d.getTime() <= notificacao.getTime()) {
            if (tipo === 'pagamento') avisos.push(`${cda || 'CDA'} / ${base.periodo}: ${rotulo} — conferir se coincide com o pagamento antecipado informado.`);
            else bloqueios.push(`${cda || 'CDA'} / ${base.periodo}: ${rotulo} antes da notificação do lançamento — pode configurar confissão/constituição do crédito; o caso exige análise manual.`);
          }
        }

        (registro.decaido ? decaidos : naoConfigurados).push(registro);
      } else {
        bloqueios.push(
          `${cda || 'CDA'} / ${base.periodo || 'período não identificado'}: modalidade de lançamento não identificada — exige análise manual.`,
        );
      }
    }
  }

  const resultadoBase = { creditos: [], omitidos: [], avisos, bloqueios, divergencias: [], dataReferencia: referencia ? formatarDataBR(referencia) : '' };

  if (prescritos.length === 0 && decaidos.length === 0) {
    // Parecer favorável + motor sem tese = divergência (bloqueia e mostra), não "sem tese".
    const divergenciasSemTese = ['prescricao_ordinaria', 'decadencia']
      .map((t) => divergenciaComParecer(t, false, conclusoesParecer))
      .filter(Boolean);
    return {
      ...resultadoBase,
      divergencias: divergenciasSemTese,
      status: bloqueios.length > 0 || divergenciasSemTese.length > 0 ? 'bloqueada' : 'sem_tese',
      tese: null,
      template: null,
      omitidos: naoConfigurados,
      mensagem: bloqueios.length > 0 || divergenciasSemTese.length > 0
        ? 'A peça não pode ser gerada automaticamente.'
        : 'O cálculo não identificou crédito prescrito ou decaído — não há tese para a peça.',
    };
  }

  // ---- Tese: a que abrange MAIS créditos (empate favorece a prescrição, que
  // tem modelo para os dois cenários). A outra vai para `omitidos` com aviso. ----
  const tese = decaidos.length > prescritos.length ? 'decadencia' : 'prescricao_ordinaria';
  const creditos = tese === 'decadencia' ? decaidos : prescritos;
  const outros = tese === 'decadencia' ? prescritos : decaidos;
  if (outros.length > 0) {
    avisos.push(
      `Há ${outros.length} crédito(s) com tese diferente (${tese === 'decadencia' ? 'prescrição' : 'decadência'}) que NÃO entraram na peça gerada e precisam ser incluídos manualmente.`,
    );
  }

  // ---- Coerência com o parecer salvo ----
  const divergencia = divergenciaComParecer(tese, true, conclusoesParecer);
  const divergencias = divergencia ? [divergencia] : [];
  if (naoConfigurados.length > 0) {
    avisos.push(`${naoConfigurados.length} período(s) não estão prescritos/decaídos e ficaram fora da peça.`);
  }

  const template = escolherTemplate(tese, ajuizada);
  const comum = { tese, creditos, omitidos: [...outros, ...naoConfigurados], avisos, bloqueios, divergencias, dataReferencia: resultadoBase.dataReferencia };

  if (bloqueios.length > 0 || divergencias.length > 0) {
    return { ...comum, status: 'bloqueada', template: null, mensagem: 'A peça não pode ser gerada automaticamente.' };
  }
  if (!template) {
    return { ...comum, status: 'indisponivel', template: null, mensagem: MSG_SEM_MODELO };
  }
  return { ...comum, status: 'ok', template };
}

export default { avaliarPeca, calcularPrescricaoOrdinaria, calcularDecadencia, escolherTemplate };
