// src/pages/Carteira.jsx
//
// "Carteira de casos": uma linha por caso (a versão mais nova da análise), com a fase em que ele está e os marcos de
// prazo calculados pelo motor (src/lib/carteiraModelo.js). Os avisos ficam DENTRO da plataforma (nada de e-mail): o
// calendário de prazos no topo mostra o que consuma em cada dia e o que já consumou e pede atenção; os filtros
// combinam situação, fase, tese, busca e o dia escolhido no calendário. Caso sem prazos calculados tem o botão
// "Calcular prazos" (lê os documentos de novo; não gera peça nem gasta crédito de análise).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Clock, CalendarClock, Calculator, ArrowUpRight, Info,
  ChevronLeft, ChevronRight, Search, X, SlidersHorizontal,
} from 'lucide-react';
import Logo from '../components/Logo';
import RodapeLegal from '../components/RodapeLegal';
import { carregarCarteira, calcularPrazos, definirFase } from '../lib/carteira';
import {
  FASES, NOME_TESE, SITUACOES, contarSituacoes, formatarData, hojeEmBrasilia, filtrarCarteira, filtrosAtivos, FILTROS_PADRAO,
  eventosDoCalendario, eventosPorDia, avisosDaCarteira, semanasDoMes,
} from '../lib/carteiraModelo';

const COR_SITUACAO = {
  consumou_agora: 'border-red-400/60 bg-red-500/10 text-red-300',
  pronto: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300',
  acompanhando: 'border-amber-400/50 bg-amber-500/10 text-amber-300',
  revisar: 'border-sky-400/50 bg-sky-500/10 text-sky-300',
  tramitando: 'border-gold/40 bg-gold/10 text-gold',
  sem_calculo: 'border-line bg-ink-700/50 text-parchment/60',
  nada: 'border-line bg-ink-700/50 text-parchment/50',
  encerrado: 'border-line bg-ink-700/30 text-parchment/40',
};

// os "cartões" de situação, que também são o filtro principal
const CARTOES = [
  { id: 'consumou_agora', rotulo: 'Consumados agora', dica: 'Prazo em acompanhamento cuja data passou', ponto: 'bg-red-400' },
  { id: 'pronto', rotulo: 'Prontos para a peça', dica: 'Já prescrito ou decaído quando calculado', ponto: 'bg-emerald-400' },
  { id: 'acompanhando', rotulo: 'Em acompanhamento', dica: 'Consuma numa data conhecida', ponto: 'bg-amber-400' },
  { id: 'revisar', rotulo: 'Pedem revisão', dica: 'O cálculo pediu conferência manual', ponto: 'bg-sky-400' },
  { id: 'sem_calculo', rotulo: 'Sem cálculo', dica: 'Prazos ainda não calculados', ponto: 'bg-parchment/40' },
];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function LinhaMarco({ m }) {
  const onde = [m.cda && `CDA ${m.cda}`, m.periodo && `período ${m.periodo}`].filter(Boolean).join(' · ');
  let Icone = CheckCircle2;
  let cor = 'text-emerald-400';
  let quando = `consumada em ${formatarData(m.data)}`;
  if (m.estado === 'consumou_agora') {
    Icone = AlertTriangle;
    cor = 'text-red-400';
    quando = `consumou em ${formatarData(m.data)}`;
  } else if (m.estado === 'futuro') {
    Icone = Clock;
    cor = 'text-amber-400';
    quando = `consuma em ${formatarData(m.data)} · ${m.dias === 0 ? 'hoje' : `faltam ${m.dias} dia(s)`}`;
  }
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icone size={15} className={`mt-0.5 shrink-0 ${cor}`} />
      <span className="min-w-0">
        <span className="text-parchment/90">{NOME_TESE[m.tese] || m.tese}</span>
        {onde && <span className="text-parchment/45"> · {onde}</span>}
        <span className={`block text-xs ${cor}`}>{quando}</span>
        {m.condicao && m.estado !== 'consumado' && <span className="block text-[11px] text-parchment/45">{m.condicao}</span>}
      </span>
    </li>
  );
}

/** Calendário do mês com os prazos marcados; clicar num dia filtra a lista. */
function Calendario({ eventos, mes, setMes, dia, setDia, hojeIso }) {
  const porDia = useMemo(() => eventosPorDia(eventos), [eventos]);
  const semanas = semanasDoMes(mes.ano, mes.mes);
  const andar = (delta) => {
    const d = new Date(Date.UTC(mes.ano, mes.mes + delta, 1));
    setMes({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() });
  };
  return (
    <div className="rounded-2xl border border-line bg-ink-800/50 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <button onClick={() => andar(-1)} className="p-1.5 rounded-lg text-parchment/60 hover:text-parchment hover:bg-ink-700" aria-label="Mês anterior">
          <ChevronLeft size={16} />
        </button>
        <p className="text-sm font-semibold">
          {MESES[mes.mes].charAt(0).toUpperCase() + MESES[mes.mes].slice(1)} de {mes.ano}
        </p>
        <button onClick={() => andar(1)} className="p-1.5 rounded-lg text-parchment/60 hover:text-parchment hover:bg-ink-700" aria-label="Próximo mês">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-parchment/40 mb-1">
        {DIAS_SEMANA.map((d, k) => (
          <span key={k}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {semanas.flat().map((iso, k) => {
          if (!iso) return <span key={k} />;
          const doDia = porDia.get(iso) || [];
          const vermelho = doDia.some((e) => e.estado === 'consumou_agora');
          const escolhido = dia === iso;
          const hoje = iso === hojeIso;
          return (
            <button
              key={iso}
              onClick={() => doDia.length && setDia(escolhido ? null : iso)}
              disabled={!doDia.length}
              aria-pressed={escolhido}
              aria-label={`${formatarData(iso)}${doDia.length ? `: ${doDia.length} prazo(s)` : ''}`}
              className={`relative h-9 rounded-lg text-xs tabular-nums transition-colors ${
                escolhido
                  ? 'bg-gold text-ink font-bold'
                  : doDia.length
                    ? `font-semibold ${vermelho ? 'bg-red-500/15 text-red-200 hover:bg-red-500/25' : 'bg-amber-500/15 text-amber-100 hover:bg-amber-500/25'}`
                    : 'text-parchment/45 cursor-default'
              } ${hoje && !escolhido ? 'ring-1 ring-gold/70' : ''}`}
            >
              {Number(iso.slice(8))}
              {doDia.length > 1 && !escolhido && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-ink-900 border border-line text-[9px] leading-[14px] text-parchment/80">
                  {doDia.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-parchment/50">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-400/70" /> consumou</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-400/70" /> vai consumar</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm ring-1 ring-gold/70" /> hoje</span>
        <button
          onClick={() => {
            const h = new Date(`${hojeIso}T00:00:00Z`);
            setMes({ ano: h.getUTCFullYear(), mes: h.getUTCMonth() });
          }}
          className="ml-auto text-gold hover:underline"
        >
          Hoje
        </button>
      </div>
    </div>
  );
}

/** Agenda: os próximos prazos (e os consumados agora) em lista, ou só os do dia escolhido. */
function Agenda({ eventos, dia, setDia, onAbrir }) {
  const lista = dia ? eventos.filter((e) => e.data === dia) : eventos.filter((e) => e.estado === 'consumou_agora' || e.dias <= 90);
  return (
    <div className="rounded-2xl border border-line bg-ink-800/50 p-4 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-sm font-semibold">{dia ? `Prazos de ${formatarData(dia)}` : 'Próximos 90 dias e consumados agora'}</p>
        {dia && (
          <button onClick={() => setDia(null)} className="inline-flex items-center gap-1 text-xs text-parchment/60 hover:text-parchment">
            <X size={13} /> ver todos
          </button>
        )}
      </div>
      {lista.length === 0 ? (
        <p className="text-xs text-parchment/45 py-6 text-center">
          {eventos.length ? 'Nenhum prazo nos próximos 90 dias. Use as setas do calendário para ver os meses seguintes.' : 'Nenhum prazo em acompanhamento. Calcule os prazos dos casos abaixo.'}
        </p>
      ) : (
        <ul className="space-y-2 overflow-y-auto max-h-[19rem] pr-1">
          {lista.map((e, k) => {
            const vermelho = e.estado === 'consumou_agora';
            return (
              <li key={`${e.data}-${k}`} className={`rounded-xl border px-3 py-2 ${vermelho ? 'border-red-400/40 bg-red-500/5' : 'border-line bg-ink-900/40'}`}>
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 w-12 text-center rounded-lg py-1 ${vermelho ? 'bg-red-500/15 text-red-200' : 'bg-amber-500/15 text-amber-100'}`}>
                    <span className="block text-sm font-bold leading-none tabular-nums">{e.data.slice(8)}</span>
                    <span className="block text-[10px] uppercase">{MESES[Number(e.data.slice(5, 7)) - 1].slice(0, 3)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <button onClick={() => onAbrir(e.item.analise)} className="block max-w-full text-left text-sm text-parchment/90 hover:text-gold truncate">
                      {e.titulo}
                    </button>
                    <p className="text-xs text-parchment/55">
                      {NOME_TESE[e.tese] || e.tese}
                      {e.cda && ` · CDA ${e.cda}`}
                      {e.periodo && ` · ${e.periodo}`}
                    </p>
                    <p className={`text-[11px] ${vermelho ? 'text-red-300' : 'text-amber-300'}`}>
                      {vermelho ? `consumou em ${formatarData(e.data)}: confira nos autos e gere a peça` : e.dias === 0 ? 'consuma hoje' : `faltam ${e.dias} dia(s)`}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function Carteira({ user, onVoltar, onReabrirAnalise }) {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [disponivel, setDisponivel] = useState(true);
  const [filtros, setFiltros] = useState(FILTROS_PADRAO);
  const [calculando, setCalculando] = useState({}); // analiseId -> true
  const [erros, setErros] = useState({});
  const hojeIso = useMemo(() => hojeEmBrasilia().toISOString().slice(0, 10), []);
  const [mes, setMes] = useState(() => ({ ano: Number(hojeIso.slice(0, 4)), mes: Number(hojeIso.slice(5, 7)) - 1 }));

  const carregar = useCallback(async () => {
    setCarregando(true);
    const r = await carregarCarteira(user?.id);
    setItens(r.itens);
    setDisponivel(r.disponivel);
    setCarregando(false);
  }, [user?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const contagem = useMemo(() => contarSituacoes(itens), [itens]);
  const eventos = useMemo(() => eventosDoCalendario(itens), [itens]);
  const avisos = useMemo(() => avisosDaCarteira(itens), [itens]);
  const visiveis = useMemo(() => filtrarCarteira(itens, filtros), [itens, filtros]);
  const nFiltros = filtrosAtivos(filtros);
  const mudar = (patch) => setFiltros((f) => ({ ...f, ...patch }));

  const escolherDia = (dia) => mudar({ dia });

  const calcular = async (item) => {
    const chave = item.analise.id;
    setCalculando((c) => ({ ...c, [chave]: true }));
    setErros((e) => ({ ...e, [chave]: '' }));
    const r = await calcularPrazos(item.analise.id);
    setCalculando((c) => ({ ...c, [chave]: false }));
    if (!r.ok) setErros((e) => ({ ...e, [chave]: r.error }));
    else await carregar();
  };

  const mudarFase = async (item, fase) => {
    const anterior = item.fase;
    setItens((lista) => lista.map((i) => (i.analise.id === item.analise.id ? { ...i, fase } : i)));
    const r = await definirFase(item.casoId, fase);
    if (!r.ok) {
      setItens((lista) => lista.map((i) => (i.analise.id === item.analise.id ? { ...i, fase: anterior } : i)));
      setErros((e) => ({ ...e, [item.analise.id]: r.error }));
    } else {
      await carregar();
    }
  };

  const classeSelect =
    'rounded-xl bg-ink-900 border border-line px-3 py-2 text-sm text-parchment focus:outline-none focus:border-gold/50';

  return (
    <div className="min-h-screen bg-noir text-parchment">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex items-center gap-4">
          <button onClick={onVoltar} className="p-2 rounded-xl text-parchment/60 hover:text-parchment hover:bg-ink-700" aria-label="Voltar">
            <ArrowLeft size={18} />
          </button>
          <Logo size="md" showWordmark={false} />
          <span className="hidden h-11 w-px shrink-0 bg-line sm:block" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-bold">Carteira e prazos</h1>
            <p className="text-sm text-parchment/50 truncate">Calendário e situação de cada caso, calculados pelo motor do TributÁgil</p>
          </div>
          <button onClick={carregar} className="p-2.5 text-parchment/50 hover:text-parchment hover:bg-ink-700 rounded-xl" title="Atualizar" aria-label="Atualizar">
            <RefreshCw size={16} className={carregando ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {!disponivel && (
          <p className="flex items-start gap-2 text-sm text-amber-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> A carteira ainda não está ativa no banco de dados. As análises aparecem, mas
            sem prazos.
          </p>
        )}

        {/* avisos: ficam aqui dentro (sem e-mail) */}
        {(avisos.consumouAgora > 0 || avisos.proximos > 0) && (
          <div className="flex flex-col sm:flex-row gap-2">
            {avisos.consumouAgora > 0 && (
              <button
                onClick={() => setFiltros({ ...FILTROS_PADRAO, situacao: 'consumou_agora' })}
                className="flex-1 flex items-center gap-2 rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-2.5 text-left text-sm text-red-200 hover:bg-red-500/15"
              >
                <AlertTriangle size={16} className="shrink-0 text-red-400" />
                {avisos.consumouAgora} prazo(s) consumaram: confira nos autos e gere a peça
              </button>
            )}
            {avisos.proximos > 0 && (
              <div className="flex-1 flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-100">
                <CalendarClock size={16} className="shrink-0 text-amber-400" />
                {avisos.proximos} prazo(s) consumam nos próximos {avisos.janela} dias
              </div>
            )}
          </div>
        )}

        {/* calendário + agenda */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" aria-label="Calendário de prazos">
          <Calendario eventos={eventos} mes={mes} setMes={setMes} dia={filtros.dia} setDia={escolherDia} hojeIso={hojeIso} />
          <Agenda eventos={eventos} dia={filtros.dia} setDia={escolherDia} onAbrir={(a) => onReabrirAnalise?.(a)} />
        </section>
        <p className="flex items-start gap-1.5 text-[11px] text-parchment/45">
          <Info size={13} className="mt-0.5 shrink-0" />
          Cálculo automático a partir dos documentos de cada análise: antes de protocolar, confira nos autos se houve algum ato que interrompeu o prazo.
        </p>

        {/* filtros */}
        <section className="space-y-3" aria-label="Filtrar casos">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {CARTOES.map((c) => {
              const ativo = filtros.situacao === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => mudar({ situacao: ativo ? 'ativos' : c.id })}
                  aria-pressed={ativo}
                  title={c.dica}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    ativo ? 'border-gold bg-gold/10' : 'border-line bg-ink-800/40 hover:border-gold/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-[11px] text-parchment/60">
                    <span className={`h-2 w-2 rounded-full ${c.ponto}`} /> {c.rotulo}
                  </span>
                  <span className={`block text-xl font-bold tabular-nums ${ativo ? 'text-gold' : 'text-parchment'}`}>{contagem[c.id] || 0}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="relative flex-1 min-w-[12rem]">
              <span className="sr-only">Buscar caso ou CDA</span>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-parchment/40" />
              <input
                value={filtros.busca}
                onChange={(ev) => mudar({ busca: ev.target.value })}
                placeholder="Buscar caso ou CDA…"
                className={`${classeSelect} w-full pl-9`}
              />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <select value={filtros.fase} onChange={(ev) => mudar({ fase: ev.target.value })} className={classeSelect} aria-label="Fase do caso">
                <option value="todas">Todas as fases</option>
                {FASES.map((f) => (
                  <option key={f.id} value={f.id}>{f.rotulo}</option>
                ))}
              </select>
              <select value={filtros.tese} onChange={(ev) => mudar({ tese: ev.target.value })} className={classeSelect} aria-label="Tese">
                <option value="todas">Todas as teses</option>
                {Object.entries(NOME_TESE).map(([id, nome]) => (
                  <option key={id} value={id}>{nome}</option>
                ))}
              </select>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-parchment/60 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-gold"
                checked={filtros.situacao === 'encerrado'}
                onChange={(ev) => mudar({ situacao: ev.target.checked ? 'encerrado' : 'ativos' })}
              />
              Só encerrados ({contagem.encerrado || 0})
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-parchment/55">
            <SlidersHorizontal size={13} />
            <span>
              {visiveis.length} caso(s){nFiltros === 0 ? ' ativos (decididos e arquivados ficam fora)' : ''}
            </span>
            {filtros.dia && (
              <button onClick={() => mudar({ dia: null })} className="inline-flex items-center gap-1 rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-gold">
                dia {formatarData(filtros.dia)} <X size={12} />
              </button>
            )}
            {nFiltros > 0 && (
              <button onClick={() => setFiltros(FILTROS_PADRAO)} className="ml-auto text-gold hover:underline">
                Limpar filtros ({nFiltros})
              </button>
            )}
          </div>
        </section>

        {carregando && itens.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-parchment/60 py-10 justify-center">
            <Loader2 size={18} className="animate-spin text-gold" /> Carregando a carteira…
          </div>
        ) : visiveis.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-ink-800/30 px-8 py-12 text-center text-sm text-parchment/50">
            {itens.length === 0 ? 'Nenhuma análise ainda. Os casos aparecem aqui depois da primeira análise.' : 'Nenhum caso com esses filtros.'}
          </div>
        ) : (
          <ul className="space-y-3">
            {visiveis.map((item) => {
              const id = item.analise.id;
              return (
                <li key={id} className="rounded-2xl border border-line bg-ink-800/50 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-parchment/95 line-clamp-1">{item.analise.titulo}</p>
                      <p className="text-xs text-parchment/40 mt-0.5">
                        Versão {item.analise.versao || 1}
                        {item.calculadoEm && ` · prazos calculados em ${new Date(item.calculadoEm).toLocaleDateString('pt-BR')}`}
                      </p>
                      <span className={`inline-flex mt-2 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${COR_SITUACAO[item.situacao]}`}>
                        {SITUACOES[item.situacao].rotulo}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <label className="sr-only" htmlFor={`fase-${id}`}>Fase do caso</label>
                      <select
                        id={`fase-${id}`}
                        value={item.fase}
                        disabled={!item.casoId}
                        onChange={(ev) => mudarFase(item, ev.target.value)}
                        className="rounded-lg bg-ink-900 border border-line px-2.5 py-1.5 text-xs text-parchment focus:outline-none focus:border-gold disabled:opacity-40"
                      >
                        {FASES.map((f) => (
                          <option key={f.id} value={f.id}>{f.rotulo}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => calcular(item)}
                        disabled={Boolean(calculando[id])}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-line text-parchment/80 hover:border-gold/50 hover:text-gold disabled:opacity-50"
                        title="Lê os documentos da análise de novo e recalcula os prazos (não gera peça nem gasta crédito de análise)"
                      >
                        {calculando[id] ? <Loader2 size={13} className="animate-spin" /> : <Calculator size={13} />}
                        {calculando[id] ? 'Calculando…' : item.calculado ? 'Recalcular' : 'Calcular prazos'}
                      </button>
                      <button
                        onClick={() => onReabrirAnalise?.(item.analise)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-gold/90 hover:bg-gold text-ink font-semibold"
                      >
                        Abrir análise <ArrowUpRight size={13} />
                      </button>
                    </div>
                  </div>

                  {erros[id] && <p className="mt-2 text-xs text-amber-300">{erros[id]}</p>}
                  {item.desatualizado && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-sky-300">
                      <Info size={13} /> Há uma versão mais nova da análise: recalcule para usar os documentos novos.
                    </p>
                  )}

                  {item.marcos.length > 0 && (
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {item.marcos.map((m) => (
                        <LinhaMarco key={m.id || m.chave} m={m} />
                      ))}
                    </ul>
                  )}
                  {item.calculado && item.marcos.length === 0 && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-parchment/45">
                      <CalendarClock size={13} /> Nenhum prazo consumado nem a acompanhar neste caso.
                    </p>
                  )}
                  {item.revisar.length > 0 && (
                    <details className="mt-3 text-xs text-sky-300">
                      <summary className="cursor-pointer">
                        {item.revisar.map((t) => NOME_TESE[t.tese]).join(', ')}: o cálculo pede revisão manual
                      </summary>
                      <ul className="mt-1.5 space-y-1 text-parchment/60 list-disc pl-5">
                        {item.revisar.flatMap((t) => t.bloqueios.slice(0, 3)).map((b, k) => (
                          <li key={k}>{b}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <RodapeLegal />
    </div>
  );
}
