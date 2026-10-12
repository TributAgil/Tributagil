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
// recorta documentos. Trecho jurídico que o advogado precisa CONFIRMAR sai
// como "[CONFIRMAR: ...]" (também amarelo).
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

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

const parseBR = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return d.getUTCDate() === +m[1] ? d : null;
};

/** Nome de arquivo seguro para o download (sem acento/pontuação). */
export function nomeArquivoPeca(template, executadoNome, agora) {
  const prefixo = {
    [TEMPLATES.EPE_PRESCRICAO]: 'EPE_Prescricao',
    [TEMPLATES.EPE_DECADENCIA]: 'EPE_Decadencia',
    [TEMPLATES.EPE_INTERCORRENTE]: 'EPE_Prescricao_Intercorrente',
    [TEMPLATES.REVISAO_PGFN_PRESCRICAO]: 'Revisao_PGFN_Prescricao',
    [TEMPLATES.REVISAO_PGFN_DECADENCIA]: 'Revisao_PGFN_Decadencia',
  }[template] || 'Peca';
  const nome = String(executadoNome || 'executado')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'executado';
  return `${prefixo}_${nome}_${agora.toISOString().slice(0, 10)}.docx`;
}

// ---------------------------------------------------------------------------
// Parte que se repete em todas as peças
// ---------------------------------------------------------------------------

/** Nome e restante da qualificação separados: o nome sai em negrito no modelo, o resto não. */
function partesQualificacao(e, papel) {
  const doc = String(e?.documento || '').replace(/\D/g, '');
  const rotuloDoc = doc.length === 14 ? 'CNPJ' : 'CPF';
  if (doc.length === 14) {
    // Pessoa jurídica: nacionalidade, estado civil e profissão não existem — qualificação própria (e sem [PREENCHER] inútil).
    return {
      nome: v(e?.nome, `nome do ${papel}`),
      resto: `pessoa jurídica de direito privado, inscrita no CNPJ sob nº ${v(e?.documento, 'CNPJ')}, com sede em ${v(e?.endereco, 'endereço da sede')}`,
    };
  }
  return {
    nome: v(e?.nome, `nome do ${papel}`),
    resto: [
      v(e?.nacionalidade, 'nacionalidade'),
      v(e?.estado_civil, 'estado civil'),
      v(e?.profissao, 'profissão'),
      `inscrito(a) no ${rotuloDoc} sob nº ${v(e?.documento, 'CPF/CNPJ')}`,
      v(e?.endereco, 'endereço completo'),
    ].join(', '),
  };
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
 * Tratamento do procurador (C.4): "sua advogada", "seu advogado", "suas advogadas" ou "seus
 * advogados", conforme o cadastro. Plural misto vai para o masculino (regra do português). A
 * concordância do verbo ("que esta subscreve/subscrevem") e do particípio ("constituída/o/as/os")
 * acompanha — o texto original só trazia o singular feminino. Gênero ausente no cadastro NÃO é
 * presumido: vira [PREENCHER].
 */
export function tratamentoProcurador(advogados) {
  const lista = (Array.isArray(advogados) ? advogados : []).filter((a) => a?.nome || a?.oab);
  const n = lista.length;
  const plural = n > 1;
  const verbo = plural ? 'subscrevem' : 'subscreve';
  const generos = lista.map((a) => String(a?.genero || '').toLowerCase());
  if (n === 0 || generos.some((g) => g !== 'f' && g !== 'm')) {
    const falta = preencher('gênero do(a) advogado(a), preencha em "Dados do escritório"');
    return { tratamento_procurador: falta, subscreve_concord: verbo, constituido_concord: falta };
  }
  const masculino = generos.includes('m');
  if (!plural) {
    return masculino
      ? { tratamento_procurador: 'seu advogado', subscreve_concord: verbo, constituido_concord: 'constituído' }
      : { tratamento_procurador: 'sua advogada', subscreve_concord: verbo, constituido_concord: 'constituída' };
  }
  return masculino
    ? { tratamento_procurador: 'seus advogados', subscreve_concord: verbo, constituido_concord: 'constituídos' }
    : { tratamento_procurador: 'suas advogadas', subscreve_concord: verbo, constituido_concord: 'constituídas' };
}

/** Órgão de cobrança por extenso (endereçamento da Revisão). Nunca presume: sem dado vira [PREENCHER]. */
function orgaoCobrancaExtenso(dados) {
  const orgao = String(dados?.orgao_cobranca || '').trim();
  const esfera = dados?.ente_credor?.esfera;
  if (esfera === 'União' || /^pgfn$/i.test(orgao)) return 'FAZENDA NACIONAL';
  if (/^pge$/i.test(orgao)) return 'PROCURADORIA-GERAL DO ESTADO';
  if (/procuradoria municipal/i.test(orgao)) return 'PROCURADORIA DO MUNICÍPIO';
  return orgao ? orgao.toUpperCase() : preencher('órgão de cobrança (PGFN, PGE ou Procuradoria Municipal)');
}

function unidadeCobranca(dados) {
  const local = String(dados?.processo_execucao?.comarca_secao || '').trim();
  const uniao = dados?.ente_credor?.esfera === 'União' || /^pgfn$/i.test(String(dados?.orgao_cobranca || ''));
  if (!local) return preencher(uniao ? 'seção da PGFN' : 'unidade do órgão de cobrança');
  return uniao ? `DA SEÇÃO DE ${local.toUpperCase()}` : `EM ${local.toUpperCase()}`;
}

const PREFIXO_LOCAL = /^\s*(?:da\s+|de\s+)?(?:subse[çc][ãa]o\s+judici[áa]ria|se[çc][ãa]o\s+judici[áa]ria|comarca)\s+(?:de\s+|do\s+|da\s+)?/i;
const VARA_COM_LOCAL = /\s*[-–,]\s*((?:da\s+)?(?:subse[çc][ãa]o|se[çc][ãa]o|comarca).*)$/i;

/**
 * Separa a VARA do LOCAL (seção/subseção/comarca). A IA às vezes devolve tudo junto em `vara`
 * ("2ª VARA FEDERAL - SUBSEÇÃO JUDICIÁRIA DE X"); sem isto o juízo sai repetido ("… DE X DA SEÇÃO JUDICIÁRIA DE X").
 * @returns {{ vara: string, local: string, tipo: 'SUBSEÇÃO JUDICIÁRIA'|'SEÇÃO JUDICIÁRIA'|'COMARCA'|null }}
 */
function separarVaraELocal(processo) {
  let vara = String(processo?.vara || '').trim();
  let local = String(processo?.comarca_secao || '').trim();
  let tipo = null;
  const junto = VARA_COM_LOCAL.exec(vara);
  if (junto) {
    vara = vara.slice(0, junto.index).trim();
    if (!local) local = junto[1];
  }
  const origem = `${local} ${junto ? junto[1] : ''}`;
  if (/subse[çc][ãa]o/i.test(origem)) tipo = 'SUBSEÇÃO JUDICIÁRIA';
  else if (/se[çc][ãa]o/i.test(origem)) tipo = 'SEÇÃO JUDICIÁRIA';
  else if (/comarca/i.test(origem)) tipo = 'COMARCA';
  local = local.replace(PREFIXO_LOCAL, '').trim();
  return { vara, local, tipo };
}

/** "SEÇÃO/SUBSEÇÃO JUDICIÁRIA DE X" (vara federal) ou "COMARCA DE X". */
function secaoOuComarca(dados) {
  const { vara, local, tipo } = separarVaraELocal(dados?.processo_execucao);
  if (!local) return preencher('seção judiciária ou comarca');
  const federal = /federal/i.test(vara) || dados?.ente_credor?.esfera === 'União';
  return `${tipo || (federal ? 'SEÇÃO JUDICIÁRIA' : 'COMARCA')} DE ${local.toUpperCase()}`;
}

const OBJETO_NAO_LOCALIZADO = {
  devedor: 'do devedor',
  bens: 'de bens penhoráveis',
  devedor_e_bens: 'do devedor e de bens penhoráveis',
};

const LETRAS = 'abcdefghij';

/**
 * @param {object} args
 * @param {object} args.dados       saída normalizada de ESQUEMA_DADOS_PECA
 * @param {object} args.avaliacao   uma peça de avaliarPecas()/avaliarPeca() com status 'ok'
 * @param {object} [args.escritorio] cadastro do escritório (ver README, tabela `escritorios`)
 * @param {Date}   [args.agora]
 * @param {boolean}[args.incluirBlocoDecretoLei]  liga/desliga o bloco Decreto 20.910/32 + Lei 9.873/99
 */
export function montarContexto({ dados, avaliacao, escritorio = {}, agora = new Date(), incluirBlocoDecretoLei = true, perfil = {} }) {
  const processo = dados?.processo_execucao || {};
  const executado = dados?.executado || {};
  const tese = avaliacao?.tese;
  const creditos = avaliacao?.creditos || [];

  const { vara, local: comarca } = separarVaraELocal(processo);
  const juizo = vara
    ? `AO JUÍZO DA ${vara}${comarca ? ` DE ${comarca}` : ''}.`.toUpperCase()
    : `AO JUÍZO DA ${preencher('vara federal de execução fiscal e comarca/seção')}.`;
  const juizoIntercorrente = vara
    ? `AO JUÍZO DA ${vara.toUpperCase()} DA ${secaoOuComarca(dados)}.`
    : `AO JUÍZO DA ${preencher('vara de execução fiscal')} DA ${secaoOuComarca(dados)}.`;

  const cidade = [escritorio?.cidade, escritorio?.uf].filter(Boolean).join('/');
  const exec = partesQualificacao(executado, 'executado');
  const dev = partesQualificacao(executado, 'devedor');
  const advogados = montarAdvogados(escritorio);

  const contexto = {
    juizo,
    juizo_intercorrente: juizoIntercorrente,
    destinatario_pgfn: `AO ILUSTRÍSSIMO SENHOR PROCURADOR-CHEFE DA FAZENDA NACIONAL DA SEÇÃO DE ${comarca ? comarca.toUpperCase() : preencher('seção da PGFN')}`,
    orgao_cobranca_extenso: orgaoCobrancaExtenso(dados),
    unidade_cobranca: unidadeCobranca(dados),
    ente_uniao: dados?.ente_credor?.esfera === 'União' || /^pgfn$/i.test(String(dados?.orgao_cobranca || '')),
    processo_numero: v(processo.numero, 'número da execução fiscal'),
    executado_nome: exec.nome,
    executado_qualif_resto: exec.resto,
    devedor_nome: dev.nome,
    devedor_qualif_resto: dev.resto,
    ...tratamentoProcurador(escritorio?.advogados),
    // nº do Doc. do mandato: o último informado pelo escritório (api/_perfil-peca.js); sem ele, fica para preencher
    doc_mandato: String(perfil?.doc_mandato || '').trim() || preencher('nº do Doc. – mandato'),
    fecho_local_data: `${cidade || preencher('cidade do escritório')}, ${dataPorExtenso(agora)}.`,
    data_geracao: formatarDataBR(new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()))),
    advogados,
    escritorio_email: escritorio?.email || '',
    escritorio_site: escritorio?.site || '',
    escritorio_endereco: escritorio?.endereco || '',
    incluir_bloco_decreto_lei: Boolean(incluirBlocoDecretoLei),
  };

  // ---- Linha do tempo (tabela de marcos em ordem cronológica) ----
  const marcos = [];
  const add = (data, evento, fonte) => data && marcos.push({ ts: data.getTime(), data: formatarDataBR(data), evento, fonte: fonte || 'não informada' });

  let figura = 0;
  const proxFig = () => ++figura;
  const protestosTodos = [];
  const eventosProtesto = (insc) =>
    (insc?.eventos_interruptivos || []).filter((e) => String(e?.tipo).toLowerCase() === 'protesto' && parseBR(e?.data));

  // ---- Prescrição ordinária ----
  if (tese === 'prescricao_ordinaria') {
    const cdasPrescricao = [];
    for (const insc of dados?.inscricoes || []) {
      const dosCredito = creditos.filter((c) => c.cda === (insc.numero_cda || ''));
      if (dosCredito.length === 0) continue;

      const periodos = dosCredito.map((c) => {
        const tipo = c.tipo_declaracao || 'declaração';
        const fonteRecibo = fonteStr((insc.periodos || []).find((p) => p.periodo === c.periodo)?.data_entrega_declaracao) || preencher('nome do arquivo do recibo');
        const fonteExtrato = c.fonteVencimento || preencher('nome do arquivo do extrato');
        const nRecibo = proxFig();
        const nExtrato = proxFig();
        add(c.termoInicial, `Termo inicial do prazo prescricional do período ${c.periodo} (${c.regraTermo === 'entrega_da_declaracao' ? `entrega da ${tipo}` : 'vencimento do tributo'})`, c.regraTermo === 'entrega_da_declaracao' ? fonteRecibo : fonteExtrato);
        add(c.consumacao, `Consumação do prazo prescricional do período ${c.periodo}`, 'cálculo (art. 174 do CTN)');
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
      // a Revisão PGFN não tem a figura do ajuizamento (não há execução): não gasta número, para a sequência não pular
      const nAju = avaliacao?.template === TEMPLATES.REVISAO_PGFN_PRESCRICAO ? null : proxFig();
      const nNeg = proxFig();
      const paf = v(insc.processo_administrativo, 'nº do processo administrativo');
      const maxConsumacao = Math.max(...dosCredito.map((c) => c.consumacao.getTime()));

      const protestos = eventosProtesto(insc).map((e) => {
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

    const ajuiz = parseBR(dataStr(processo.data_ajuizamento));
    const tributos = unicos(cdasPrescricao.map((c) => c.tributo));
    const termos = unicos(cdasPrescricao.flatMap((c) => c.periodos.map((p) => p.termo_inicial)));
    const consumacoes = unicos(cdasPrescricao.flatMap((c) => c.periodos.map((p) => p.consumacao)));
    contexto.quadro_sinoptico = [
      { tese: 'Objeto da execução', fundamento: `CDA nº ${contexto.cdas_lista}, ${listaComE(tributos)}; período(s) de apuração ${listaComE(unicos(cdasPrescricao.flatMap((c) => c.periodos.map((p) => p.periodo))))}` },
      { tese: 'Constituição definitiva do crédito', fundamento: `Entrega da declaração ou vencimento, o que for posterior (termo inicial: ${listaComE(termos)}); art. 174 do CTN; Súmula 436/STJ; Tema 265/STJ` },
      { tese: 'Ajuizamento e consequência', fundamento: `Execução ajuizada em ${ajuiz ? formatarDataBR(ajuiz) : preencher('data do ajuizamento')}, após a consumação do prazo quinquenal (${listaComE(consumacoes)}), com a prescrição do crédito tributário (arts. 156, V e 174 do CTN)` },
    ];
  }

  // ---- Decadência (EPE e Revisão PGFN) ----
  if (tese === 'decadencia') {
    const rotuloModalidade = { homologacao_nao_declarado: 'por homologação', oficio: 'de ofício' };
    const extensoOrigem = { homologacao_nao_declarado: 'lançamento por homologação', oficio: 'lançamento de ofício' };
    const avaliados = avaliacao?.avaliados || creditos;
    const mais1Cda = unicos(avaliados.map((c) => c.cda)).length > 1;
    const rotuloPer = (c) => (mais1Cda ? `${c.periodo} (CDA ${c.cda})` : c.periodo);

    const periodoDe = (c) => {
      const art = c.regra === 'art_150_par_4' ? 'Art. 150, § 4º, CTN' : 'Art. 173, I, CTN';
      return {
        cda: v(c.cda, 'nº da CDA'),
        periodo: c.periodo,
        modalidade: rotuloModalidade[c.modalidade] || preencher('modalidade de lançamento'),
        fato_gerador: formatarDataBR(c.fatoGerador),
        data_fato_gerador: formatarDataBR(c.fatoGerador),
        pagamento: c.pagamentoAntecipado === 'sim' ? 'REALIZADO' : 'NÃO REALIZADO',
        doc_comprovante: c.pagamentoAntecipado === 'sim'
          ? preencher(`comprovante/nº do Doc. – pagamento, período ${c.periodo}`)
          : c.fontePagamento || preencher(`nº do Doc. que comprova a ausência de pagamento (ex.: extrato da conta fiscal), período ${c.periodo}`),
        fonte_pagamento: c.fontePagamento || preencher(`documento do pagamento antecipado, período ${c.periodo}`),
        regra_150: c.regra === 'art_150_par_4',
        regra_150_4: c.regra === 'art_150_par_4',
        regra_173_I: c.regra === 'art_173_I',
        dolo_fraude_imputado: Boolean(c.doloImputado),
        confirmar_dolo: Boolean(c.confirmarDolo),
        artigo_marco: c.regra === 'art_150_par_4' ? 'art. 150, § 4º, do CTN' : 'art. 173, I, do CTN',
        marco_inicial: formatarDataBR(c.marcoInicial),
        termo_final: formatarDataBR(c.termoFinal),
        notificacao: formatarDataBR(c.notificacao),
        data_notificacao_lancamento: formatarDataBR(c.notificacao),
        fonte_notificacao: c.fonteNotificacao || preencher('documento da notificação do lançamento'),
        regra_aplicavel: art,
        situacao: c.decaido ? 'Decadência consumada' : 'Dentro do prazo',
        linhas: [
          { marco: 'Fato gerador', data: formatarDataBR(c.fatoGerador), fundamento: art },
          { marco: 'Marco inicial do prazo decadencial', data: formatarDataBR(c.marcoInicial), fundamento: art },
          { marco: 'Termo final do prazo decadencial', data: formatarDataBR(c.termoFinal), fundamento: 'Marco inicial + 5 anos' },
          { marco: 'Notificação do lançamento / ajuizamento da execução', data: formatarDataBR(c.notificacao), fundamento: 'Extrapolação do prazo legal — Operada a Decadência' },
        ],
      };
    };
    const decaidos = creditos.map(periodoDe);
    const todos = avaliados.map(periodoDe);

    for (const c of avaliados) {
      const art = c.regra === 'art_150_par_4' ? 'Art. 150, § 4º, CTN' : 'Art. 173, I, CTN';
      add(c.fatoGerador, `Fato gerador do período ${rotuloPer(c)}`, c.fonteFatoGerador);
      add(c.marcoInicial, `Marco inicial do prazo decadencial do período ${rotuloPer(c)} (${art})`, 'cálculo');
      add(c.termoFinal, `Termo final do prazo decadencial do período ${rotuloPer(c)}`, 'cálculo (marco inicial + 5 anos)');
      add(c.notificacao, `Notificação do lançamento do período ${rotuloPer(c)}`, c.fonteNotificacao);
    }
    const cdasProtestadasDec = [];
    for (const insc of dados?.inscricoes || []) {
      for (const e of eventosProtesto(insc)) {
        add(parseBR(e.data), `Protesto da CDA ${insc.numero_cda || ''}`.trim(), e.fonte);
        protestosTodos.push(e);
        cdasProtestadasDec.push(insc.numero_cda || '');
      }
    }
    contexto.cdas_protestadas_lista = listaComE(unicos(cdasProtestadasDec).map((n) => v(n, 'nº da CDA')));

    // EPE de decadência: um bloco por período decaído (lista plana)
    contexto.periodos_decadencia = decaidos;
    contexto.cdas_lista = listaComE(unicos(creditos.map((c) => v(c.cda, 'nº da CDA'))));
    contexto.origem_lancamento = listaComE(unicos(creditos.map((c) => `lançamento ${rotuloModalidade[c.modalidade] || ''}`.trim())));
    contexto.origem_lancamento_extenso = listaComE(unicos(creditos.map((c) => extensoOrigem[c.modalidade] || 'lançamento')));
    const tributosDec = unicos(
      (dados?.inscricoes || []).filter((i) => creditos.some((c) => c.cda === (i.numero_cda || ''))).map((i) => i.tributo),
    );
    contexto.tributo = tributosDec.length ? listaComE(tributosDec) : preencher('tributo');
    contexto.periodos_apuracao = listaComE(unicos(creditos.map((c) => rotuloPer(c))));
    contexto.periodos_lista = contexto.periodos_apuracao;
    contexto.periodos_decaidos_lista = listaComE(unicos(creditos.map((c) => rotuloPer(c))));

    // Revisão PGFN de decadência: um bloco por CDA, com os períodos decaídos dentro
    let nFig = 0;
    contexto.cdas = unicos(creditos.map((c) => c.cda)).map((numero) => {
      const dosCredito = creditos.filter((c) => c.cda === numero);
      const doAvaliado = avaliados.filter((c) => c.cda === numero);
      const periodos = dosCredito.map(periodoDe);
      return {
        numero: v(numero, 'nº da CDA'),
        origem: listaComE(unicos(dosCredito.map((c) => extensoOrigem[c.modalidade] || 'lançamento'))),
        periodos_lista: listaComE(unicos(doAvaliado.map((c) => c.periodo))),
        periodos_decaidos: periodos,
        algum_150: periodos.some((p) => p.regra_150_4),
        algum_150_confirmado: periodos.some((p) => p.regra_150_4) && !periodos.some((p) => p.regra_150_4 && p.confirmar_dolo),
        algum_150_confirmar: periodos.some((p) => p.regra_150_4 && p.confirmar_dolo),
      };
    });
    contexto.algum_periodo_regra_150_4 = todos.some((p) => p.regra_150_4);
    contexto.periodos_tabela = todos.map((p, i) => ({ ...p, periodo: rotuloPer(avaliados[i]) }));
    contexto.decadencia_total = Boolean(avaliacao?.decadenciaTotal);
    contexto.decadencia_parcial = Boolean(avaliacao?.decadenciaParcial);
    const fontesNot = unicos(avaliados.map((c) => c.fonteNotificacao));
    const fonteNot = fontesNot.length ? listaComE(fontesNot) : preencher('documento da notificação do lançamento');
    contexto.fonte_notificacao = fonteNot;
    nFig = proxFig();
    contexto.fig_notificacao = `[INSERIR FIGURA ${nFig} – excerto do auto de infração / notificação de lançamento com a data de ciência, fonte: ${fonteNot}]`;
    contexto.fig_notificacao_legenda = `Figura ${nFig} - Excerto da notificação do lançamento`;
    contexto.houve_protesto = protestosTodos.length > 0;
    contexto.tem_protesto = protestosTodos.length > 0;

    // Letras dos pedidos: a) e b) fixos; c) protesto, d) CADIN (só União) e e) certidão entram em sequência
    let prox = 2;
    contexto.letra_protesto = protestosTodos.length > 0 ? LETRAS[prox++] : '';
    contexto.letra_cadin = contexto.ente_uniao ? LETRAS[prox++] : '';
    contexto.letra_certidao = LETRAS[prox];
  }

  // ---- Prescrição intercorrente (EPE) ----
  if (tese === 'prescricao_intercorrente') {
    const ic = avaliacao?.intercorrente || {};
    const cdas = ic.cdasCobertas || [];
    const nomeCdas = cdas.length ? cdas : (dados?.inscricoes || []).map((i) => i.numero_cda).filter(Boolean);
    const protestadas = (dados?.inscricoes || []).filter((i) => nomeCdas.includes(i.numero_cda) && eventosProtesto(i).length > 0);

    contexto.cdas_lista = nomeCdas.length ? listaComE(nomeCdas) : preencher('nº da(s) CDA(s)');
    contexto.exequente = v(processo.exequente, 'exequente por extenso (ex.: União (Fazenda Nacional))');
    contexto.data_ajuizamento = v(dataStr(processo.data_ajuizamento), 'data do ajuizamento da execução');
    contexto.data_intimacao = ic.dataIntimacao || '';
    contexto.fonte_intimacao = ic.fonteIntimacao || preencher('documento da ciência da Fazenda');
    contexto.data_fim_suspensao = ic.dataFimSuspensao || '';
    contexto.data_prazo_final = ic.dataPrazoFinal || '';
    contexto.objeto_nao_localizado =
      OBJETO_NAO_LOCALIZADO[ic.objetoNaoLocalizado] || preencher('o que não foi localizado (devedor, bens penhoráveis ou ambos)');
    contexto.data_hoje = contexto.data_geracao;
    contexto.ciclos_interrompidos = (ic.ciclosInterrompidos || []).map((c) => ({
      data_intimacao_ciclo: c.dataIntimacao,
      data_interrupcao: c.dataInterrupcao,
      evento_interrupcao_extenso: c.eventoExtenso,
    }));
    contexto.ha_ciclos_interrompidos = contexto.ciclos_interrompidos.length > 0;
    contexto.houve_protesto = protestadas.length > 0;
    contexto.cdas_protestadas_lista = listaComE(protestadas.map((i) => i.numero_cda));
    const nFigInt = proxFig();
    contexto.fig_intimacao = `[INSERIR FIGURA ${nFigInt} – excerto da intimação/ciência da Fazenda sobre a não localização, fonte: ${contexto.fonte_intimacao}]`;
    contexto.fig_intimacao_legenda = `Figura ${nFigInt} - Excerto da ciência da Fazenda sobre a não localização`;

    // Linha do tempo: ajuizamento, citação, cada ciência de não localização, fim da suspensão, consumação
    for (const e of dados?.eventos_execucao || []) {
      if (e.categoria === 'intimacao_nao_localizacao_bens') add(parseBR(e.data), 'Ciência da Fazenda sobre a não localização', e.fonte);
      else if (e.categoria === 'citacao') add(parseBR(e.data), 'Citação do executado', e.fonte);
      else if (e.categoria === 'penhora_constricao') add(parseBR(e.data), 'Constrição patrimonial efetiva', e.fonte);
      else if (e.categoria === 'requerimento_constricao') add(parseBR(e.data), 'Requerimento de constrição patrimonial', e.fonte);
    }
    add(parseBR(ic.dataFimSuspensao), 'Fim da suspensão de 1 ano e início do prazo prescricional', 'cálculo (art. 40, § 2º, LEF)');
    add(parseBR(ic.dataPrazoFinal), 'Consumação da prescrição intercorrente', 'cálculo (art. 40, § 4º, LEF; art. 174 do CTN)');
    for (const insc of protestadas) {
      for (const e of eventosProtesto(insc)) add(parseBR(e.data), `Protesto da CDA ${insc.numero_cda}`, e.fonte);
    }

    // Letras: a), b), c) fixos; d) protesto (se houver); depois a liberação de restrições
    contexto.letra_protesto = protestadas.length > 0 ? 'd' : '';
    contexto.letra_liberacao = protestadas.length > 0 ? 'e' : 'd';
  }

  // ---- Ajuizamento / citação na linha do tempo (comum) ----
  const ajuiz = parseBR(dataStr(processo.data_ajuizamento));
  add(ajuiz, 'Ajuizamento da execução fiscal', fonteStr(processo.data_ajuizamento));
  if (tese !== 'prescricao_intercorrente') {
    add(parseBR(dataStr(processo.data_despacho_citatorio)), 'Despacho que ordena a citação', fonteStr(processo.data_despacho_citatorio));
    add(parseBR(dataStr(processo.data_citacao)), 'Citação do executado', fonteStr(processo.data_citacao));
  }

  contexto.linha_do_tempo = marcos
    .sort((a, b) => a.ts - b.ts)
    .map(({ data, evento, fonte }) => ({ data, evento, fonte: fonte || preencher('documento-fonte') }));

  return contexto;
}
