// src/pages/Carteira.jsx
//
// "Carteira de casos": uma linha por caso (a versão mais nova da análise), com a fase em que ele está e os marcos de
// prazo calculados pelo motor (src/lib/carteiraModelo.js). O que já prescreveu ou decaiu aparece como tese pronta; o
// que vai se consumar numa data conhecida fica "em acompanhamento", e o advogado recebe um e-mail quando a data passa
// (api/alertas-prazo.js). Caso sem prazos calculados tem o botão "Calcular prazos" (lê os documentos de novo; não gera
// peça nem gasta crédito de análise).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Clock, CalendarClock, Calculator, ArrowUpRight, Bell, Info,
} from 'lucide-react';
import Logo from '../components/Logo';
import RodapeLegal from '../components/RodapeLegal';
import { carregarCarteira, calcularPrazos, definirFase } from '../lib/carteira';
import { FASES, NOME_TESE, SITUACOES, contarSituacoes, formatarData } from '../lib/carteiraModelo';

const FILTROS = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'consumou_agora', rotulo: 'Consumados agora' },
  { id: 'pronto', rotulo: 'Prontos para peça' },
  { id: 'acompanhando', rotulo: 'Em acompanhamento' },
  { id: 'sem_calculo', rotulo: 'Sem cálculo' },
  { id: 'encerrado', rotulo: 'Encerrados' },
];

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

export default function Carteira({ user, onVoltar, onReabrirAnalise }) {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [disponivel, setDisponivel] = useState(true);
  const [filtro, setFiltro] = useState('todos');
  const [calculando, setCalculando] = useState({}); // casoId|analiseId -> true
  const [erros, setErros] = useState({});

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
  const visiveis = useMemo(
    () => (filtro === 'todos' ? itens.filter((i) => i.situacao !== 'encerrado') : itens.filter((i) => i.situacao === filtro)),
    [itens, filtro],
  );

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
            <h1 className="text-lg sm:text-xl font-bold">Carteira de casos</h1>
            <p className="text-sm text-parchment/50 truncate">Prazos de cada caso, calculados pelo motor do TributÁgil</p>
          </div>
          <button onClick={carregar} className="p-2.5 text-parchment/50 hover:text-parchment hover:bg-ink-700 rounded-xl" title="Atualizar" aria-label="Atualizar">
            <RefreshCw size={16} className={carregando ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <p className="flex items-start gap-2 text-xs text-parchment/55 rounded-xl border border-line bg-ink-800/50 px-3 py-2.5">
          <Bell size={14} className="mt-0.5 shrink-0 text-gold" />
          Os prazos em acompanhamento viram um e-mail para {user?.email || 'você'} no dia seguinte à data, se o caso não estiver decidido ou
          arquivado. É cálculo automático: antes de protocolar, confira nos autos se houve algum ato que interrompeu o prazo.
        </p>

        {!disponivel && (
          <p className="flex items-start gap-2 text-sm text-amber-300">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> A carteira ainda não está ativa no banco de dados. As análises aparecem, mas
            sem prazos.
          </p>
        )}

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar casos">
          {FILTROS.map((f) => {
            const n = f.id === 'todos' ? itens.filter((i) => i.situacao !== 'encerrado').length : contagem[f.id];
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={filtro === f.id}
                onClick={() => setFiltro(f.id)}
                className={`px-3 py-1.5 rounded-full border text-xs transition-colors ${
                  filtro === f.id ? 'border-gold bg-gold/15 text-gold' : 'border-line text-parchment/60 hover:text-parchment'
                }`}
              >
                {f.rotulo} <span className="tabular-nums opacity-70">({n})</span>
              </button>
            );
          })}
        </div>

        {carregando && itens.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-parchment/60 py-10 justify-center">
            <Loader2 size={18} className="animate-spin text-gold" /> Carregando a carteira…
          </div>
        ) : visiveis.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-ink-800/30 px-8 py-12 text-center text-sm text-parchment/50">
            {itens.length === 0 ? 'Nenhuma análise ainda. Os casos aparecem aqui depois da primeira análise.' : 'Nenhum caso neste filtro.'}
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
