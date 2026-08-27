// src/lib/prepararDocumentos.js
//
// Prepara os arquivos do usuário ANTES de subir para o Supabase Storage:
//   - Imagens grandes são reduzidas no browser (canvas → JPEG). Uma foto de
//     documento de 6 MB costuma cair para 300–600 KB mantendo o texto legível.
//   - PDFs passam sem alteração (não dá para recomprimir no browser sem libs
//     pesadas — e a Files API do Gemini aceita PDF grande de qualquer forma).

// Limite do TOTAL de documentos por análise. Agora o arquivo vai direto para o
// Supabase Storage (não passa mais pelo corpo de uma Function), então o teto é
// bem maior — limitado pela Files API do Gemini e por bom senso de custo/latência.
export const LIMITE_TOTAL_DOCS = 45 * 1024 * 1024; // 45 MB no total da análise
export const MAX_PDF_BYTES = 30 * 1024 * 1024; // 30 MB por arquivo (limite do bucket do Storage)
export const MAX_IMAGEM_BYTES = 30 * 1024 * 1024; // 30 MB por arquivo (antes de comprimir)

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
