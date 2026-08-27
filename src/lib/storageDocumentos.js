// src/lib/storageDocumentos.js
//
// Sobe/remove os documentos de uma análise no Supabase Storage.
//
// Caminho: <user_id>/<analise_id>/<file_id>_<nome>
// A RLS do bucket garante que cada usuário só acessa a própria pasta
// (o primeiro segmento do caminho tem que bater com auth.uid()).

import { supabase, BUCKET_DOCUMENTOS } from './supabase';
import { comprimirImagem } from './prepararDocumentos';

const DIACRITICOS_RE = new RegExp('[\\u0300-\\u036f]', 'g');

function nomeSeguro(nome) {
  return String(nome || 'arquivo')
    .normalize('NFD')
    .replace(DIACRITICOS_RE, '') // remove acentos
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 80);
}

/**
 * Comprime (se imagem) e sobe um arquivo para o Storage.
 * @returns {Promise<{ storagePath: string, mime: string, tamanho: number }>}
 */
export async function uploadDocumento({ userId, analiseId, fileId, file }) {
  if (!userId) throw new Error('Usuário não autenticado.');

  const { blob, mime } = await comprimirImagem(file);
  const storagePath = `${userId}/${analiseId}/${fileId}_${nomeSeguro(file.name)}`;

  const { error } = await supabase.storage.from(BUCKET_DOCUMENTOS).upload(storagePath, blob, {
    contentType: mime,
    upsert: true,
  });

  if (error) {
    if (/bucket not found/i.test(error.message)) {
      throw new Error(`O bucket "${BUCKET_DOCUMENTOS}" não existe no Supabase (ver README).`);
    }
    throw new Error(error.message || 'Falha ao enviar o arquivo para o Storage.');
  }

  return { storagePath, mime, tamanho: blob.size };
}

/** Remove arquivos do Storage. Best-effort — não lança. */
export async function removerDocumentos(paths) {
  const validos = (paths || []).filter(Boolean);
  if (validos.length === 0) return;
  try {
    await supabase.storage.from(BUCKET_DOCUMENTOS).remove(validos);
  } catch (err) {
    console.warn('[storageDocumentos] Falha ao remover do Storage:', err);
  }
}
