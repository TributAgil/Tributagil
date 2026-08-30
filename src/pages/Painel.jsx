import React, { useEffect, useState } from 'react';
import { LogOut, Scale, Clock, ArrowUpRight, Sparkles } from 'lucide-react';
import BotaoComecarAnalise from '../components/BotaoComecarAnalise';
import BarraCreditos from '../components/BarraCreditos';
import Logo from '../components/Logo';
import RodapeLegal from '../components/RodapeLegal';
import { listarAnalises } from '../lib/analises';

// ============================================================
// PAINEL — tela inicial pós-login. "Autoridade Fluida": preto + dourado.
// ============================================================

function formatarData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const Painel = ({ user, onNovaAnalise, onReabrirAnalise, onVerHistorico, onLogout }) => {
  const [recentes, setRecentes] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    listarAnalises(user?.id).then((lista) => {
      if (vivo) {
        setRecentes(lista.slice(0, 3));
        setCarregando(false);
      }
    });
    return () => {
      vivo = false;
    };
  }, [user?.id]);

  return (
    <div className="bg-noir min-h-screen text-parchment font-sans">
      {/* ---- Cabeçalho ---- */}
      {/* Barra fixa: acompanha a rolagem para a marca nunca sumir de vista.
          O blur evita que o conteudo passando por baixo compita com o logo. */}
      <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6 sm:px-6 sm:py-7">
          <Logo size="lg" />

          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-parchment/50 sm:block">{user?.email}</span>
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm
                         text-parchment/60 transition-colors hover:border-gold/40 hover:text-gold"
              title="Sair da conta"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* ---- Hero ---- */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="flex flex-col items-center py-16 text-center sm:py-32">
          <span className="mb-7 inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl border border-line bg-ink-800/60 px-4 py-1.5 text-xs tracking-wide text-parchment/55">
            <Sparkles size={13} className="text-gold shrink-0" />
            Prescrição ordinária · Decadência · Prescrição intercorrente
          </span>

          <h1 className="max-w-3xl text-balance font-display text-4xl font-semibold leading-[1.1] text-parchment sm:text-6xl">
            A decisão certa, <span className="text-gold">no tempo certo</span>.
          </h1>

          <p className="mt-6 max-w-xl text-balance text-base leading-relaxed text-parchment/55 sm:text-lg">
            Envie os documentos do processo e receba um parecer tributário estruturado — datas,
            fundamentos e recomendação de via, com rigor pericial.
          </p>

          <div className="mt-8 w-full max-w-md">
            <BarraCreditos userId={user?.id} />
          </div>

          <div className="mt-8">
            <BotaoComecarAnalise onComecar={onNovaAnalise} />
          </div>

          <button
            onClick={onVerHistorico}
            className="mt-8 text-sm text-parchment/40 underline-offset-4 transition-colors hover:text-gold hover:underline"
          >
            Ver histórico completo
          </button>
        </section>

        {/* ---- Análises recentes ---- */}
        <section className="border-t border-line/60 py-14">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-xl text-parchment/90">Análises recentes</h2>
            {recentes.length > 0 && (
              <button
                onClick={onVerHistorico}
                className="inline-flex items-center gap-1 text-sm text-parchment/45 transition-colors hover:text-gold"
              >
                Ver todas <ArrowUpRight size={14} />
              </button>
            )}
          </div>

          {carregando ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-[var(--radius-xl2)] border border-line bg-ink-800/50" />
              ))}
            </div>
          ) : recentes.length === 0 ? (
            <div className="rounded-[var(--radius-xl2)] border border-dashed border-line bg-ink-800/30 px-8 py-14 text-center">
              <Clock size={22} className="mx-auto mb-3 text-parchment/30" />
              <p className="text-sm text-parchment/50">
                Nenhuma análise ainda. Sua primeira aparece aqui assim que concluir.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {recentes.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onReabrirAnalise?.(item)}
                  className="group flex flex-col rounded-[var(--radius-xl2)] border border-line bg-ink-800/50 p-5 text-left
                             transition-all hover:-translate-y-0.5 hover:border-gold/35
                             hover:shadow-[0_0_0_1px_rgba(212,175,55,0.2),0_20px_50px_-24px_rgba(212,175,55,0.35)]"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-ink-700">
                      <Scale size={14} className="text-gold" />
                    </span>
                    <span className="text-[11px] uppercase tracking-wider text-parchment/35">
                      {formatarData(item.created_at)}
                    </span>
                  </div>
                  <p className="line-clamp-1 font-medium text-parchment/90">{item.titulo}</p>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-parchment/45">
                    {item.resumo}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1 text-xs text-gold/70 transition-colors group-hover:text-gold">
                    Abrir parecer <ArrowUpRight size={13} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      <RodapeLegal />
    </div>
  );
};

export default Painel;
