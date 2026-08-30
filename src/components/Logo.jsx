import React from 'react';

// ============================================================
// LOGO TributÁgil — "O veredito no cruzamento"
// ------------------------------------------------------------
// Balança do direito em LINHA, dentro da INTERSECÇÃO de duas caixas de
// pensamento: o contribuinte pergunta, a IA responde — e a resposta é
// exatamente o ponto onde os dois pensamentos se cruzam.
//
// Geometria (viewBox 64×64, unidades do viewBox):
//   • Balão A (fundo, sobe à direita):   (16,6)  → (58,40), rabicho ↘
//   • Balão B (frente, desce à esquerda): (6,14) → (48,48), rabicho ↙
//   • Intersecção: x 16–48, y 14–40 — cantos arredondados só em TR e BL
//     (os outros dois nascem do cruzamento das arestas). Essa "lente" é
//     preenchida com a cor do fundo para APAGAR os traços que se cruzam
//     lá dentro; sem isso o miolo vira um borrão em tamanho pequeno.
//   • Traço uniforme em toda a marca (balões, lente, mastro e viga), com os
//     detalhes menores proporcionalmente mais leves: conchas 0.88x e
//     tirantes 0.59x. A balança se destaca pela POSIÇÃO (centro da lente),
//     não pelo peso do traço. Ver PESOS: o peso base cresce nos tamanhos
//     pequenos para o desenho não sumir.
//   • Pino da viga em (32, 21.8) ≈ 50%/34% do viewBox = `transform-origin`
//     de .anim-scales / .anim-scales-hover (ver index.css).
//
// Variantes:
//   badge (padrão) — quadrado dourado, traço preto. Marca oficial.
//   mark           — sem quadro, traço dourado, lente preenchida com o
//                    preto do app. Para cabeçalhos discretos e impressão.
// ============================================================

const TAMANHOS = { sm: 30, md: 42, lg: 62, xl: 104 };

// Compensação óptica: o mesmo traço que fica elegante em 88px vira um fio
// quase invisível em 28px. Então o peso base cresce à medida que o desenho
// encolhe. As proporções internas (conchas 0.88, tirantes 0.59) são as
// mesmas em todos os tamanhos — só a régua muda.
const PESOS = { sm: 2.3, md: 2.0, lg: 1.75, xl: 1.65 };

export default function Logo({
  size = 'md',
  variant = 'badge',
  showWordmark = true,
  animated = false,
  className = '',
}) {
  const px = TAMANHOS[size] ?? TAMANHOS.md;
  const isBadge = variant === 'badge';

  const w = PESOS[size] ?? PESOS.md;
  const wConcha = +(w * 0.88).toFixed(2);
  const wTirante = +(w * 0.59).toFixed(2);
  const rFiel = +(w * 0.76).toFixed(2);

  const traco = isBadge ? '#0f0f0f' : 'currentColor';
  // A lente precisa ser OPACA (não translúcida): é ela que esconde os
  // cruzamentos dos dois balões.
  const lente = isBadge ? 'var(--color-gold, #d4af37)' : 'var(--color-ink, #0f0f0f)';

  // Oscila sozinha (telas de espera) ou só reage ao hover do grupo pai.
  const classeBalanca = animated ? 'anim-scales' : 'anim-scales-hover';

  const escala =
    size === 'xl' ? 'text-5xl' : size === 'lg' ? 'text-[2rem]' : size === 'sm' ? 'text-base' : 'text-xl';

  return (
    <span className={`group inline-flex items-center gap-3 ${className}`}>
      <svg
        width={px}
        height={px}
        viewBox="0 0 64 64"
        fill="none"
        role="img"
        aria-label="TributÁgil"
        className={isBadge ? 'flex-shrink-0' : 'flex-shrink-0 text-gold'}
      >
        {isBadge && <rect width="64" height="64" rx="14" fill="var(--color-gold, #d4af37)" />}

        {/* ---- As duas caixas de pensamento (traço secundário) ---- */}
        <g
          stroke={traco}
          strokeWidth={w}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <rect x="16" y="6" width="42" height="34" rx="7" />
          <path d="M50 40 L56 47.5 L56 40" />
          <rect x="6" y="14" width="42" height="34" rx="7" />
          <path d="M14 48 L8 55.5 L8 48" />
        </g>

        {/* ---- A lente: apaga os cruzamentos e vira o palco da balança ---- */}
        <path
          d="M16 14 L41 14 A7 7 0 0 1 48 21 L48 40 L23 40 A7 7 0 0 1 16 33 Z"
          fill={lente}
          stroke={traco}
          strokeWidth={w}
          strokeLinejoin="round"
        />

        {/* ---- A balança (traço principal) ---- */}
        <g stroke={traco} strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* Mastro e base ficam PARADOS: é a autoridade que não oscila */}
          <path d="M32 19.2 V 34.8" strokeWidth={w} />
          <rect x="25.6" y="35.2" width="12.8" height="2.8" rx="1.4" strokeWidth={w} />

          {/* Viga e pratos oscilam juntos em torno do pino (32, 21.8) */}
          <g className={classeBalanca}>
            <path d="M21.5 21.8 Q 32 20 42.5 21.8" strokeWidth={w} />

            {/* Prato esquerdo: tirantes em V + concha */}
            <path d="M21.5 21.8 L 18.6 26.6 M21.5 21.8 L 24.4 26.6" strokeWidth={wTirante} />
            <path d="M16.7 26.6 A 4.8 4.8 0 0 0 26.3 26.6" strokeWidth={wConcha} />

            {/* Prato direito */}
            <path d="M42.5 21.8 L 39.6 26.6 M42.5 21.8 L 45.4 26.6" strokeWidth={wTirante} />
            <path d="M37.7 26.6 A 4.8 4.8 0 0 0 47.3 26.6" strokeWidth={wConcha} />
          </g>

          {/* Fiel: o ponto de equilíbrio — sempre no eixo */}
          <circle cx="32" cy="17.5" r={rFiel} fill={traco} stroke="none" />
        </g>
      </svg>

      {showWordmark && (
        <span className={`font-display font-semibold tracking-tight text-parchment ${escala}`}>
          Tribut<span className="text-gold">Ágil</span>
        </span>
      )}
    </span>
  );
}
