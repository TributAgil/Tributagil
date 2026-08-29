import { supabase } from './supabase';
import { removerDocumentos } from './storageDocumentos';
import { criarCaso } from './casos';

/** Extrai os storage_path dos documentos de um registro/payload de análise. */
export function caminhosDocumentos(registroOuPayload) {
  const payload = registroOuPayload?.payload ?? registroOuPayload ?? {};
  const docs = Array.isArray(payload?.documentos) ? payload.documentos : [];
  return docs.map((d) => d?.storage_path || d?.storagePath).filter(Boolean);
}

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
      .select('id, created_at, titulo, resumo, payload, resultado, observacoes, observacoes_em, caso_id, versao')
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
 * Descobre o caso e a versão de uma análise:
 *  - `casoId` informado (reanálise) -> próxima versão daquele caso.
 *  - sem `casoId` (análise nova) -> cria um `caso` de agrupamento, versão 1.
 * Best-effort: se `casos` ainda não existir, devolve `casoIdFinal: null` e a
 * análise é salva sem versionamento (ver fallback em `salvarAnalise`).
 */
async function resolverCasoEVersao({ userId, payload, resultado, casoId }) {
  if (casoId) {
    let proximaVersao = 2;
    try {
      const { data, error } = await supabase
        .from('analises')
        .select('versao')
        .eq('caso_id', casoId)
        .order('versao', { ascending: false })
        .limit(1);
      if (!error && data?.[0]?.versao) proximaVersao = data[0].versao + 1;
    } catch (err) {
      console.warn('[analises] Falha ao calcular a próxima versão do caso:', err);
    }
    return { casoIdFinal: casoId, versao: proximaVersao };
  }

  const caso = await criarCaso({ userId, titulo: derivarTitulo(payload, resultado) });
  return { casoIdFinal: caso?.id || null, versao: 1 };
}

/**
 * Persiste uma análise concluída. Não lança — apenas registra no console em caso de erro.
 * @param {{ userId: string, payload: object, resultado: object, casoId?: string|null }} args
 *   `casoId`: quando presente, é uma REANÁLISE (nova versão de um caso já
 *   existente) — o parecer anterior permanece intacto no histórico, pois
 *   cada versão é sempre uma linha nova (nunca um update/delete).
 * @returns {Promise<object|null>} o registro salvo, ou null se não foi possível
 */
export async function salvarAnalise({ userId, payload, resultado, casoId }) {
  if (!userId) return null;

  const { casoIdFinal, versao } = await resolverCasoEVersao({ userId, payload, resultado, casoId });

  const registroBase = {
    user_id: userId,
    titulo: derivarTitulo(payload, resultado),
    resumo: derivarResumo(resultado),
    payload: payload ?? null,
    resultado: resultado ?? null,
  };
  const registroVersionado = { ...registroBase, caso_id: casoIdFinal, versao };
  const SELECT_COLUNAS = 'id, created_at, titulo, resumo, payload, resultado, observacoes, observacoes_em, caso_id, versao';

  // 1 retry: um hiccup de rede não deve fazer o usuário perder o parecer.
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const { data, error } = await supabase
        .from('analises')
        .insert(registroVersionado)
        .select(SELECT_COLUNAS)
        .single();

      if (!error) return normalizarRegistro(data);

      // Colunas de versionamento ainda não existem (migração pendente) — salva
      // sem elas para não perder o parecer do usuário.
      if (/column .*(caso_id|versao)/i.test(error.message || '')) {
        console.warn('[analises] Colunas de versionamento ausentes — salvando sem versionamento:', error.message);
        const { data: data2, error: error2 } = await supabase
          .from('analises')
          .insert(registroBase)
          .select('id, created_at, titulo, resumo, payload, resultado, observacoes, observacoes_em')
          .single();
        if (!error2) return normalizarRegistro(data2);
        console.warn('[analises] Falha ao salvar sem versionamento:', error2.message);
      } else {
        console.warn(`[analises] Falha ao salvar (tentativa ${tentativa + 1}):`, error.message);
      }
    } catch (err) {
      console.error(`[analises] Erro inesperado ao salvar (tentativa ${tentativa + 1}):`, err);
    }
    if (tentativa === 0) await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

/**
 * Exclui uma análise: remove os documentos do Storage E a linha do banco.
 * (LGPD — o "excluir meus dados" precisa apagar os arquivos, não só o registro.)
 * @param {string} id
 * @param {string[]} storagePaths  caminhos dos documentos a remover do Storage
 */
export async function excluirAnalise(id, storagePaths = []) {
  if (!id) return false;

  // 1. Storage primeiro (best-effort — não bloqueia a exclusão do registro).
  if (Array.isArray(storagePaths) && storagePaths.length > 0) {
    const r = await removerDocumentos(storagePaths);
    if (!r.ok) {
      console.error('[analises] Documentos NÃO removidos do Storage ao excluir:', r.error);
      try {
        window.Sentry?.captureMessage?.('excluirAnalise: falha ao remover documentos do Storage', {
          level: 'error',
        });
      } catch {
        /* Sentry ausente */
      }
    }
  }

  // 2. Linha do banco (RLS garante que só o dono exclui).
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

/**
 * Salva as anotações do advogado sobre um parecer.
 * @returns {Promise<{ok: boolean, em: string|null}>}
 */
export async function salvarObservacoes(id, texto) {
  if (!id) return { ok: false, em: null };
  const em = new Date().toISOString();
  try {
    const { error } = await supabase
      .from('analises')
      .update({ observacoes: texto ?? '', observacoes_em: em })
      .eq('id', id);
    if (error) {
      console.warn('[analises] Falha ao salvar anotações:', error.message);
      return { ok: false, em: null };
    }
    return { ok: true, em };
  } catch (err) {
    console.error('[analises] Erro inesperado ao salvar anotações:', err);
    return { ok: false, em: null };
  }
}

/** Exporta TODAS as análises do usuário como um objeto JSON (portabilidade LGPD, art. 18). */
export async function exportarHistorico(userId) {
  const lista = await listarAnalises(userId);
  return {
    exportado_em: new Date().toISOString(),
    origem: 'tributagil',
    formato: 'v1',
    total: lista.length,
    analises: lista.map((a) => ({
      id: a.id,
      criado_em: a.created_at,
      titulo: a.titulo,
      resumo: a.resumo,
      observacoes: a.observacoes || null,
      observacoes_em: a.observacoes_em,
      resultado: a.resultado,
      documentos: a.payload?.documentos ?? [],
    })),
  };
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
    observacoes: row?.observacoes ?? '',
    observacoes_em: row?.observacoes_em ?? null,
    caso_id: row?.caso_id ?? null,
    versao: row?.versao ?? 1,
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
