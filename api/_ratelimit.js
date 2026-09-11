// api/_ratelimit.js
//
// Rate limiter compartilhado ENTRE INSTÂNCIAS, via RPC atômica no Supabase
// (`rate_limit_checar`, ver README) — substitui o antigo Map em memória do
// processo, que tinha limite efetivo de (limite × nº de instâncias da
// function) sob escala e zerava a cada cold start (achado em auditoria
// externa: com múltiplas instâncias, o "12/min por IP" virava, na prática,
// 12×N/min).
//
// Fail-open: se a chamada ao Supabase falhar (rede, RPC ausente por
// migração pendente), NÃO bloqueia — mesma filosofia "nunca quebra" do
// resto do sistema (créditos, chatbot). Rate limit é defesa em profundidade,
// não a única barreira contra abuso.
//
// Arquivo com prefixo "_": a Vercel não o expõe como rota.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * @param {string} chave  normalmente `<endpoint>:<ip>`
 * @param {number} limite  requisições permitidas na janela
 * @param {number} janelaMs  tamanho da janela em ms
 * @returns {Promise<{ ok: true } | { ok: false, retryMs: number }>}
 */
export async function rateLimit(chave, limite, janelaMs) {
  // Sem config do Supabase: não há como checar o limite compartilhado —
  // segue sem bloquear em vez de derrubar o endpoint inteiro por causa do
  // rate limiter.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return { ok: true };

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rate_limit_checar`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ p_chave: chave, p_limite: limite, p_janela_ms: janelaMs }),
    });

    if (!resp.ok) {
      if (resp.status !== 404) {
        console.warn(`[_ratelimit] RPC rate_limit_checar falhou (HTTP ${resp.status}) — seguindo sem bloquear.`);
      }
      return { ok: true };
    }

    const linhas = await resp.json().catch(() => null);
    const linha = Array.isArray(linhas) ? linhas[0] : linhas;
    if (!linha) return { ok: true };

    const retryMs = Number(linha.retry_ms);
    return linha.ok ? { ok: true } : { ok: false, retryMs: Number.isFinite(retryMs) ? retryMs : janelaMs };
  } catch (err) {
    console.warn('[_ratelimit] Erro de rede ao checar rate limit — seguindo sem bloquear:', err?.message);
    return { ok: true };
  }
}

/** Extrai o IP do cliente de um Request (Web API), com fallback. */
export function ipDoRequest(request) {
  const xff = request.headers.get('x-forwarded-for') || '';
  return xff.split(',')[0].trim() || request.headers.get('x-real-ip') || 'desconhecido';
}
