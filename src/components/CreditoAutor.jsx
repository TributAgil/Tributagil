import React from 'react';

// ============================================================
// Crédito do autor — frase inteira clicável, centralizada.
// ============================================================
export default function CreditoAutor({ className = '' }) {
  return (
    <a
      href="https://bio.site/vixeluan"
      target="_blank"
      rel="noopener noreferrer"
      className={`block text-center text-xs leading-relaxed text-parchment/30 transition-colors hover:text-gold ${className}`}
    >
      Direitos reservados a Luan Costa
      <br />
      <span className="font-medium tracking-wide">@vixeluan</span>
    </a>
  );
}
