// api/_contexto-peca.js
//
// Monta o CONTEXTO que os templates .docx consomem (api/_render-peca.js).
// Puro: sem I/O, sem relógio implícito. Toda decisão de "o que vai escrito na
// peça" que depende de dado acontece AQUI e no motor (api/_motor-peca.js) —
// os templates só têm INS / IF / FOR simples. Isso mantém o texto jurídico
// no Word (editável pela advogada) e a lógica em código (testável).
//
// Convenção de dado ausente: tudo o que não veio dos documentos nem do
// cadastro vira "[PREENCHER: <o que falta>]" — nunca um valor presumido. O
// renderizador destaca esses trechos em amarelo no Word. Figuras viram
// "[INSERIR FIGURA n – ...]" (também destacadas): nesta versão o sistema não
// recorta documentos.

import { formatarDataBR, TEMPLATES } from './_motor-peca.js';

export const preencher = (rotulo) => `[PREENCHER: ${rotulo}]`;
const v = (valor, rotulo) => (String(valor ?? '').trim() ? String(valor).trim() : preencher(rotulo));

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function dataPorExtenso(data) {
  return `${data.getUTCDate()} de ${MESES[data.getUTCMonth()]} de ${data.getUTCFullYear()}`;
}

const dataStr = (x) => (typeof x === 'string' ? x : typeof x?.data === 'string' ? x.data : '');
const fonteStr = (x) => (x && typeof x === 'object' && typeof x.fonte === 'string' ? x.fonte : '');
const unicos = (lista) => [...new Set(lista.filter(Boolean))];

function listaComE(itens) {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/** Nome de arquivo seguro para o download (sem acento/pontuação). */
export function nomeArquivoPeca(template, executadoNome, agora) {
  const prefixo = {
    [TEMPLATES.EPE_PRESCRICAO]: 'EPE_Prescricao',
    [TEMPLATES.EPE_DECADENCIA]: 'EPE_Decadencia',
    [TEMPLATES.REVISAO_PGFN_PRESCRICAO]: 'Revisao_PGFN_Prescricao',
  }[template] || 'Peca';
  const nome = String(executadoNome || 'executado')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'executado';
  return `${prefixo}_${nome}_${agora.toISOString().slice(0, 10)}.docx`;
}

/** Conta quantos [PREENCHER: ...] o documento terá (para o resumo antes de gerar). */
export function contarPreencher(contexto) {
  return (JSON.stringify(contexto).match(/\[PREENCHER:/g) || []).length;
}

function qualificacaoExecutado(e, papel = 'executado') {
  const doc = String(e?.documento || '').replace(/\D/g, '');
  const rotuloDoc = doc.length === 14 ? 'CNPJ' : 'CPF';
  return [
    v(e?.nome, `nome do ${papel}`),
    v(e?.nacionalidade, 'nacionalidade'),
    v(e?.estado_civil, 'estado civil'),
    v(e?.profissao, 'profissão'),
    `inscrito(a) no ${rotuloDoc} sob nº ${v(e?.documento, 'CPF/CNPJ')}`,
    v(e?.endereco, 'endereço completo'),
  ].join(', ');
}

function montarAdvogados(escritorio) {
  const lista = Array.isArray(escritorio?.advogados) ? escritorio.advogados.filter((a) => a?.nome || a?.oab) : [];
  if (lista.length === 0) return [{ nome: preencher('nome do(a) advogado(a)'), oab: preencher('OAB/UF') }];
  return lista.map((a) => ({
    nome: v(a.nome, 'nome do(a) advogado(a)'),
    oab: a.oab ? `OAB ${a.uf ? `${a.uf} ` : ''}${a.oab}`.trim() : preencher('OAB/UF'),
  }));
}

/**
 * @param {object} args
 * @param {object} args.dados       saída de ESQUEMA_DADOS_PECA
 * @param {object} args.avaliacao   saída de avaliarPeca() com status 'ok'
 * @param {object} [args.escritorio] cadastro do escritório (ver README, tabela `escritorios`)
 * @param {Date}   [args.agora]
 * @param {boolean}[args.incluirBlocoDecretoLei]  liga/desliga o bloco Decreto 20.910/32 + Lei 9.873/99
 */
export function montarContexto({ dados, avaliacao, escritorio = {}, agora = new Date(), incluirBlocoDecretoLei = true }) {
  const processo = dados?.processo_execucao || {};
  const executado = dados?.executado || {};
  const creditos = avaliacao?.creditos || [];
  const ehDecadencia = avaliacao?.tese === 'decadencia';

  // ---- Comum a todas as peças ----
  const comarca = String(processo.comarca_secao || '').trim();
  const vara = String(processo.vara || '').trim();
  const juizo = vara
    ? `AO JUÍZO DA ${vara}${comarca ? ` DE ${comarca}` : ''}.`.toUpperCase()
    : `AO JUÍZO DA ${preencher('vara federal de execução fiscal e comarca/seção')}.`;

  const cidade = [escritorio?.cidade, escritorio?.uf].filter(Boolean).join('/');
  const contexto = {
    juizo,
    destinatario_pgfn: `AO ILUSTRÍSSIMO SENHOR PROCURADOR-CHEFE DA FAZENDA NACIONAL DA SEÇÃO DE ${comarca ? comarca.toUpperCase() : preencher('seção da PGFN')}`,
    processo_numero: v(processo.numero, 'número da execução fiscal'),
    executado_nome: v(executado.nome, 'nome do executado'),
    executado_qualificacao: qualificacaoExecutado(executado, 'executado'),
    devedor_nome: v(executado.nome, 'nome do devedor'),
    devedor_qualificacao: qualificacaoExecutado(executado, 'devedor'),
    doc_mandato: preencher('nº do Doc. – mandato'),
    fecho_local_data: `${cidade || preencher('cidade do escritório')}, ${dataPorExtenso(agora)}.`,
    data_geracao: formatarDataBR(new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()))),
    advogados: montarAdvogados(escritorio),
    escritorio_email: escritorio?.email || '',
    escritorio_site: escritorio?.site || '',
    escritorio_endereco: escritorio?.endereco || '',
    incluir_bloco_decreto_lei: Boolean(incluirBlocoDecretoLei),
  };

  // ---- Linha do tempo (tabela de marcos em ordem cronológica) ----
  const marcos = [];
  const add = (data, evento, fonte) => data && marcos.push({ ts: data.getTime(), data: formatarDataBR(data), evento, fonte: fonte || '—' });
  const parseBR = (s) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim());
    if (!m) return null;
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return d.getUTCDate() === +m[1] ? d : null;
  };

  // ---- Prescrição ordinária ----
  let figura = 0;
  const proxFig = () => ++figura;
  const cdasPrescricao = [];
  const protestosTodos = [];

  if (!ehDecadencia) {
    for (const insc of dados?.inscricoes || []) {
      const dosCredito = creditos.filter((c) => c.cda === (insc.numero_cda || ''));
      if (dosCredito.length === 0) continue;

      const periodos = dosCredito.map((c) => {
        const tipo = c.tipo_declaracao || 'declaração';
        const fonteRecibo = fonteStr((insc.periodos || []).find((p) => p.periodo === c.periodo)?.data_entrega_declaracao) || preencher('nome do arquivo do recibo');
        const fonteExtrato = c.fonteVencimento || preencher('nome do arquivo do extrato');
        const nRecibo = proxFig();
        const nExtrato = proxFig();
        add(c.termoInicial, `Termo inicial do prazo prescricional — período ${c.periodo} (${c.regraTermo === 'entrega_da_declaracao' ? `entrega da ${tipo}` : 'vencimento do tributo'})`, c.regraTermo === 'entrega_da_declaracao' ? fonteRecibo : fonteExtrato);
        add(c.consumacao, `Consumação do prazo prescricional — período ${c.periodo}`, 'cálculo (art. 174 do CTN)');
        return {
          periodo: c.periodo,
          tipo,
          entrega: formatarDataBR(c.entrega),
          vencimento: formatarDataBR(c.vencimento),
          termo_inicial: formatarDataBR(c.termoInicial),
          consumacao: formatarDataBR(c.consumacao),
          entrega_posterior: c.regraTermo === 'entrega_da_declaracao',
          doc_recibo: preencher(`nº do Doc. – recibo da ${tipo} ${c.periodo}`),
          doc_extrato: preencher(`nº do Doc. – extrato do débito, período ${c.periodo}`),
          fig_recibo: `[INSERIR FIGURA ${nRecibo} – excerto do recibo de entrega da ${tipo} (período ${c.periodo}), fonte: ${fonteRecibo}]`,
          fig_recibo_legenda: `Figura ${nRecibo} - Excerto do recibo de entrega da ${tipo} ${c.periodo}`,
          fig_extrato: `[INSERIR FIGURA ${nExtrato} – excerto do extrato da CDA (data de vencimento, período ${c.periodo}), fonte: ${fonteExtrato}]`,
          fig_extrato_legenda: `Figura ${nExtrato} - Excerto do extrato da CDA`,
        };
      });

      const nPaf = proxFig();
      const nAju = proxFig();
      const nNeg = proxFig();
      const paf = v(insc.processo_administrativo, 'nº do processo administrativo');
      const eventos = Array.isArray(insc.eventos_interruptivos) ? insc.eventos_interruptivos : [];
      const maxConsumacao = Math.max(...dosCredito.map((c) => c.consumacao.getTime()));

      const protestos = eventos
        .filter((e) => String(e?.tipo).toLowerCase() === 'protesto' && parseBR(e?.data))
        .map((e) => {
          const d = parseBR(e.data);
          const anteriores = dosCredito.filter((c) => c.consumacao.getTime() < d.getTime());
          add(d, `Protesto da CDA ${insc.numero_cda || ''}`.trim(), e.fonte);
          const alvo = anteriores.length ? anteriores.reduce((a, b) => (a.consumacao > b.consumacao ? a : b)) : null;
          return { data: formatarDataBR(d), consumacao_anterior: alvo ? formatarDataBR(alvo.consumacao) : formatarDataBR(new Date(maxConsumacao)) };
        });
      protestosTodos.push(...protestos);

      cdasPrescricao.push({
        numero: v(insc.numero_cda, 'nº da CDA'),
        tributo: v(insc.tributo, 'tributo'),
        tributo_declaracao: `${v(insc.tributo, 'tributo')}${unicos(periodos.map((p) => p.tipo)).length ? ` - ${listaComE(unicos(periodos.map((p) => p.tipo)))}` : ''}`,
        periodos,
        periodos_texto: listaComE(periodos.map((p) => p.periodo)),
        n_periodos_texto: periodos.length === 1 ? 'um período de apuração, qual seja' : `${periodos.length === 2 ? 'dois' : periodos.length} períodos de apuração, quais sejam`,
        paf,
        fig_paf: `[INSERIR FIGURA ${nPaf} – excerto do processo administrativo ${paf}, fonte: ${preencher('nome do arquivo do PAF')}]`,
        fig_paf_legenda: `Figura ${nPaf} - Excerto do PAF ${paf} (documento anexo)`,
        fig_ajuizamento: `[INSERIR FIGURA ${nAju} – excerto da petição inicial da execução (data do ajuizamento), fonte: ${preencher('nome do arquivo da petição inicial')}]`,
        fig_ajuizamento_legenda: `Figura ${nAju} - Excerto da petição inicial da execução fiscal`,
        fig_negociacoes: `[INSERIR FIGURA ${nNeg} – excerto do extrato de débito (campo de negociações sem eventos), fonte: ${preencher('nome do arquivo do extrato')}]`,
        fig_negociacoes_legenda: `Figura ${nNeg} - Excerto do extrato da CDA`,
        tabela_termo_inicial: periodos.map((p) => ({ periodo: p.periodo, termo_inicial: p.termo_inicial })),
        tabela_consumacao: periodos.map((p) => ({ termo_inicial: p.termo_inicial, consumacao: p.consumacao })),
        marcos_citados: periodos.map((p) => `${p.termo_inicial} e ${p.consumacao}`).join('; '),
        protestos,
      });
    }
    contexto.cdas = cdasPrescricao;
    contexto.tipo_declaracao_principal = cdasPrescricao[0]?.periodos[0]?.tipo || 'declaração';
    contexto.tem_protesto = protestosTodos.length > 0;
    contexto.cdas_lista = listaComE(cdasPrescricao.map((c) => c.numero));
    contexto.data_despacho_citatorio = v(dataStr(processo.data_despacho_citatorio), 'data do despacho citatório');
  }

  // ---- Decadência ----
  if (ehDecadencia) {
    const rotuloModalidade = { homologacao_nao_declarado: 'por homologação', oficio: 'de ofício' };
    const periodosDec = creditos.map((c) => {
      const art = c.regra === 'art_150_par_4' ? 'Art. 150, § 4º, CTN' : 'Art. 173, I, CTN';
      add(c.fatoGerador, `Fato gerador — período ${c.periodo}`, c.fonteFatoGerador);
      add(c.marcoInicial, `Marco inicial do prazo decadencial — período ${c.periodo} (${art})`, 'cálculo');
      add(c.termoFinal, `Termo final do prazo decadencial — período ${c.periodo}`, 'cálculo (marco inicial + 5 anos)');
      add(c.notificacao, `Notificação do lançamento — período ${c.periodo}`, c.fonteNotificacao);
      return {
        cda: v(c.cda, 'nº da CDA'),
        periodo: c.periodo,
        modalidade: rotuloModalidade[c.modalidade] || preencher('modalidade de lançamento'),
        fato_gerador: formatarDataBR(c.fatoGerador),
        pagamento: c.pagamentoAntecipado === 'sim' ? 'REALIZADO' : 'NÃO REALIZADO',
        doc_comprovante: preencher(`comprovante/nº do Doc. – pagamento, período ${c.periodo}`),
        regra_150: c.regra === 'art_150_par_4',
        artigo_marco: c.regra === 'art_150_par_4' ? 'art. 150, § 4º, do CTN' : 'art. 173, I, do CTN',
        marco_inicial: formatarDataBR(c.marcoInicial),
        termo_final: formatarDataBR(c.termoFinal),
        notificacao: formatarDataBR(c.notificacao),
        linhas: [
          { marco: 'Fato gerador', data: formatarDataBR(c.fatoGerador), fundamento: art },
          { marco: 'Marco inicial do prazo decadencial', data: formatarDataBR(c.marcoInicial), fundamento: art },
          { marco: 'Termo final do prazo decadencial', data: formatarDataBR(c.termoFinal), fundamento: 'Marco inicial + 5 anos' },
          { marco: 'Notificação do lançamento / ajuizamento da execução', data: formatarDataBR(c.notificacao), fundamento: 'Extrapolação do prazo legal — Operada a Decadência' },
        ],
      };
    });
    contexto.periodos_decadencia = periodosDec;
    const insc = dados?.inscricoes || [];
    contexto.cdas_lista = listaComE(unicos(periodosDec.map((p) => p.cda)));
    contexto.origem_lancamento = listaComE(unicos(periodosDec.map((p) => `lançamento ${p.modalidade}`)));
    contexto.tributo = listaComE(unicos(insc.filter((i) => periodosDec.some((p) => p.cda === (i.numero_cda || p.cda))).map((i) => i.tributo))) || preencher('tributo');
    contexto.periodos_apuracao = listaComE(unicos(periodosDec.map((p) => p.periodo)));
  }

  // ---- Ajuizamento / citação na linha do tempo ----
  const ajuiz = parseBR(dataStr(processo.data_ajuizamento));
  add(ajuiz, 'Ajuizamento da execução fiscal', fonteStr(processo.data_ajuizamento));
  add(parseBR(dataStr(processo.data_despacho_citatorio)), 'Despacho que ordena a citação', fonteStr(processo.data_despacho_citatorio));
  add(parseBR(dataStr(processo.data_citacao)), 'Citação do executado', fonteStr(processo.data_citacao));

  contexto.linha_do_tempo = marcos
    .sort((a, b) => a.ts - b.ts)
    .map(({ data, evento, fonte }) => ({ data, evento, fonte: fonte || preencher('documento-fonte') }));

  // ---- Quadro sinóptico (tabela Tese | Fundamento) — usado na EPE de prescrição ----
  if (!ehDecadencia) {
    const tributos = unicos(cdasPrescricao.map((c) => c.tributo));
    const termos = unicos(cdasPrescricao.flatMap((c) => c.periodos.map((p) => p.termo_inicial)));
    const consumacoes = unicos(cdasPrescricao.flatMap((c) => c.periodos.map((p) => p.consumacao)));
    contexto.quadro_sinoptico = [
      { tese: 'Objeto da execução', fundamento: `CDA nº ${contexto.cdas_lista} — ${listaComE(tributos)}; período(s) de apuração: ${listaComE(unicos(cdasPrescricao.flatMap((c) => c.periodos.map((p) => p.periodo))))}` },
      { tese: 'Constituição definitiva do crédito', fundamento: `Entrega da declaração ou vencimento, o que for posterior (termo inicial: ${listaComE(termos)}) — art. 174 do CTN; Súmula 436/STJ; Tema 265/STJ` },
      { tese: 'Ajuizamento e consequência', fundamento: `Execução ajuizada em ${ajuiz ? formatarDataBR(ajuiz) : preencher('data do ajuizamento')}, após a consumação do prazo quinquenal (${listaComE(consumacoes)}) — prescrição do crédito tributário (arts. 156, V e 174 do CTN)` },
    ];
  }

  return contexto;
}
