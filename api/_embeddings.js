// api/_embeddings.js
//
// Helper de embeddings, compartilhado por /api/lu (pergunta do usuário) e
// /api/indexar-caso (chunks de documentos + legislação). Usa o mesmo
// GEMINI_API_KEY do motor de análise — nenhuma credencial nova.
//
// Modelo: gemini-embedding-001 com outputDimensionality 768 — precisa bater com o
// `vector(768)` das colunas `embedding` no Supabase (ver README). O antigo
// text-embedding-004 foi desativado pelo Google (HTTP 404): se a variável
// GEMINI_EMBEDDING_MODEL ainda o trouxer, é ignorada e vale o padrão.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

const GEMINI = 'https://generativelanguage.googleapis.com';
const MODELO_PADRAO = 'gemini-embedding-001';
const MODELOS_DESATIVADOS = new Set(['text-embedding-004', 'embedding-001', 'embedding-gecko-001']);
export const MODELO_EMBEDDING = (() => {
  const pedido = String(process.env.GEMINI_EMBEDDING_MODEL || '').trim();
  if (!pedido) return MODELO_PADRAO;
  if (MODELOS_DESATIVADOS.has(pedido)) {
    console.warn(`[_embeddings] GEMINI_EMBEDDING_MODEL=${pedido} foi desativado pelo Google: usando ${MODELO_PADRAO}.`);
    return MODELO_PADRAO;
  }
  return pedido;
})();
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

// A API do Gemini aceita até 100 requests por chamada de :batchEmbedContents.
const TAMANHO_LOTE = 100;

/**
 * Gera os embeddings de VÁRIOS textos numa (ou em poucas) chamada(s) ao
 * Gemini, em vez de uma chamada por texto — é o que torna a indexação de um
 * documento com dezenas de chunks viável dentro do teto de tempo de uma
 * serverless function (menos round-trips = menos chance de estourar o
 * `maxDuration` e menos pontos de falha parcial).
 * @param {string[]} textos
 * @returns {Promise<number[][]>} um vetor por texto, na MESMA ordem de entrada
 */
export async function gerarEmbeddingsLote(textos) {
  if (!Array.isArray(textos) || textos.length === 0) return [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');

  const resultados = [];
  for (let inicio = 0; inicio < textos.length; inicio += TAMANHO_LOTE) {
    const lote = textos.slice(inicio, inicio + TAMANHO_LOTE);
    const corpo = JSON.stringify({
      requests: lote.map((texto) => ({
        model: `models/${MODELO_EMBEDDING}`,
        content: { parts: [{ text: String(texto || '').slice(0, 8000) }] },
        outputDimensionality: DIMENSOES_EMBEDDING,
      })),
    });

    const ESPERAS_MS = [1500];
    for (let tentativa = 0; ; tentativa++) {
      const resp = await fetch(
        `${GEMINI}/v1beta/models/${MODELO_EMBEDDING}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo },
      );

      if (resp.ok) {
        const data = await resp.json();
        const embeddings = data?.embeddings;
        if (!Array.isArray(embeddings) || embeddings.length !== lote.length) {
          throw new Error('Resposta de batchEmbedContents com formato inesperado.');
        }
        resultados.push(...embeddings.map((e) => e.values));
        break;
      }

      const transitorio = [429, 500, 503].includes(resp.status);
      if (!transitorio || tentativa >= ESPERAS_MS.length) {
        const detalhe = await resp.text().catch(() => '');
        throw new Error(`Falha ao gerar embeddings em lote (HTTP ${resp.status}): ${detalhe.slice(0, 300)}`);
      }
      await new Promise((r) => setTimeout(r, ESPERAS_MS[tentativa]));
    }
  }
  return resultados;
}
