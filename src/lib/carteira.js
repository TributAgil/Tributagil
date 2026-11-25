// src/lib/carteira.js
//
// Acesso da carteira de casos ao Supabase e à API: lê a fase e os marcos de prazo (RLS: só os do usuário), muda a fase
// (RPC definir_fase_caso) e pede o cálculo dos prazos de um caso que ainda não tem (api/gerar-peca.js com so_prazos).
// A lógica de situação e ordem fica em src/lib/carteiraModelo.js.

import { supabase } from './supabase';
import { listarAnalises } from './analises';
import { montarCarteira } from './carteiraModelo';

/** Carrega e monta a carteira. Nunca lança: sem as tabelas (SQL não aplicado), devolve as análises sem prazos. */
export async function carregarCarteira(userId) {
  const analises = await listarAnalises(userId);
  let carteira = [];
  let marcos = [];
  let disponivel = true;
  try {
    const [c, m] = await Promise.all([
      supabase.from('carteira_casos').select('caso_id, analise_id, fase, fase_em, ajuizada, teses, calculado_em'),
      supabase.from('marcos_prazo').select('id, caso_id, chave, tese, cda, periodo, data, tipo, condicao, alertado_em').order('data'),
    ]);
    if (c.error || m.error) {
      disponivel = false;
      console.warn('[carteira] Tabelas da carteira indisponíveis:', c.error?.message || m.error?.message);
    } else {
      carteira = c.data || [];
      marcos = m.data || [];
    }
  } catch (err) {
    disponivel = false;
    console.warn('[carteira] Falha ao ler a carteira:', err);
  }
  return { itens: montarCarteira({ analises, carteira, marcos }), disponivel };
}

/** Muda a fase do caso. @returns {Promise<{ ok: boolean, error?: string }>} */
export async function definirFase(casoId, fase) {
  try {
    const { error } = await supabase.rpc('definir_fase_caso', { p_caso_id: casoId, p_fase: fase });
    return error ? { ok: false, error: 'Não foi possível mudar a fase agora.' } : { ok: true };
  } catch {
    return { ok: false, error: 'Erro de rede ao mudar a fase.' };
  }
}

/**
 * Calcula os prazos de um caso a partir da análise (lê os documentos de novo e roda o motor; não gera peça nem gasta
 * crédito de análise). @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function calcularPrazos(analiseId) {
  const { data: sess } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  const token = sess?.session?.access_token;
  if (!token) return { ok: false, error: 'Sessão expirada. Faça login novamente.' };
  try {
    const resposta = await fetch('/api/gerar-peca', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ analise_id: analiseId, so_prazos: true }),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok || dados.status !== 'prazos') return { ok: false, error: dados.error || 'Não foi possível calcular os prazos agora.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Erro de rede ao calcular os prazos.' };
  }
}
