import React, { useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';

// ============================================================
// BOTÃO "Começar a Análise" + animação do martelo (gavel)
// ============================================================
// Toda a coreografia vive em src/index.css (keyframes gavel-swing /
// hammer-impact / impact-ring / impact-flash). Aqui só orquestramos:
//   clique -> classe .is-striking -> callback ~240ms depois -> limpa no fim.

// Só navega DEPOIS de a batida do martelo se resolver visualmente.
// Animação = 900ms; impacto aos ~450ms; quique/acomodação terminam aos ~740ms.
const DELAY_NAVEGACAO_MS = 760;

export default function BotaoComecarAnalise({
  onComecar,
  children = 'Começar a Análise',
  disabled = false,
}) {
  const [striking, setStriking] = useState(false);
  const jaChamou = useRef(false);

  const disparar = () => {
    if (striking || disabled) return;
    jaChamou.current = false;
    setStriking(true);

    const reduz =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    window.setTimeout(
      () => {
        if (!jaChamou.current) {
          jaChamou.current = true;
          onComecar?.();
        }
      },
      reduz ? 60 : DELAY_NAVEGACAO_MS,
    );
  };

  return (
    <span className={`gavel-wrap ${striking ? 'is-striking' : ''}`}>
      {/* Martelo de juiz — cabeça cilíndrica + faixas nas pontas + cabo do centro.
          currentColor = dourado. aria-hidden. O balanço fica no CSS (.gavel). */}
      <svg className="gavel" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <g transform="rotate(-42 24 24)">
          {/* cabeça (cilindro) */}
          <rect x="8" y="10" width="32" height="13" rx="6.5" fill="currentColor" />
          {/* cabo, saindo do CENTRO da cabeça */}
          <rect x="20.5" y="21" width="7" height="24" rx="3.5" fill="currentColor" />
          {/* faixas próximas às pontas (tom mais escuro) */}
          <rect x="13" y="11" width="3.4" height="11" rx="1.7" fill="var(--color-gold-dim, #8a7130)" />
          <rect x="31.6" y="11" width="3.4" height="11" rx="1.7" fill="var(--color-gold-dim, #8a7130)" />
        </g>
      </svg>

      <button
        type="button"
        onClick={disparar}
        disabled={disabled}
        className="gavel-strike-btn group inline-flex items-center gap-3 rounded-[var(--radius-xl2)]
                   bg-gold px-8 py-4 font-sans text-base font-semibold text-ink
                   shadow-[var(--shadow-gold)] transition-[transform,box-shadow,background-color]
                   duration-300 hover:bg-gold-soft hover:shadow-[0_0_0_1px_rgba(212,175,55,0.35),0_22px_60px_-18px_rgba(212,175,55,0.45)]
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold
                   active:scale-[0.98]
                   disabled:cursor-not-allowed disabled:bg-ink-600 disabled:text-parchment/40 disabled:shadow-none"
      >
        {children}
        <ArrowRight
          size={18}
          className="transition-transform duration-300 group-hover:translate-x-1"
        />
      </button>
    </span>
  );
}
