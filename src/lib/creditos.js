// src/lib/creditos.js
//
// Créditos de análise: lê o saldo do usuário na tabela `perfis`.
//
// O saldo NUNCA é decrementado pelo cliente (a RLS de `perfis` só libera
// SELECT) — o consumo acontece de forma atômica no backend, via a RPC
// `consumir_credito` chamada por `/api/gemini` no momento em que a análise é
// efetivamente disparada. Isso evita que alguém manipule o saldo direto pelo
// client-side (fraude).
//
// Como as demais funções deste projeto, é "best-effort": se a tabela ainda
// não existir (migração pendente) ou o usuário não estiver logado, devolve
// `null` em vez de quebrar a tela — a interface trata `null` como "estado
// desconhecido" e não bloqueia a análise (o bloqueio real é sempre reforçado
// no servidor).

import { supabase } from './supabase';

/**
 * @param {string} userId
 * @returns {Promise<{plano: string, disponiveis: number, bonus: number, saldo: number} | null>}
 */
export async function buscarCreditos(userId) {
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from('perfis')
      .select('plano, creditos_disponiveis, creditos_bonus')
      .eq('id', userId)
      .single();

    if (error) {
      console.warn('[creditos] Falha ao buscar saldo (tabela ausente ou perfil inexistente?):', error.message);
      return null;
    }

    const disponiveis = Number(data?.creditos_disponiveis ?? 0);
    const bonus = Number(data?.creditos_bonus ?? 0);
    return {
      plano: data?.plano || 'gratuito',
      disponiveis,
      bonus,
      saldo: disponiveis + bonus,
    };
  } catch (err) {
    console.error('[creditos] Erro inesperado ao buscar saldo:', err);
    return null;
  }
}
