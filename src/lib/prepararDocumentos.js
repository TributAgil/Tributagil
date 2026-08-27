// src/lib/prepararDocumentos.js
//
// Prepara os arquivos do usuário para envio à IA:
//   - Imagens grandes são reduzidas no browser (canvas) e re-exportadas como JPEG.
//     Uma foto de documento de 4 MB costuma cair para 200–400 KB sem perder
//     legibilidade do texto.
//   - PDFs passam sem alteração (não dá para recomprimir no browser sem libs
//     pesadas).
//   - Tudo vira base64 puro (sem o prefixo "data:...;base64,").
//
// LIMITE: a request para /api/gemini roda em Edge Function (teto de ~4 MB de
// corpo). Por isso o total de base64 é limitado no formulário. Para processos
// grandes, o caminho é subir os arquivos para o Supabase Storage e o backend
// lê de lá — fica como evolução.

// Limite do TOTAL de documentos por análise, medido em bytes decodificados.
// ~2,7 MB decodificado ≈ ~3,6 MB em base64 ≈ ~3,8 MB de corpo HTTP — abaixo do
// teto de ~4 MB da Edge Function.
export const LIMITE_TOTAL_DOCS = 2.7 * 1024 * 1024;
const MAX_DIMENSAO_PX = 2000; // lado maior da imagem após redução
const QUALIDADE_JPEG = 0.72;

/**
 * @param {File} file
 * @returns {Promise<{ mime: string, base64: string, bytes: number }>}
 */
export async function prepararArquivo(file) {
  const { blob, mime } = await comprimirSeImagem(file);
  const base64 = await blobParaBase64(blob);
  return { mime, base64, bytes: Math.floor((base64.length * 3) / 4) };
}

async function comprimirSeImagem(file) {
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

    // Se a "compressão" não ajudou (imagem já minúscula), mantém o original.
    if (blob && blob.size < file.size) {
      return { blob, mime: 'image/jpeg' };
    }
  } catch (err) {
    console.warn('[prepararDocumentos] Falha ao comprimir imagem, enviando original:', err);
  }

  return { blob: file, mime: file.type };
}

function blobParaBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      const virgula = s.indexOf(',');
      resolve(virgula >= 0 ? s.slice(virgula + 1) : s); // remove "data:...;base64,"
    };
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(blob);
  });
}

export function formatarBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
