// src/lib/lu.js
//
// Cliente do chatbot RAG "Lu" (/api/lu) e do disparo de indexação de
// documentos de um caso (/api/indexar-caso). Segue o mesmo padrão de
// autenticação de src/pages/CerebroTributario.jsx: o token de sessão do
// usuário viaja no corpo da requisição, o backend valida contra o Supabase
// Auth e todo o retrieval é escopado ao caso do próprio usuário.

import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';

async function tokenDaSessao() {
  const { data: sess } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  return sess?.session?.access_token || null;
}

/**
 * @param {{ casoId: string, pergunta: string, historico?: Array<{papel: 'usuario'|'lu', texto: string}> }} args
 * @returns {Promise<{ resposta: string, fontes: Array<object> }>}
 */
export async function perguntarLu({ casoId, pergunta, historico = [] }) {
  const userToken = await tokenDaSessao();
  if (!userToken) throw new Error('Sessão expirada. Faça login novamente.');

  const resposta = await fetch('/api/lu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ casoId, pergunta, historico, supabaseUrl, supabaseAnonKey, userToken }),
  });

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(dados.error || 'Não foi possível falar com o Lu agora.');
  }
  return dados;
}

/**
 * Dispara (best-effort, sem bloquear a UI) a indexação de documentos de um
 * caso na base vetorial. Nunca lança — uma falha aqui não pode impedir o
 * usuário de ver o parecer ou seguir usando o app.
 * @param {{ casoId: string, documentos: Array<object> }} args
 */
export async function indexarCaso({ casoId, documentos }) {
  if (!casoId || !Array.isArray(documentos) || documentos.length === 0) return;
  try {
    const userToken = await tokenDaSessao();
    if (!userToken) return;
    await fetch('/api/indexar-caso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ casoId, documentos, supabaseUrl, supabaseAnonKey, userToken }),
    });
  } catch (err) {
    console.warn('[lu] Falha ao indexar caso (best-effort, não bloqueia o usuário):', err);
  }
}
