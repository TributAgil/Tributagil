import React, { useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';

// ============================================================
// BOTÃO "Começar a Análise" + animação do martelo (gavel)
// ============================================================
// Toda a coreografia vive em src/index.css (keyframes gavel-swing /
// hammer-impact / impact-ring / impact-flash). Aqui só orquestramos:
//   clique -> classe .is-striking -> callback ~240ms depois -> limpa no fim.

const DELAY_NAVEGACAO_MS = 240; // logo após o impacto, parece instantâneo

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
      {/* Martelo — inline p/ herdar a cor (currentColor = dourado). aria-hidden. */}
      <svg className="gavel" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <g fill="currentColor">
          {/* cabeça do martelo */}
          <rect x="3.5" y="14" width="24" height="13" rx="4" transform="rotate(-40 15.5 20.5)" />
          {/* aros das pontas (tom mais escuro) */}
          <rect
            x="5.5"
            y="12.5"
            width="4.5"
            height="16"
            rx="2.25"
            transform="rotate(-40 7.75 20.5)"
            fill="var(--color-gold-dim, #8a7130)"
          />
          <rect
            x="21"
            y="12.5"
            width="4.5"
            height="16"
            rx="2.25"
            transform="rotate(-40 23.25 20.5)"
            fill="var(--color-gold-dim, #8a7130)"
          />
          {/* cabo */}
          <rect x="21" y="18" width="6.5" height="26" rx="3.25" transform="rotate(-40 24.25 31)" />
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
