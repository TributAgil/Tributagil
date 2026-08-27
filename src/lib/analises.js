import { supabase } from './supabase';

/**
 * Camada de acesso a dados das análises tributárias.
 *
 * Estrutura esperada da tabela `analises` no Supabase (ver README para o SQL):
 *   id          uuid       primary key default gen_random_uuid()
 *   user_id     uuid       references auth.users
 *   created_at  timestamptz default now()
 *   titulo      text
 *   resumo      text
 *   payload     jsonb      -- o que foi enviado para a IA
 *   resultado   jsonb      -- o parecer devolvido pela IA
 *
 * Todas as funções são "best-effort": se a tabela ainda não existir ou o
 * usuário não estiver logado, elas degradam para uma lista vazia em vez de
 * quebrar a interface.
 */

/**
 * Lista as análises concluídas do usuário, mais recentes primeiro.
 * @returns {Promise<Array>} lista normalizada (nunca lança)
 */
export async function listarAnalises(userId) {
  if (!userId) return [];

  try {
    const { data, error } = await supabase
      .from('analises')
      .select('id, created_at, titulo, resumo, payload, resultado')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[analises] Falha ao listar (tabela ausente?):', error.message);
      return [];
    }

    return (data ?? []).map(normalizarRegistro);
  } catch (err) {
    console.error('[analises] Erro inesperado ao listar:', err);
    return [];
  }
}

/**
 * Persiste uma análise concluída. Não lança — apenas registra no console em caso de erro.
 * @returns {Promise<object|null>} o registro salvo, ou null se não foi possível
 */
export async function salvarAnalise({ userId, payload, resultado }) {
  if (!userId) return null;

  const registro = {
    user_id: userId,
    titulo: derivarTitulo(payload, resultado),
    resumo: derivarResumo(resultado),
    payload: payload ?? null,
    resultado: resultado ?? null,
  };

  try {
    const { data, error } = await supabase
      .from('analises')
      .insert(registro)
      .select('id, created_at, titulo, resumo, payload, resultado')
      .single();

    if (error) {
      console.warn('[analises] Não foi possível salvar (tabela ausente?):', error.message);
      return null;
    }
    return normalizarRegistro(data);
  } catch (err) {
    console.error('[analises] Erro inesperado ao salvar:', err);
    return null;
  }
}

/**
 * Exclui uma análise pelo id. Retorna true/false conforme sucesso.
 */
export async function excluirAnalise(id) {
  if (!id) return false;
  try {
    const { error } = await supabase.from('analises').delete().eq('id', id);
    if (error) {
      console.warn('[analises] Falha ao excluir:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[analises] Erro inesperado ao excluir:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function normalizarRegistro(row) {
  const resultado = row?.resultado ?? {};
  const conclusoes = Array.isArray(resultado.conclusoes) ? resultado.conclusoes : [];
  return {
    id: row?.id,
    created_at: row?.created_at,
    titulo: row?.titulo || 'Análise sem título',
    resumo: row?.resumo || derivarResumo(resultado),
    documentos_count: row?.payload?.documentos?.length ?? 0,
    tem_prescricao: conclusoes.some((c) => String(c?.tipo).includes('prescricao')),
    tem_decadencia: conclusoes.some((c) => String(c?.tipo).includes('decadencia')),
    confianca_media: mediaConfianca(conclusoes),
    payload: row?.payload ?? null,
    resultado,
  };
}

const AUSENTE = new Set(['', '—', 'não identificado', 'nao identificado', 'n/a', 'null', 'undefined']);
const valido = (v) => typeof v === 'string' && !AUSENTE.has(v.trim().toLowerCase());

function derivarTitulo(payload, resultado) {
  const m = resultado?.metadata ?? {};
  if (valido(m.parte_reu)) return m.parte_reu;           // contribuinte / executado
  if (valido(m.parte_autora)) return m.parte_autora;     // fisco / exequente
  if (valido(resultado?.conclusoes?.[0]?.titulo)) return resultado.conclusoes[0].titulo;
  return `Análise de ${payload?.documentos?.length ?? 0} documento(s)`;
}

function derivarResumo(resultado) {
  return (
    resultado?.conclusoes?.[0]?.resumo ||
    resultado?.recomendacoes?.[0] ||
    'Parecer tributário gerado pela IA.'
  );
}

function mediaConfianca(conclusoes) {
  const valores = conclusoes.map((c) => Number(c?.confianca)).filter((n) => Number.isFinite(n));
  if (valores.length === 0) return null;
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}
