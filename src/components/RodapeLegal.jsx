import React from 'react';
import CreditoAutor from './CreditoAutor';

// ============================================================
// Rodapé compartilhado: slogan + links legais + crédito do autor.
// As páginas legais são HTML estático em /public (abrem em nova aba).
// ============================================================
export default function RodapeLegal({ className = '', comBorda = true }) {
  return (
    <footer className={`${comBorda ? 'border-t border-line/60' : ''} py-8 ${className}`}>
      <p className="text-center text-xs text-parchment/30">
        "Da decadência à prescrição, o TributÁgil é a sua solução."
      </p>
      <nav className="mt-3 flex items-center justify-center gap-4 text-xs text-parchment/35">
        <a
          href="/privacidade.html"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-gold"
        >
          Privacidade
        </a>
        <span aria-hidden="true">·</span>
        <a
          href="/termos.html"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-gold"
        >
          Termos de Uso
        </a>
      </nav>
      <CreditoAutor className="mt-3" />
    </footer>
  );
}
