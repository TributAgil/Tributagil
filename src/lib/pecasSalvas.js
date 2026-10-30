// src/lib/pecasSalvas.js
//
// Peças salvas no banco (SQL em docs/sql/pecas-salvas.sql): o .docx ORIGINAL que /api/gerar-peca devolveu fica no
// bucket `pecas` e uma linha em `pecas` (uma por análise e tese); cada "Aplicar à peça" do editor vira uma versão em
// `pecas_versoes` (as 3 últimas ficam), com as alterações de texto e os caminhos das imagens confirmadas. Reabrir a
// análise traz a peça salva sem chamar o Gemini.
//
// Caminhos no bucket (o primeiro segmento é sempre o próprio usuário: é o que a policy do Storage confere):
//   <user_id>/<analise_id>/<peca_id>/original.docx
//   <user_id>/<analise_id>/<peca_id>/figuras/<numero>-<carimbo>.<ext>
//
// Tudo "best-effort", como o resto do app: falha ao salvar nunca impede usar a peça na tela (devolve { ok: false }).

import { supabase } from './supabase';

// base64 <-> bytes aqui mesmo: este módulo entra na tela de Histórico (exclusão) e não deve puxar o leitor de Word
const base64ParaBytes = (base64) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
function bytesParaBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const BUCKET_PECAS = 'pecas';
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EXTENSAO = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

const pastaDaAnalise = (userId, analiseId) => `${userId}/${analiseId}`;
const pastaDaPeca = (userId, analiseId, pecaId) => `${pastaDaAnalise(userId, analiseId)}/${pecaId}`;

async function usuarioDaSessao() {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  return data?.session?.user?.id || null;
}

/** Todos os arquivos abaixo de uma pasta do bucket (o Storage só lista um nível por vez). */
async function listarArquivos(prefixo) {
  const arquivos = [];
  const LOTE = 1000;
  for (let offset = 0; ; offset += LOTE) {
    const { data, error } = await supabase.storage.from(BUCKET_PECAS).list(prefixo, { limit: LOTE, offset });
    if (error) throw new Error(error.message);
    for (const item of data || []) {
      const caminho = `${prefixo}/${item.name}`;
      if (item.id) arquivos.push(caminho);
      else arquivos.push(...(await listarArquivos(caminho))); // sem id = "pasta"
    }
    if (!data || data.length < LOTE) break;
  }
  return arquivos;
}

async function apagarPasta(prefixo) {
  const arquivos = await listarArquivos(prefixo);
  for (let i = 0; i < arquivos.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET_PECAS).remove(arquivos.slice(i, i + 100));
    if (error) throw new Error(error.message);
  }
  return arquivos.length;
}

// ---------------------------------------------------------------------------------------------------------------------
// Gravar a peça gerada (substitui a anterior)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Apaga as peças salvas desta análise (linhas, versões em cascata, e os arquivos). "Gerar de novo" substitui: o que
 * estava salvo some de vez.
 * @returns {Promise<boolean>}
 */
export async function apagarPecasDaAnalise({ userId, analiseId }) {
  const uid = userId || (await usuarioDaSessao());
  if (!uid || !analiseId) return false;
  try {
    const { error } = await supabase.from('pecas').delete().eq('analise_id', analiseId);
    if (error) throw new Error(error.message);
  } catch (err) {
    console.warn('[pecasSalvas] Falha ao apagar as peças da análise:', err?.message);
    return false;
  }
  // os arquivos: se falhar aqui, a limpeza diária (scripts/limpar-orfaos-storage.mjs) remove os que ficaram sem peça
  try {
    await apagarPasta(pastaDaAnalise(uid, analiseId));
  } catch (err) {
    console.warn('[pecasSalvas] Arquivos das peças não removidos agora (a limpeza diária remove):', err?.message);
  }
  return true;
}

/**
 * Grava as peças disponíveis de uma geração, no lugar das que estavam salvas para esta análise.
 * @param {{ userId: string, analiseId: string, pecas: object[] }} args  `pecas`: as de status 'ok' de /api/gerar-peca
 * @returns {Promise<{ ok: boolean, salvas: Record<string, { id: string, versao: number, atualizadaEm: string }> }>}
 */
export async function salvarPecasGeradas({ userId, analiseId, pecas }) {
  const salvas = {};
  if (!userId || !analiseId || !pecas?.length) return { ok: false, salvas };
  if (!(await apagarPecasDaAnalise({ userId, analiseId }))) return { ok: false, salvas };
  let ok = true;
  for (const p of pecas) {
    const id = crypto.randomUUID();
    const caminho = `${pastaDaPeca(userId, analiseId, id)}/original.docx`;
    try {
      const { error: erroArquivo } = await supabase.storage
        .from(BUCKET_PECAS)
        .upload(caminho, base64ParaBytes(p.arquivo.base64), { contentType: MIME_DOCX, upsert: false });
      if (erroArquivo) throw new Error(erroArquivo.message);
      const { data, error } = await supabase
        .from('pecas')
        .insert({
          id,
          user_id: userId,
          analise_id: analiseId,
          tese: p.tese,
          template: p.template,
          titulo: String(p.resumo?.modelo || '').slice(0, 200) || null,
          original_path: caminho,
          nome_arquivo: String(p.arquivo.nome || '').slice(0, 200) || null,
          resumo: { ...(p.resumo || {}), tese_nome: p.tese_nome || '' },
          figuras: p.figuras || [],
        })
        .select('id, versao_atual, updated_at')
        .single();
      if (error) {
        await supabase.storage.from(BUCKET_PECAS).remove([caminho]);
        throw new Error(error.message);
      }
      salvas[p.tese] = { id: data.id, versao: data.versao_atual, atualizadaEm: data.updated_at };
    } catch (err) {
      ok = false;
      console.warn('[pecasSalvas] Falha ao salvar a peça', p.tese, err?.message);
    }
  }
  return { ok, salvas };
}

// ---------------------------------------------------------------------------------------------------------------------
// Versões
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Grava uma versão (o que o editor aplicou). Só sobe as imagens que ainda não têm caminho no bucket; as que vieram
 * de uma versão anterior são reaproveitadas pelo caminho.
 * @param {{ userId: string, analiseId: string, pecaId: string, estado: object, total: number,
 *   imagens: Record<number, { blob: Blob, path?: string, origem?: string, documento?: string, pagina?: number, caixa?: number[] }>,
 *   figurasConfirmadas: number, localizacao?: object|null }} args
 * @returns {Promise<{ ok: boolean, versao?: number, imagens?: object }>}  `imagens`: as mesmas, agora com `path`
 */
export async function salvarVersao({ userId, analiseId, pecaId, estado, total, imagens = {}, figurasConfirmadas, localizacao }) {
  if (!userId || !analiseId || !pecaId) return { ok: false };
  try {
    const comCaminho = {};
    for (const [numero, img] of Object.entries(imagens)) {
      let path = img.path;
      if (!path) {
        const ext = EXTENSAO[img.blob?.type] || 'png';
        path = `${pastaDaPeca(userId, analiseId, pecaId)}/figuras/${numero}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from(BUCKET_PECAS)
          .upload(path, img.blob, { contentType: img.blob?.type || 'image/png', upsert: false });
        if (error) throw new Error(error.message);
      }
      comCaminho[numero] = { ...img, path };
    }
    const meta = Object.fromEntries(
      Object.entries(comCaminho).map(([n, { path, origem, documento, pagina, caixa }]) => [
        n,
        { path, origem: origem || '', documento: documento || '', pagina: pagina ?? null, caixa: caixa ?? null },
      ]),
    );
    const { data: versao, error } = await supabase.rpc('salvar_versao_peca', {
      p_peca_id: pecaId,
      p_alteracoes: estado || {},
      p_imagens: meta,
      p_total_alteracoes: total || 0,
      p_figuras_confirmadas: figurasConfirmadas || 0,
    });
    if (error) throw new Error(error.message);
    if (localizacao) await salvarLocalizacao({ pecaId, localizacao });
    return { ok: true, versao, imagens: comCaminho };
  } catch (err) {
    console.warn('[pecasSalvas] Falha ao salvar a versão da peça:', err?.message);
    return { ok: false };
  }
}

/** Guarda a busca das figuras (para não chamar o Gemini de novo ao reabrir). */
export async function salvarLocalizacao({ pecaId, localizacao }) {
  if (!pecaId || !localizacao) return false;
  const { error } = await supabase.from('pecas').update({ localizacao }).eq('id', pecaId);
  if (error) console.warn('[pecasSalvas] Falha ao guardar a busca das figuras:', error.message);
  return !error;
}

// ---------------------------------------------------------------------------------------------------------------------
// Reabrir
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Peças salvas desta análise, já prontas para a tela: o arquivo original (base64), o resumo e, da última versão, as
 * alterações e as imagens (Blob + caminho). Nenhuma IA é chamada.
 * @returns {Promise<Array<{ id: string, tese: string, tese_nome: string, template: string, resumo: object,
 *   figuras: object[], arquivo: object, localizacao: object|null, versao: number, atualizadaEm: string,
 *   ultima: { estado: object, imagens: object, total: number, figurasConfirmadas: number } | null }>>}
 */
export async function carregarPecasSalvas(analiseId) {
  if (!analiseId) return [];
  try {
    const { data: pecas, error } = await supabase
      .from('pecas')
      .select('id, tese, template, titulo, original_path, nome_arquivo, resumo, figuras, localizacao, versao_atual, updated_at')
      .eq('analise_id', analiseId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    if (!pecas?.length) return [];

    const { data: versoes } = await supabase
      .from('pecas_versoes')
      .select('peca_id, numero, alteracoes, imagens, total_alteracoes, figuras_confirmadas, criada_em')
      .in('peca_id', pecas.map((p) => p.id))
      .order('numero', { ascending: false });
    const ultimaDe = new Map();
    for (const v of versoes || []) if (!ultimaDe.has(v.peca_id)) ultimaDe.set(v.peca_id, v);

    const saida = [];
    for (const p of pecas) {
      const { data: blob, error: erroArquivo } = await supabase.storage.from(BUCKET_PECAS).download(p.original_path);
      if (erroArquivo || !blob) {
        console.warn('[pecasSalvas] Word original da peça não encontrado:', p.original_path);
        continue;
      }
      const v = ultimaDe.get(p.id);
      const imagens = {};
      for (const [numero, meta] of Object.entries(v?.imagens || {})) {
        if (!meta?.path) continue;
        const { data: img } = await supabase.storage.from(BUCKET_PECAS).download(meta.path);
        if (img) imagens[numero] = { ...meta, blob: img };
      }
      saida.push({
        id: p.id,
        tese: p.tese,
        tese_nome: p.resumo?.tese_nome || p.tese,
        template: p.template,
        resumo: p.resumo || {},
        figuras: Array.isArray(p.figuras) ? p.figuras : [],
        arquivo: {
          nome: p.nome_arquivo || 'peca.docx',
          mime: MIME_DOCX,
          base64: bytesParaBase64(new Uint8Array(await blob.arrayBuffer())),
        },
        localizacao: p.localizacao || null,
        versao: v?.numero || 0,
        atualizadaEm: v?.criada_em || p.updated_at,
        ultima: v
          ? { estado: v.alteracoes || {}, imagens, total: v.total_alteracoes || 0, figurasConfirmadas: v.figuras_confirmadas || 0 }
          : null,
      });
    }
    return saida;
  } catch (err) {
    console.warn('[pecasSalvas] Falha ao carregar as peças salvas (tabela ausente ou sem acesso?):', err?.message);
    return [];
  }
}
