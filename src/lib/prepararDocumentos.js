// src/lib/prepararDocumentos.js
//
// Prepara os arquivos do usuário ANTES de subir para o Supabase Storage:
//   - Imagens grandes são reduzidas no browser (canvas → JPEG). Uma foto de
//     documento de 6 MB costuma cair para 300–600 KB mantendo o texto legível.
//   - PDFs passam sem alteração (não dá para recomprimir no browser sem libs
//     pesadas — e a Files API do Gemini aceita PDF grande de qualquer forma).

// Limite do TOTAL de documentos por análise. Os arquivos vão direto para o
// Supabase Storage, mas o backend os embute como `inline_data` na chamada ao
// Gemini — cujo teto de request é ~20 MB. Por isso ~12 MB de conteúdo.
// (Para processos maiores, o caminho é a Files API do Gemini — pendente de
//  ajuste de credencial.)
//
// IMPORTANTE: os 12 MB abaixo (total, PDF e imagem) precisam bater com
// `MAX_BYTES_POR_DOC`/`MAX_BYTES_TOTAL` em api/gemini.js e api/indexar-caso.js
// — antes a imagem entrava permitindo até 30 MB aqui, mas o backend já
// rejeitava (HTTP 413) qualquer arquivo acima de 12 MB DEPOIS de já ter
// descontado o crédito da análise. Deixando os dois lados tabelados em
// 12 MB, o problema nem chega a acontecer: o upload já é barrado na tela.
export const LIMITE_TOTAL_DOCS = 12 * 1024 * 1024; // 12 MB no total da análise
export const MAX_PDF_BYTES = 12 * 1024 * 1024; // 12 MB por arquivo
export const MAX_IMAGEM_BYTES = 12 * 1024 * 1024; // 12 MB por arquivo (antes da compressão)

const MAX_DIMENSAO_PX = 2600; // lado maior da imagem após a redução
const QUALIDADE_JPEG = 0.75;

/**
 * Comprime a imagem (se for imagem). PDFs e outros formatos passam direto.
 * @param {File} file
 * @returns {Promise<{ blob: Blob, mime: string }>}
 */
export async function comprimirImagem(file) {
  if (file.type === 'application/pdf') {
    return { blob: file, mime: 'application/pdf' };
  }
  if (!file.type.startsWith('image/')) {
    return { blob: file, mime: file.type || 'application/octet-stream' };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX_DIMENSAO_PX / Math.max(bitmap.width, bitmap.height));
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close?.();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALIDADE_JPEG),
    );

    if (blob && blob.size < file.size) {
      return { blob, mime: 'image/jpeg' };
    }
  } catch (err) {
    console.warn('[prepararDocumentos] Falha ao comprimir imagem, enviando original:', err);
  }

  return { blob: file, mime: file.type };
}

export function formatarBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
