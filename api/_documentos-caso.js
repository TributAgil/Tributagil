// api/_documentos-caso.js
//
// Documentos que o advogado enviou na análise (PDF e imagem, bucket `documentos`), baixados com o TOKEN DO USUÁRIO
// (RLS: só os dele) para irem junto ao Gemini na "Conversa com o Lu". Sem indexação nem embeddings: o arquivo vai
// inteiro, e o custo dele é estimado ANTES (páginas × tokens por página) para a reserva de créditos do pedido.

const BUCKET_DOCUMENTOS = 'documentos';
const MIMES_LEGIVEIS = /^(application\/pdf|image\/(png|jpe?g|webp))$/i;
export const MAX_BYTES_DOCUMENTOS = 12 * 1024 * 1024;
export const MAX_DOCUMENTOS = 20;
// estimativas folgadas (o Gemini cobra por página de PDF e por imagem); servem só para a reserva, o gasto real vem
// do usageMetadata da resposta
const TOKENS_POR_PAGINA = 600;
const TOKENS_POR_IMAGEM = 1200;
const BYTES_POR_PAGINA_SEM_CONTAGEM = 60 * 1024;

/**
 * Quantas páginas tem o PDF, pelos objetos "/Type /Page" do arquivo. PDF com objetos compactados não mostra esses
 * objetos: aí a conta sai pelo tamanho (folgada).
 */
export function paginasDoPdf(bytes) {
  const texto = Buffer.from(bytes).toString('latin1');
  const contadas = (texto.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
  return contadas || Math.max(1, Math.ceil(bytes.byteLength / BYTES_POR_PAGINA_SEM_CONTAGEM));
}

/** Tokens estimados de um documento já lido. */
export function tokensEstimados(doc) {
  return /pdf/i.test(doc.mime_type) ? doc.paginas * TOKENS_POR_PAGINA : TOKENS_POR_IMAGEM;
}

/**
 * Baixa os documentos legíveis da análise (payload.documentos). Arquivo que sumiu do Storage é pulado; tipo que o
 * Gemini não lê (Word, planilha) também. Para no limite de bytes: o que passar dele fica de fora e é avisado.
 * @returns {Promise<{ lidos: Array<{ nome: string, mime_type: string, base64: string, paginas: number }>, deFora: string[] }>}
 */
export async function baixarDocumentosDoCaso({ supabaseUrl, anonKey, userToken, documentos }) {
  const lidos = [];
  const deFora = [];
  let bytesTotal = 0;
  const lista = (Array.isArray(documentos) ? documentos : []).filter((d) => d?.storage_path);
  for (const [i, d] of lista.entries()) {
    const nome = String(d.nome || String(d.storage_path).split('/').pop());
    if (i >= MAX_DOCUMENTOS) {
      deFora.push(nome);
      continue;
    }
    const mimeDeclarado = String(d.mime_type || '').split(';')[0].trim();
    if (mimeDeclarado && !MIMES_LEGIVEIS.test(mimeDeclarado)) {
      deFora.push(nome);
      continue;
    }
    const caminho = String(d.storage_path).replace(/^\/+/, '');
    const resp = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET_DOCUMENTOS}/${caminho.split('/').map(encodeURIComponent).join('/')}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${userToken}` },
    });
    if (!resp.ok) {
      deFora.push(nome);
      continue;
    }
    const buffer = await resp.arrayBuffer();
    const mime = mimeDeclarado || String(resp.headers.get('content-type') || '').split(';')[0].trim();
    if (!MIMES_LEGIVEIS.test(mime) || bytesTotal + buffer.byteLength > MAX_BYTES_DOCUMENTOS) {
      deFora.push(nome);
      continue;
    }
    bytesTotal += buffer.byteLength;
    lidos.push({
      nome,
      mime_type: mime,
      base64: Buffer.from(buffer).toString('base64'),
      paginas: /pdf/i.test(mime) ? paginasDoPdf(buffer) : 1,
    });
  }
  return { lidos, deFora };
}
