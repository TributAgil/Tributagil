import React from 'react';

// ============================================================
// LOGO TributÁgil — balança estilizada (viga levemente inclinada = agilidade)
// sobre coluna + base (autoridade). Traços dourados via currentColor.
// ============================================================
export default function Logo({ size = 'md', showWordmark = true, className = '' }) {
  const px = size === 'lg' ? 46 : size === 'sm' ? 24 : 34;

  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <svg
        width={px}
        height={px}
        viewBox="0 0 48 48"
        fill="none"
        className="text-gold"
        aria-hidden="true"
      >
        <g stroke="currentColor" strokeLinecap="round">
          <path d="M7 15.5 L41 12.5" strokeWidth="2.4" />
          <path d="M24 13 V37" strokeWidth="2.4" />
          <path d="M16.5 37.5 H31.5" strokeWidth="2.4" />
          <path d="M7 15.5 V18.5" strokeWidth="1.4" />
          <path d="M2.5 18.5 A 4.5 4.5 0 0 0 11.5 18.5" strokeWidth="1.6" />
          <path d="M41 12.5 V15.5" strokeWidth="1.4" />
          <path d="M36.5 15.5 A 4.5 4.5 0 0 0 45.5 15.5" strokeWidth="1.6" />
        </g>
        <circle cx="24" cy="12.6" r="1.9" fill="currentColor" />
      </svg>

      {showWordmark && (
        <span
          className={`font-display font-semibold tracking-wide text-parchment ${
            size === 'lg' ? 'text-2xl' : 'text-lg'
          }`}
        >
          Tribut<span className="text-gold">Ágil</span>
        </span>
      )}
    </span>
  );
}
