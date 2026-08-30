// src/lib/casos.js
//
// "Caso" agrupa as várias VERSÕES (análises) do mesmo processo, permitindo
// reanalisar quando surge um documento novo sem perder o parecer anterior
// (cada versão vira uma linha própria em `analises`, nunca é sobrescrita).
//
// Os documentos de um caso são acumulados em `documentos_caso`. Essa tabela
// só tem policies de SELECT e INSERT no Supabase — não existe UPDATE nem
// DELETE para o usuário autenticado — então, a nível de banco, nenhum
// documento já anexado pode ser removido ou substituído. É a proteção
// antifraude contra reprocessamento gratuito: o usuário só consegue
// ADICIONAR arquivos a um caso existente.
//
// Todas as funções são "best-effort" (degradam para null/[] sem lançar),
// seguindo o mesmo padrão de src/lib/analises.js.

import { supabase } from './supabase';

/** Cria o registro de agrupamento de um novo caso. */
export async function criarCaso({ userId, titulo }) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from('casos')
      .insert({ user_id: userId, titulo: titulo || null })
      .select('id, titulo, criado_em')
      .single();
    if (error) {
      console.warn('[casos] Falha ao criar caso:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[casos] Erro inesperado ao criar caso:', err);
    return null;
  }
}

/** Lista os documentos já anexados a um caso (todas as versões), mais antigos primeiro. */
export async function listarDocumentosCaso(casoId) {
  if (!casoId) return [];
  try {
    const { data, error } = await supabase
      .from('documentos_caso')
      .select('id, nome, mime_type, categoria, storage_path, tamanho_bytes, adicionado_em')
      .eq('caso_id', casoId)
      .order('adicionado_em', { ascending: true });
    if (error) {
      console.warn('[casos] Falha ao listar documentos do caso:', error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error('[casos] Erro inesperado ao listar documentos do caso:', err);
    return [];
  }
}

/** Registra 1 documento complementar recém-enviado ao Storage. Nunca permite update/delete (ver policies). */
export async function registrarDocumentoCaso({ casoId, userId, nome, mimeType, categoria, storagePath, tamanhoBytes }) {
  if (!casoId || !userId || !storagePath) return null;
  try {
    const { data, error } = await supabase
      .from('documentos_caso')
      .insert({
        caso_id: casoId,
        user_id: userId,
        nome: nome || null,
        mime_type: mimeType || null,
        categoria: categoria || null,
        storage_path: storagePath,
        tamanho_bytes: tamanhoBytes ?? null,
      })
      .select('id, nome, mime_type, categoria, storage_path, tamanho_bytes, adicionado_em')
      .single();
    if (error) {
      console.warn('[casos] Falha ao registrar documento do caso:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[casos] Erro inesperado ao registrar documento do caso:', err);
    return null;
  }
}

/** Registra em lote os documentos da PRIMEIRA análise de um caso recém-criado. */
export async function registrarDocumentosIniciais({ casoId, userId, documentos }) {
  if (!casoId || !userId || !Array.isArray(documentos) || documentos.length === 0) return;

  const linhas = documentos
    .filter((d) => d?.storage_path)
    .map((d) => ({
      caso_id: casoId,
      user_id: userId,
      nome: d.nome || null,
      mime_type: d.mime_type || null,
      categoria: d.categoria || null,
      storage_path: d.storage_path,
      tamanho_bytes: d.tamanho_bytes ?? null,
    }));
  if (linhas.length === 0) return;

  try {
    const { error } = await supabase.from('documentos_caso').insert(linhas);
    if (error) console.warn('[casos] Falha ao registrar documentos iniciais do caso:', error.message);
  } catch (err) {
    console.error('[casos] Erro inesperado ao registrar documentos iniciais:', err);
  }
}

/** Lista as versões (análises) de um caso, mais recente primeiro. */
export async function listarVersoesCaso(casoId) {
  if (!casoId) return [];
  try {
    const { data, error } = await supabase
      .from('analises')
      .select('id, created_at, titulo, resumo, versao')
      .eq('caso_id', casoId)
      .order('versao', { ascending: false });
    if (error) {
      console.warn('[casos] Falha ao listar versões do caso:', error.message);
      return [];
    }
    return data ?? [];
  } catch (err) {
    console.error('[casos] Erro inesperado ao listar versões do caso:', err);
    return [];
  }
}

/**
 * Exclusão completa de um caso — LGPD ("direito ao esquecimento").
 *
 * `documentos_caso` e `documento_chunks` são insert-only para o cliente (sem
 * policy de update/delete, de propósito, contra fraude — ver README). Por
 * isso essa exclusão só é possível através da RPC `excluir_caso_completo`
 * (SECURITY DEFINER): é a ÚNICA via que consegue apagar essas duas tabelas,
 * e só apaga o caso do PRÓPRIO usuário chamador. Ela também apaga `casos` e
 * TODAS as versões em `analises` daquele caso, e devolve os `storage_path`
 * para o chamador remover do Storage em seguida (isso o Postgres não faz
 * sozinho).
 * @returns {Promise<{ ok: boolean, storagePaths: string[] }>}
 */
export async function excluirCasoCompleto(casoId) {
  if (!casoId) return { ok: false, storagePaths: [] };
  try {
    const { data, error } = await supabase.rpc('excluir_caso_completo', { p_caso_id: casoId });
    if (error) {
      console.error('[casos] Falha ao excluir caso completo:', error.message);
      return { ok: false, storagePaths: [] };
    }
    // `returns table (storage_paths text[])` -> supabase-js devolve uma
    // única linha num array: [{ storage_paths: [...] }].
    const storagePaths = data?.[0]?.storage_paths ?? [];
    return { ok: true, storagePaths: Array.isArray(storagePaths) ? storagePaths : [] };
  } catch (err) {
    console.error('[casos] Erro inesperado ao excluir caso completo:', err);
    return { ok: false, storagePaths: [] };
  }
}
