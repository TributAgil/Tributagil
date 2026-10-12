// src/lib/escritorio.js
//
// Cadastro do escritório (timbrado e assinatura da peça). Tabela `escritorios`
// com RLS de leitura/escrita própria; logo opcional no bucket PRÓPRIO `logos`
// (o bucket `documentos` tem uma limpeza diária que apaga o que não está
// vinculado a um caso — o logo sumiria). SQL no README.
//
// Nada aqui lança: devolve { ok, erro } para a interface mostrar.

import { supabase } from './supabase';

export const BUCKET_LOGOS = 'logos';
export const MAX_BYTES_LOGO = 1024 * 1024;
export const MAX_ADVOGADOS = 20;
const TIPOS_LOGO = { 'image/png': 'png', 'image/jpeg': 'jpg' };

export const escritorioVazio = () => ({
  nome: '',
  cidade: '',
  uf: '',
  email: '',
  site: '',
  endereco: '',
  logo_path: null,
  advogados: [{ nome: '', oab: '', uf: '' }],
});

/** @returns {Promise<object|null>} o cadastro, ou null se ainda não existe */
export async function lerEscritorio(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.from('escritorios').select('*').eq('user_id', userId).maybeSingle();
  if (error) {
    console.warn('[escritorio] Falha ao ler o cadastro:', error.message);
    return null;
  }
  return data || null;
}

/** Remove linhas de advogado vazias e normaliza UF; devolve só o que vira assinatura. */
export function limparAdvogados(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map((a) => ({ nome: String(a?.nome || '').trim(), oab: String(a?.oab || '').trim(), uf: String(a?.uf || '').trim().toUpperCase() }))
    .filter((a) => a.nome || a.oab)
    .slice(0, MAX_ADVOGADOS);
}

/** Validação de tela (o banco repete as regras como constraints). */
export function validarEscritorio(e) {
  const erros = [];
  if (!String(e?.nome || '').trim()) erros.push('Informe o nome do escritório.');
  if (e?.uf && !/^[A-Za-z]{2}$/.test(String(e.uf).trim())) erros.push('UF deve ter 2 letras (ex.: BA).');
  if (e?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e.email).trim())) erros.push('E-mail inválido.');
  for (const a of limparAdvogados(e?.advogados)) {
    if (!a.nome) erros.push('Todo advogado precisa de nome.');
    if (!a.oab) erros.push(`Informe o número da OAB de ${a.nome || 'cada advogado'}.`);
    if (a.uf && !/^[A-Z]{2}$/.test(a.uf)) erros.push(`UF da OAB inválida (${a.uf}).`);
  }
  return [...new Set(erros)];
}

export async function salvarEscritorio(userId, e) {
  if (!userId) return { ok: false, erro: 'Sessão expirada. Faça login novamente.' };
  const erros = validarEscritorio(e);
  if (erros.length) return { ok: false, erro: erros.join(' ') };

  const registro = {
    user_id: userId,
    nome: e.nome.trim(),
    cidade: (e.cidade || '').trim() || null,
    uf: (e.uf || '').trim().toUpperCase() || null,
    email: (e.email || '').trim() || null,
    site: (e.site || '').trim() || null,
    endereco: (e.endereco || '').trim() || null,
    logo_path: e.logo_path || null,
    advogados: limparAdvogados(e.advogados),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('escritorios').upsert(registro, { onConflict: 'user_id' });
  if (error) {
    console.warn('[escritorio] Falha ao salvar:', error.message);
    return { ok: false, erro: 'Não foi possível salvar o cadastro agora. Tente novamente.' };
  }
  return { ok: true };
}

/** Envia o logo (PNG/JPEG até 1 MB) e devolve o caminho a gravar em `logo_path`. */
export async function enviarLogo(userId, arquivo) {
  const ext = TIPOS_LOGO[arquivo?.type];
  if (!ext) return { ok: false, erro: 'O logo precisa ser PNG ou JPG.' };
  if (arquivo.size > MAX_BYTES_LOGO) return { ok: false, erro: 'O logo precisa ter no máximo 1 MB.' };

  const caminho = `${userId}/logo.${ext}`;
  const { error } = await supabase.storage.from(BUCKET_LOGOS).upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });
  if (error) {
    console.warn('[escritorio] Falha ao enviar o logo:', error.message);
    return { ok: false, erro: 'Não foi possível enviar o logo agora.' };
  }
  // logo anterior com a outra extensão não fica órfão
  const outro = ext === 'png' ? 'jpg' : 'png';
  await supabase.storage.from(BUCKET_LOGOS).remove([`${userId}/logo.${outro}`]).catch(() => {});
  return { ok: true, caminho };
}

/** URL temporária só para pré-visualizar o logo na tela de cadastro. */
export async function urlDoLogo(caminho) {
  if (!caminho) return null;
  const { data } = await supabase.storage.from(BUCKET_LOGOS).createSignedUrl(caminho, 300);
  return data?.signedUrl || null;
}
