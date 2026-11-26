// src/lib/carteiraModelo.js
//
// Lógica PURA da carteira de casos (sem Supabase, para testar em Node): junta as análises (uma linha por CASO, a
// versão mais nova), a fase e os marcos de prazo gravados pelo servidor (docs/sql/carteira.sql), e decide a situação
// de cada caso e a ordem da lista (o mais urgente primeiro).

export const FASES = [
  { id: 'analisado', rotulo: 'Analisado' },
  { id: 'peca_gerada', rotulo: 'Peça gerada' },
  { id: 'protocolado', rotulo: 'Protocolado' },
  { id: 'decidido', rotulo: 'Decidido' },
  { id: 'arquivado', rotulo: 'Arquivado' },
];

export const NOME_TESE = {
  prescricao_ordinaria: 'Prescrição ordinária',
  decadencia: 'Decadência',
  prescricao_intercorrente: 'Prescrição intercorrente',
};

// situação do caso, da mais urgente para a menos
export const SITUACOES = {
  consumou_agora: { ordem: 0, rotulo: 'Prazo consumado: conferir e gerar a peça' },
  pronto: { ordem: 1, rotulo: 'Tese pronta para a peça' },
  acompanhando: { ordem: 2, rotulo: 'Em acompanhamento' },
  revisar: { ordem: 3, rotulo: 'Cálculo pede revisão' },
  tramitando: { ordem: 4, rotulo: 'Peça gerada ou protocolada' },
  sem_calculo: { ordem: 5, rotulo: 'Prazos ainda não calculados' },
  nada: { ordem: 6, rotulo: 'Nada a acompanhar' },
  encerrado: { ordem: 7, rotulo: 'Encerrado' },
};

const MS_DIA = 24 * 60 * 60 * 1000;

/** "AAAA-MM-DD" -> Date (UTC). */
export function dataDoBanco(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

export const formatarData = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/** O dia de hoje em Brasília, à meia-noite UTC (mesma base das datas do banco). */
export function hojeEmBrasilia(agora = new Date()) {
  const [a, m, d] = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

/**
 * Situação de UM marco hoje. 'acompanhar' com data já passada é o que o alerta avisa: consumou, se nada interrompeu.
 * @returns {{ estado: 'consumado'|'consumou_agora'|'futuro', dias: number }}
 */
export function estadoDoMarco(marco, hoje) {
  const data = dataDoBanco(marco.data);
  const dias = data ? Math.round((data.getTime() - hoje.getTime()) / MS_DIA) : 0;
  if (marco.tipo === 'consumado') return { estado: 'consumado', dias };
  return dias < 0 ? { estado: 'consumou_agora', dias } : { estado: 'futuro', dias };
}

/**
 * @param {{ analises: object[], carteira: object[], marcos: object[], hoje?: Date }} args
 *   `analises`: src/lib/analises.js listarAnalises (todas as versões); `carteira`: linhas de carteira_casos;
 *   `marcos`: linhas de marcos_prazo
 * @returns {object[]} um item por caso, já ordenado
 */
export function montarCarteira({ analises = [], carteira = [], marcos = [], hoje = hojeEmBrasilia() }) {
  // uma linha por caso: a versão mais nova (análise sem caso vira uma linha sozinha)
  const porCaso = new Map();
  for (const a of analises) {
    const chave = a.caso_id || `analise:${a.id}`;
    const atual = porCaso.get(chave);
    if (!atual || (a.versao || 1) > (atual.versao || 1) || ((a.versao || 1) === (atual.versao || 1) && a.created_at > atual.created_at)) {
      porCaso.set(chave, a);
    }
  }
  const carteiraPorCaso = new Map(carteira.map((c) => [c.caso_id, c]));
  const marcosPorCaso = new Map();
  for (const m of marcos) {
    if (!marcosPorCaso.has(m.caso_id)) marcosPorCaso.set(m.caso_id, []);
    marcosPorCaso.get(m.caso_id).push(m);
  }

  const itens = [...porCaso.values()].map((analise) => {
    const c = analise.caso_id ? carteiraPorCaso.get(analise.caso_id) : null;
    const fase = c?.fase || 'analisado';
    const calculado = Boolean(c?.calculado_em);
    const desatualizado = calculado && c.analise_id && c.analise_id !== analise.id;
    const lista = (marcosPorCaso.get(analise.caso_id) || [])
      .map((m) => ({ ...m, ...estadoDoMarco(m, hoje) }))
      .sort((x, y) => String(x.data).localeCompare(String(y.data)));
    const revisar = (c?.teses || []).filter((t) => t.status === 'bloqueada');
    const proximo = lista.find((m) => m.estado === 'futuro') || null;

    let situacao;
    if (fase === 'decidido' || fase === 'arquivado') situacao = 'encerrado';
    else if (!calculado) situacao = 'sem_calculo';
    else if (lista.some((m) => m.estado === 'consumou_agora')) situacao = 'consumou_agora';
    else if (lista.some((m) => m.estado === 'consumado') && fase === 'analisado') situacao = 'pronto';
    else if (proximo) situacao = 'acompanhando';
    else if (revisar.length) situacao = 'revisar';
    else if (fase === 'peca_gerada' || fase === 'protocolado') situacao = 'tramitando';
    else situacao = 'nada';

    return { analise, casoId: analise.caso_id, fase, calculado, desatualizado, calculadoEm: c?.calculado_em || null, marcos: lista, revisar, proximo, situacao };
  });

  return itens.sort(
    (x, y) =>
      SITUACOES[x.situacao].ordem - SITUACOES[y.situacao].ordem ||
      (x.proximo && y.proximo ? x.proximo.dias - y.proximo.dias : 0) ||
      String(y.analise.created_at || '').localeCompare(String(x.analise.created_at || '')),
  );
}

/** Contagem por situação, para os filtros da tela. */
export function contarSituacoes(itens) {
  const n = Object.fromEntries(Object.keys(SITUACOES).map((k) => [k, 0]));
  for (const i of itens) n[i.situacao] += 1;
  return n;
}

// ---- Filtros --------------------------------------------------------------------------------------------------------
// Situação: 'ativos' (tudo menos encerrado), 'encerrado' ou uma situação de SITUACOES. Fase e tese: 'todas' ou um id.
// Busca: no título do caso e nas CDAs. Dia: 'AAAA-MM-DD' (só os casos com prazo nesse dia, vindo do calendário).
export const FILTROS_PADRAO = { situacao: 'ativos', fase: 'todas', tese: 'todas', busca: '', dia: null };

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarCarteira(itens, filtros = FILTROS_PADRAO) {
  const f = { ...FILTROS_PADRAO, ...filtros };
  const termo = semAcento(f.busca).trim();
  return itens.filter((i) => {
    if (f.situacao === 'ativos' ? i.situacao === 'encerrado' : i.situacao !== f.situacao) return false;
    if (f.fase !== 'todas' && i.fase !== f.fase) return false;
    if (f.tese !== 'todas' && !i.marcos.some((m) => m.tese === f.tese)) return false;
    if (f.dia && !i.marcos.some((m) => String(m.data).slice(0, 10) === f.dia && m.estado !== 'consumado')) return false;
    if (termo) {
      const onde = semAcento([i.analise?.titulo, ...i.marcos.map((m) => m.cda)].join(' '));
      if (!onde.includes(termo)) return false;
    }
    return true;
  });
}

/** Quantos filtros além do padrão estão ligados (para o botão "Limpar"). */
export const filtrosAtivos = (filtros) =>
  Object.entries(FILTROS_PADRAO).filter(([k, v]) => (filtros?.[k] ?? v) !== v).length;

// ---- Calendário de prazos (os avisos ficam dentro da plataforma) ---------------------------------------------------------
/**
 * Os prazos que vão para o calendário: os "acompanhar" (consumam numa data; os que já passaram são o aviso
 * "consumou agora"). Os "consumado" de origem já eram passado quando o motor calculou e não entram. Casos encerrados
 * (decididos ou arquivados) também não.
 * @returns {Array<{ data: string, estado: 'futuro'|'consumou_agora', dias: number, tese: string, cda: string,
 *   periodo: string, condicao: string, titulo: string, item: object }>} em ordem de data
 */
export function eventosDoCalendario(itens) {
  const ev = [];
  for (const i of itens) {
    if (i.situacao === 'encerrado') continue;
    for (const m of i.marcos) {
      if (m.estado === 'consumado') continue;
      ev.push({ data: String(m.data).slice(0, 10), estado: m.estado, dias: m.dias, tese: m.tese, cda: m.cda || '', periodo: m.periodo || '', condicao: m.condicao || '', titulo: i.analise?.titulo || 'Caso', item: i });
    }
  }
  return ev.sort((a, b) => a.data.localeCompare(b.data));
}

/** Avisos para o painel e para o topo da carteira: consumados agora e prazos nos próximos `janela` dias. */
export function avisosDaCarteira(itens, janela = 30) {
  const ev = eventosDoCalendario(itens);
  return {
    consumouAgora: ev.filter((e) => e.estado === 'consumou_agora').length,
    proximos: ev.filter((e) => e.estado === 'futuro' && e.dias <= janela).length,
    janela,
  };
}

const pad = (n) => String(n).padStart(2, '0');
export const isoDoDia = (ano, mes, dia) => `${ano}-${pad(mes + 1)}-${pad(dia)}`;

/**
 * Semanas do mês (domingo a sábado) para a grade do calendário. `mes` de 0 a 11. Dias de fora do mês vêm null.
 * @returns {Array<Array<string|null>>} datas 'AAAA-MM-DD'
 */
export function semanasDoMes(ano, mes) {
  const primeiro = new Date(Date.UTC(ano, mes, 1)).getUTCDay();
  const total = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const celulas = [...Array(primeiro).fill(null), ...Array.from({ length: total }, (_, k) => isoDoDia(ano, mes, k + 1))];
  while (celulas.length % 7) celulas.push(null);
  const semanas = [];
  for (let k = 0; k < celulas.length; k += 7) semanas.push(celulas.slice(k, k + 7));
  return semanas;
}

/** Eventos agrupados por dia ('AAAA-MM-DD' -> eventos). */
export function eventosPorDia(eventos) {
  const mapa = new Map();
  for (const e of eventos) {
    if (!mapa.has(e.data)) mapa.set(e.data, []);
    mapa.get(e.data).push(e);
  }
  return mapa;
}
