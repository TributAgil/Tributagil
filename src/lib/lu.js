// src/lib/lu.js
//
// Cliente do chatbot RAG "Lu" (/api/lu) e do disparo de indexação de
// documentos de um caso (/api/indexar-caso). Segue o mesmo padrão de
// autenticação de src/pages/CerebroTributario.jsx: o token de sessão do
// usuário viaja no corpo da requisição, o backend valida contra o Supabase
// Auth e todo o retrieval é escopado ao caso do próprio usuário.

import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';
import { listarDocumentosCaso } from './casos';

async function tokenDaSessao() {
  const { data: sess } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  return sess?.session?.access_token || null;
}

/**
 * `casoId` escopa o retrieval (documentos + legislação); `analiseId`
 * escopa a COTA de perguntas — é por consulta (cada versão/reanálise tem
 * as suas 10 próprias), não por caso. Ver README, "Custo do Lu".
 * @param {{ casoId: string, analiseId: string, pergunta: string, historico?: Array<{papel: 'usuario'|'lu', texto: string}> }} args
 * @returns {Promise<{ resposta: string, fontes: Array<object>, perguntasDisponiveis?: number, limiteAtingido?: boolean }>}
 */
export async function perguntarLu({ casoId, analiseId, pergunta, historico = [] }) {
  const userToken = await tokenDaSessao();
  if (!userToken) throw new Error('Sessão expirada. Faça login novamente.');

  const resposta = await fetch('/api/lu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ casoId, analiseId, pergunta, historico, supabaseUrl, supabaseAnonKey, userToken }),
  });

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(dados.error || 'Não foi possível falar com o Lu agora.');
  }
  return dados;
}

/**
 * Dispara a indexação de documentos de um caso na base vetorial.
 *
 * Por padrão (`manual: false`, o caso de uso normal — logo após salvar uma
 * análise, ou ao confirmar um upload complementar) é "fire-and-forget": não
 * lança, não bloqueia a UI, e usa `keepalive` para sobreviver a uma
 * navegação rápida do usuário (o fetch normal seria abortado ao trocar de
 * tela).
 *
 * Com `manual: true` (botão "Reindexar documentos" na aba do Lu) devolve o
 * resultado para a UI dar feedback — seguro de chamar quantas vezes for
 * preciso: a indexação é idempotente (documento já indexado é pulado sem
 * gastar IA de novo).
 *
 * @param {{ casoId: string, documentos: Array<object>, manual?: boolean }} args
 * @returns {Promise<{ok: boolean, chunks_indexados?: number, documentos_pulados?: number, error?: string} | undefined>}
 */
export async function indexarCaso({ casoId, documentos, manual = false }) {
  if (!casoId || !Array.isArray(documentos) || documentos.length === 0) {
    return manual ? { ok: false, error: 'Nenhum documento para indexar.' } : undefined;
  }

  try {
    const userToken = await tokenDaSessao();
    if (!userToken) {
      if (manual) throw new Error('Sessão expirada. Faça login novamente.');
      return;
    }

    const resposta = await fetch('/api/indexar-caso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ casoId, documentos, supabaseUrl, supabaseAnonKey, userToken }),
      keepalive: true,
    });

    if (!manual) return;

    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.error || 'Não foi possível indexar os documentos agora.');
    return { ok: true, ...dados };
  } catch (err) {
    console.warn('[lu] Falha ao indexar caso:', err);
    if (manual) return { ok: false, error: err.message || 'Não foi possível indexar os documentos agora.' };
  }
}

/**
 * Reindexação manual: busca TODOS os documentos já anexados ao caso e
 * dispara a indexação de novo. Seguro/barato mesmo que a maioria já esteja
 * indexada — cada documento já indexado é pulado sem gastar IA (ver
 * api/indexar-caso.js).
 * @param {string} casoId
 */
export async function reindexarCaso(casoId) {
  const docs = await listarDocumentosCaso(casoId);
  const documentos = docs.map((d) => ({ nome: d.nome, mime_type: d.mime_type, storage_path: d.storage_path }));
  return indexarCaso({ casoId, documentos, manual: true });
}
