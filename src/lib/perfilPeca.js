// src/lib/perfilPeca.js
//
// "Últimos dados utilizados" nas peças: o que o advogado informa à mão ao gerar uma peça fica salvo e volta
// preenchido na próxima, e o servidor (api/gerar-peca.js) também o usa quando o formulário vem em branco.
//
//   - do ESCRITÓRIO (escritorios.perfil_peca): nº do Doc. do mandato;
//   - do CASO       (casos.dados_peca):        qualificação do cliente.
//
// Tudo "best-effort": falha de leitura/gravação nunca impede gerar a peça (devolve vazio / false).
// SQL das duas colunas no README (seção "Perfil da peça").

import { supabase } from './supabase';

export const CAMPOS_CLIENTE = [
  { chave: 'nome', rotulo: 'Nome completo', maxLength: 160 },
  { chave: 'documento', rotulo: 'CPF/CNPJ', maxLength: 30 },
  { chave: 'nacionalidade', rotulo: 'Nacionalidade', maxLength: 60 },
  { chave: 'estado_civil', rotulo: 'Estado civil', maxLength: 60 },
  { chave: 'profissao', rotulo: 'Profissão', maxLength: 80 },
  { chave: 'endereco', rotulo: 'Endereço completo', maxLength: 300 },
];

export const perfilPecaVazio = () => ({
  doc_mandato: '',
  cliente: Object.fromEntries(CAMPOS_CLIENTE.map((c) => [c.chave, ''])),
});

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

function normalizar(entrada) {
  const base = perfilPecaVazio();
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const c = e.cliente && typeof e.cliente === 'object' ? e.cliente : {};
  base.doc_mandato = texto(e.doc_mandato);
  for (const { chave } of CAMPOS_CLIENTE) base.cliente[chave] = texto(c[chave]);
  return base;
}

async function casoDaAnalise(analiseId) {
  if (!analiseId) return null;
  const { data } = await supabase.from('analises').select('caso_id').eq('id', analiseId).maybeSingle();
  return data?.caso_id || null;
}

/** Lê os últimos dados usados: Doc. do mandato (escritório) + qualificação do cliente (caso desta análise). */
export async function lerPerfilPeca({ userId, analiseId }) {
  const perfil = perfilPecaVazio();
  try {
    const { data: esc } = await supabase.from('escritorios').select('perfil_peca').eq('user_id', userId).maybeSingle();
    perfil.doc_mandato = normalizar(esc?.perfil_peca).doc_mandato;
    const casoId = await casoDaAnalise(analiseId);
    if (casoId) {
      const { data: caso } = await supabase.from('casos').select('dados_peca').eq('id', casoId).maybeSingle();
      perfil.cliente = normalizar({ cliente: caso?.dados_peca?.cliente }).cliente;
    }
  } catch (err) {
    console.warn('[perfilPeca] Falha ao ler os últimos dados:', err?.message);
  }
  return perfil;
}

/**
 * Grava o que entrou na peça (`dados_peca_usados` devolvido por /api/gerar-peca) como "últimos dados
 * utilizados". Valor vazio nunca apaga um dado salvo.
 * @returns {Promise<boolean>} true se gravou tudo
 */
export async function salvarPerfilPeca({ userId, analiseId, usados }) {
  const u = normalizar(usados);
  let ok = true;
  try {
    if (u.doc_mandato) {
      const { error } = await supabase.from('escritorios').update({ perfil_peca: { doc_mandato: u.doc_mandato } }).eq('user_id', userId);
      if (error) ok = false;
    }
    const casoId = await casoDaAnalise(analiseId);
    if (casoId && Object.values(u.cliente).some(Boolean)) {
      const { data: atual } = await supabase.from('casos').select('dados_peca').eq('id', casoId).maybeSingle();
      const anterior = normalizar({ cliente: atual?.dados_peca?.cliente }).cliente;
      const cliente = { ...anterior };
      for (const [k, v] of Object.entries(u.cliente)) if (v) cliente[k] = v;
      const { error } = await supabase.from('casos').update({ dados_peca: { cliente } }).eq('id', casoId);
      if (error) ok = false;
    }
  } catch (err) {
    console.warn('[perfilPeca] Falha ao gravar os últimos dados:', err?.message);
    return false;
  }
  return ok;
}
