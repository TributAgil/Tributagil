// src/lib/peca.js
//
// Cliente da geração de PEÇA (api/gerar-peca.js). A regra de negócio fica no
// servidor (motor determinístico); aqui só o que decide se o botão aparece,
// a chamada e o download do arquivo.

import { supabase } from './supabase';

export const MSG_SEM_MODELO = 'Modelo de peça ainda não disponível para este cenário';

/**
 * Único ponto onde plano/perfil pode limitar a geração de peça. Hoje a
 * funcionalidade não é amarrada a plano — por isso retorna sempre true.
 */
// eslint-disable-next-line no-unused-vars
export function podeGerarPeca(perfil) {
  return true;
}

const AUSENTE = new Set(['', '—', 'não identificado', 'nao identificado', 'n/a', 'null', 'undefined']);
const preenchido = (v) => typeof v === 'string' && !AUSENTE.has(v.trim().toLowerCase());

const favorecida = (resultado, tipo) =>
  (resultado?.conclusoes || []).some((c) => c?.tipo === tipo && c?.severidade === 'favoravel');

/** O botão só aparece com conclusão FAVORÁVEL de prescrição, decadência ou prescrição intercorrente no parecer. */
export function temConclusaoFavoravel(resultado) {
  return favorecida(resultado, 'prescricao') || favorecida(resultado, 'decadencia') || favorecida(resultado, 'prescricao_intercorrente');
}

/**
 * Antes de qualquer chamada: com os 5 modelos a matriz está completa, então só a
 * prescrição INTERCORRENTE depende de execução (não existe intercorrente administrativa).
 * A decisão final é do servidor (api/_motor-peca.js), depois da extração dos fatos.
 */
export function cenarioPrevio(resultado) {
  const soIntercorrente =
    favorecida(resultado, 'prescricao_intercorrente') && !favorecida(resultado, 'prescricao') && !favorecida(resultado, 'decadencia');
  const semExecucao = !preenchido(resultado?.metadata?.processo);
  if (soIntercorrente && semExecucao) return { disponivel: false, motivo: 'A prescrição intercorrente só existe com execução fiscal ajuizada: não há peça para este cenário.' };
  return { disponivel: true, motivo: '' };
}

/**
 * @returns {Promise<{ok: boolean, status?: string, pecas?: Array<{tese: string, tese_nome: string, status: string,
 *   template: string|null, resumo?: object, arquivo?: object, mensagem?: string, bloqueios?: string[],
 *   divergencias?: string[], avisos?: string[]}>, mensagem?: string, bloqueios?: string[],
 *   divergencias?: string[], avisos?: string[], error?: string}>}
 * Uma peça por tese: o modal lista as disponíveis e o usuário escolhe qual baixar.
 */
export async function gerarPeca({ analiseId, incluirBlocoDecretoLei = true, dadosPeca = null }) {
  const { data: sess } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  const token = sess?.session?.access_token;
  if (!token) return { ok: false, error: 'Sessão expirada. Faça login novamente.' };

  try {
    const resposta = await fetch('/api/gerar-peca', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ analise_id: analiseId, incluir_bloco_decreto_lei: incluirBlocoDecretoLei, dados_peca: dadosPeca }),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) return { ok: false, error: dados.error || 'Não foi possível gerar a peça agora.' };
    return { ok: true, ...dados };
  } catch (err) {
    console.warn('[peca] Falha ao gerar a peça:', err);
    return { ok: false, error: 'Erro de rede ao gerar a peça.' };
  }
}

/** Baixa o .docx devolvido pela API (base64) no navegador. */
export function baixarArquivo({ nome, mime, base64 }) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Resumo da peça gerada que o Lu lê (analises.peca_resumo). Guarda só números, nomes e avisos: nunca o arquivo
 * nem o texto jurídico dos modelos.
 * @returns {{ gerada_em: string, pecas: object[] } | null}
 */
export function resumoParaLu(resposta, agora = new Date()) {
  const prontas = (resposta?.pecas || []).filter((p) => p?.status === 'ok' && p.resumo);
  if (prontas.length === 0) return null;
  return {
    gerada_em: agora.toISOString(),
    pecas: prontas.map(({ resumo: r }) => ({
      modelo: r.modelo,
      tese: r.tese,
      descricao: r.descricao || '',
      data_referencia: r.data_referencia || '',
      campos_preencher: r.campos_preencher || 0,
      figuras: r.figuras || 0,
      a_confirmar: r.a_confirmar || 0,
      avisos: Array.isArray(r.avisos) ? r.avisos : [],
    })),
  };
}

/** Grava o resumo da peça na consulta (RLS do próprio usuário). Falha silenciosa: o Lu só fica sem saber da peça. */
export async function salvarResumoPeca({ analiseId, resposta }) {
  const resumo = resumoParaLu(resposta);
  if (!analiseId || !resumo) return false;
  try {
    const { error } = await supabase.from('analises').update({ peca_resumo: resumo }).eq('id', analiseId);
    if (error) {
      console.warn('[peca] Falha ao gravar o resumo da peça para o Lu:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[peca] Erro ao gravar o resumo da peça para o Lu:', err);
    return false;
  }
}
