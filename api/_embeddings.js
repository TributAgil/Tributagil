// api/_embeddings.js
//
// Helper de embeddings, compartilhado por /api/lu (pergunta do usuário) e
// /api/indexar-caso (chunks de documentos + legislação). Usa o mesmo
// GEMINI_API_KEY do motor de análise — nenhuma credencial nova.
//
// Modelo: text-embedding-004 (768 dimensões) — precisa bater com o `vector(768)`
// das colunas `embedding` no Supabase (ver README).
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

const GEMINI = 'https://generativelanguage.googleapis.com';
const MODELO_EMBEDDING = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';
export const DIMENSOES_EMBEDDING = 768;

/**
 * Gera o vetor de embedding de um texto.
 * @param {string} texto
 * @returns {Promise<number[]>}
 */
export async function gerarEmbedding(texto) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');

  const corpo = JSON.stringify({
    model: `models/${MODELO_EMBEDDING}`,
    content: { parts: [{ text: String(texto || '').slice(0, 8000) }] },
    outputDimensionality: DIMENSOES_EMBEDDING,
  });

  // 1 retry para 429/503 (mesma tolerância usada em api/gemini.js).
  const ESPERAS_MS = [1500];
  for (let tentativa = 0; ; tentativa++) {
    const resp = await fetch(
      `${GEMINI}/v1beta/models/${MODELO_EMBEDDING}:embedContent?key=${encodeURIComponent(apiKey)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo },
    );

    if (resp.ok) {
      const data = await resp.json();
      const valores = data?.embedding?.values;
      if (!Array.isArray(valores)) throw new Error('Resposta de embedding sem "embedding.values".');
      return valores;
    }

    const transitorio = [429, 500, 503].includes(resp.status);
    if (!transitorio || tentativa >= ESPERAS_MS.length) {
      const detalhe = await resp.text().catch(() => '');
      throw new Error(`Falha ao gerar embedding (HTTP ${resp.status}): ${detalhe.slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, ESPERAS_MS[tentativa]));
  }
}
