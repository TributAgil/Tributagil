// src/lib/luPeca.js
//
// Cliente do "Pedir ao Lu" do editor da peça (api/lu-peca.js): reescrever, fundamentar ou preencher UM parágrafo.
// Devolve uma PROPOSTA; quem aplica (ou não) é o advogado, no editor.

import { supabase } from './supabase';

export const ACOES_LU = {
  reescrever: { rotulo: 'Reescrever o trecho', dica: 'Mais incisivo, mais conciso, mais formal… diga como.' },
  fundamentar: { rotulo: 'Reforçar a fundamentação', dica: 'Artigo, súmula ou tema da base de legislação do TributÁgil, citado exatamente.' },
  preencher: { rotulo: 'Preencher campo amarelo', dica: 'Completa os [PREENCHER] com o que a análise já extraiu; o que não houver, fica.' },
};

/**
 * @param {{ analiseId: string, acao: 'reescrever'|'fundamentar'|'preencher', paragrafo: string, topico?: string,
 *   instrucao?: string, resumoPeca?: object }} args
 * @returns {Promise<{ ok: boolean, encontrou?: boolean, texto?: string, explicacao?: string, fontes?: string[], error?: string }>}
 */
export async function pedirAoLu({ analiseId, acao, paragrafo, topico = '', instrucao = '', resumoPeca = {} }) {
  const { data: sess } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  const token = sess?.session?.access_token;
  if (!token) return { ok: false, error: 'Sessão expirada. Faça login novamente.' };
  try {
    const resposta = await fetch('/api/lu-peca', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ analise_id: analiseId, acao, paragrafo, topico, instrucao, resumo_peca: resumoPeca }),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) return { ok: false, error: dados.error || 'O Lu não conseguiu responder agora.' };
    return { ok: true, ...dados };
  } catch (err) {
    console.warn('[luPeca] Falha ao pedir ao Lu:', err);
    return { ok: false, error: 'Erro de rede ao falar com o Lu.' };
  }
}

/** O resumo da peça que vai junto (o que o sistema calculou: CDAs, períodos, datas), sem o que não ajuda o Lu. */
export function resumoParaLu(resumo) {
  if (!resumo || typeof resumo !== 'object') return {};
  const { modelo, tese, descricao, creditos, intercorrente, data_referencia } = resumo;
  return { modelo, tese, descricao, creditos, intercorrente, data_referencia };
}
