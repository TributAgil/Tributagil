import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

process.env.GEMINI_API_KEY = 'chave-de-teste';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
  delete process.env.GEMINI_EMBEDDING_MODEL;
});
beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });

const carregar = async () => import('../api/_embeddings.js');

describe('modelo de embedding', () => {
  it('padrão: gemini-embedding-001 com 768 dimensões', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ embedding: { values: [0.1, 0.2] } })));
    vi.stubGlobal('fetch', f);
    const { gerarEmbedding, MODELO_EMBEDDING, DIMENSOES_EMBEDDING } = await carregar();
    expect(MODELO_EMBEDDING).toBe('gemini-embedding-001');
    expect(await gerarEmbedding('prescrição')).toEqual([0.1, 0.2]);
    expect(String(f.mock.calls[0][0])).toContain('/models/gemini-embedding-001:embedContent');
    expect(JSON.parse(f.mock.calls[0][1].body).outputDimensionality).toBe(768);
    expect(DIMENSOES_EMBEDDING).toBe(768);
  });

  it('GEMINI_EMBEDDING_MODEL com o modelo desativado (text-embedding-004) é ignorado', async () => {
    process.env.GEMINI_EMBEDDING_MODEL = 'text-embedding-004';
    const { MODELO_EMBEDDING } = await carregar();
    expect(MODELO_EMBEDDING).toBe('gemini-embedding-001');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('desativado'));
  });

  it('um modelo válido escolhido por variável é respeitado', async () => {
    process.env.GEMINI_EMBEDDING_MODEL = 'gemini-embedding-2';
    const { MODELO_EMBEDDING } = await carregar();
    expect(MODELO_EMBEDDING).toBe('gemini-embedding-2');
  });
});
