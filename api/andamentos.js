// api/andamentos.js
//
// Acompanhar o processo sem baixar os autos de novo: consulta as movimentações no DataJud (CNJ, api/_datajud.js) pelo
// número da execução que está no parecer da análise e grava a consulta no caso (docs/sql/andamentos.sql, RPC
// salvar_andamentos_caso, com o token do próprio usuário). Não gasta crédito de análise nem chama a IA.
//
// POST { analise_id, forcar?, numero? } -> { status, andamento? , error? }
//   status 'ok' | 'nao_encontrado' | 'indisponivel' | 'erro' | 'recente' (consultado há menos de 6 h; devolve o salvo)
//   | 'sem_numero' (a análise não tem número CNJ válido de processo).

import { rateLimit, ipDoRequest } from './_ratelimit.js';
import { numeroCnj, consultarDataJud } from './_datajud.js';

const SUPABASE_URL_ENV = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_ENV = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RL_LIMITE = 20;
const RL_JANELA_MS = 60_000;
export const CACHE_MS = 6 * 60 * 60 * 1000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export async function POST(request) {
  const inicio = Date.now();
  const ctx = {};
  let resposta;
  try {
    resposta = await processar(request, ctx);
    return resposta;
  } finally {
    console.log(JSON.stringify({
      evento: 'api_andamentos',
      usuarioId: ctx.usuarioId || null,
      analiseId: ctx.analiseId || null,
      tribunal: ctx.tribunal || null,
      status: ctx.status || null,
      detalhe: ctx.detalhe || null,
      httpStatus: resposta?.status ?? null,
      duracaoMs: Date.now() - inicio,
    }));
  }
}

async function processar(request, ctx) {
  const apiKey = process.env.DATAJUD_API_KEY || '';
  if (!apiKey) return json({ error: 'Acompanhamento pelo DataJud não configurado (DATAJUD_API_KEY).' }, 503);
  const supabaseUrl = SUPABASE_URL_ENV;
  const anon = SUPABASE_ANON_ENV;
  if (!SUPABASE_URL_RE.test(supabaseUrl) || !anon) return json({ error: 'Configuração do servidor ausente. Contate o suporte.' }, 500);

  const rl = await rateLimit(`andamentos:${ipDoRequest(request)}`, RL_LIMITE, RL_JANELA_MS);
  if (!rl.ok) return json({ error: 'Muitas consultas em sequência. Aguarde um minuto.' }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido — envie um JSON.' }, 400);
  }
  const cabecalho = request.headers.get('authorization') || '';
  const userToken = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : '';
  if (!userToken) return json({ error: 'Sessão ausente. Faça login novamente.' }, 401);
  const analiseId = String(body?.analise_id || '');
  if (!UUID_RE.test(analiseId)) return json({ error: 'Informe a análise (analise_id).' }, 400);
  ctx.analiseId = analiseId;

  const rls = { apikey: anon, Authorization: `Bearer ${userToken}` };
  try {
    const auth = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: rls });
    if (!auth.ok) return json({ error: 'Sessão inválida ou expirada. Faça login novamente.' }, 401);
    ctx.usuarioId = (await auth.json().catch(() => ({})))?.id || null;
  } catch {
    return json({ error: 'Não foi possível validar sua sessão.' }, 502);
  }

  // a análise (RLS: só as próprias) e a última consulta do caso
  let analise;
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/analises?id=eq.${encodeURIComponent(analiseId)}&select=id,caso_id,resultado&limit=1`, { headers: rls });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    analise = (await r.json())?.[0];
  } catch (err) {
    console.error('[api/andamentos] Falha ao ler a análise:', err?.message);
    return json({ error: 'Não foi possível carregar a análise.' }, 502);
  }
  if (!analise) return json({ error: 'Análise não encontrada.' }, 404);
  if (!analise.caso_id) return json({ status: 'sem_numero', error: 'Esta análise não está vinculada a um caso.' }, 422);

  const selecionar = `${supabaseUrl}/rest/v1/andamentos_caso?caso_id=eq.${encodeURIComponent(analise.caso_id)}&select=*&limit=1`;
  let salvo = null;
  try {
    const r = await fetch(selecionar, { headers: rls });
    if (r.ok) salvo = (await r.json())?.[0] || null;
  } catch {
    /* sem o salvo, consulta de novo */
  }

  // o número: o que o advogado digitou agora > o da última consulta (que ele pode ter corrigido) > o do parecer
  const informado = body?.numero ? numeroCnj(body.numero) : null;
  if (body?.numero && !informado) {
    return json({ status: 'sem_numero', error: 'Número de processo inválido: confira os 20 dígitos (padrão do CNJ, com o dígito verificador).' }, 422);
  }
  const numero = informado || numeroCnj(salvo?.numero) || numeroCnj(analise.resultado?.metadata?.processo);
  if (!numero) {
    ctx.status = 'sem_numero';
    return json({ status: 'sem_numero', error: 'O parecer não traz um número de processo válido no padrão do CNJ. Digite o número da execução fiscal.' }, 422);
  }
  const recente = salvo && salvo.numero === numero && salvo.status === 'ok' && Date.now() - new Date(salvo.consultado_em).getTime() < CACHE_MS;
  if (recente && !body?.forcar) {
    ctx.status = 'recente';
    return json({ status: 'recente', andamento: salvo });
  }

  const r = await consultarDataJud({ numero, apiKey });
  ctx.tribunal = r.tribunal;
  ctx.status = r.status;
  ctx.detalhe = r.detalhe || null;
  if (r.status === 'erro' && /Chave/.test(r.detalhe || '')) console.error('[api/andamentos]', r.detalhe);

  try {
    const g = await fetch(`${supabaseUrl}/rest/v1/rpc/salvar_andamentos_caso`, {
      method: 'POST',
      headers: { ...rls, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_caso_id: analise.caso_id, p_numero: numero, p_tribunal: r.tribunal, p_status: r.status,
        p_detalhe: r.detalhe || '', p_dados: r.dados || null,
      }),
    });
    if (!g.ok) console.warn(`[api/andamentos] Consulta não gravada (HTTP ${g.status})`);
    const lido = await fetch(selecionar, { headers: rls });
    if (lido.ok) salvo = (await lido.json())?.[0] || salvo;
  } catch (err) {
    console.warn('[api/andamentos] Consulta não gravada:', err?.message);
  }

  const mensagens = {
    nao_encontrado: 'O DataJud não tem este processo (o tribunal pode ainda não ter enviado, ou o número do parecer está errado).',
    indisponivel: 'O DataJud não respondeu agora (o serviço do CNJ costuma ficar sobrecarregado). Tente mais tarde.',
    erro: 'Não foi possível consultar o DataJud.',
  };
  return json({ status: r.status, andamento: salvo, ...(mensagens[r.status] ? { mensagem: mensagens[r.status] } : {}) });
}
