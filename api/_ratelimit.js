// api/_ratelimit.js
//
// Rate limiter simples, em memória, SEM dependências. Funciona tanto no runtime
// Node quanto no Edge (não usa APIs de plataforma).
//
// LIMITAÇÃO CONHECIDA: o estado vive por instância da função. Com várias
// instâncias (Fluid/escala), o limite efetivo é (limite × nº de instâncias) e
// zera em cold start. É um "quebra-molas" contra abuso casual — para um limite
// forte e global, use Upstash Redis / Vercel KV.
//
// Arquivo com prefixo "_": a Vercel não o expõe como rota.

const baldes = new Map(); // chave -> { n, reset }

/**
 * @param {string} chave  normalmente o IP do cliente
 * @param {number} limite  requisições permitidas na janela
 * @param {number} janelaMs  tamanho da janela em ms
 * @returns {{ ok: true } | { ok: false, retryMs: number }}
 */
export function rateLimit(chave, limite, janelaMs) {
  const agora = Date.now();
  const b = baldes.get(chave);

  if (!b || agora >= b.reset) {
    baldes.set(chave, { n: 1, reset: agora + janelaMs });
    return { ok: true };
  }

  b.n += 1;

  // limpeza oportunista para o Map não crescer sem limite
  if (baldes.size > 5000) {
    for (const [k, v] of baldes) if (agora >= v.reset) baldes.delete(k);
  }

  return b.n <= limite ? { ok: true } : { ok: false, retryMs: b.reset - agora };
}

/** Extrai o IP do cliente de um Request (Web API), com fallback. */
export function ipDoRequest(request) {
  const xff = request.headers.get('x-forwarded-for') || '';
  return xff.split(',')[0].trim() || request.headers.get('x-real-ip') || 'desconhecido';
}
