import { describe, it, expect, vi, afterEach } from 'vitest';

// a lógica pura não precisa de Supabase de verdade
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok' } } })) },
    storage: { from: () => ({ download: vi.fn() }) },
  },
}));

import {
  estadoDaFigura,
  resumoDeConfirmacao,
  caixaSegura,
  caixaParaEstilo,
  caixaParaPixels,
  moverCaixa,
  redimensionarCaixa,
  pixelsParaUnidades,
  nomeArquivoFigura,
  referenciaDaFigura,
  localizarFigurasNaAnalise,
  MIN_LADO,
} from '../src/lib/figuras.js';

afterEach(() => { vi.unstubAllGlobals(); });

describe('estado da figura', () => {
  it('conferido, a revisar e não encontrada', () => {
    expect(estadoDaFigura({ encontrado: true, pagina: 2, dado_confere: true })).toBe('confere');
    expect(estadoDaFigura({ encontrado: true, pagina: 2, dado_confere: false })).toBe('revisar');
    expect(estadoDaFigura({ encontrado: true, pagina: 2, dado_confere: null })).toBe('revisar'); // não verificável em código: o advogado olha
    expect(estadoDaFigura({ encontrado: false, pagina: 0, dado_confere: false })).toBe('nao_achada');
    expect(estadoDaFigura(undefined)).toBe('nao_achada');
  });
  it('referência legível', () => {
    expect(referenciaDaFigura({ encontrado: true, documento_nome: 'EF.pdf', pagina: 3 })).toBe('EF.pdf, página 3');
    expect(referenciaDaFigura({ encontrado: false })).toBe('Não encontrada');
  });
  it('resumo de confirmação conta só as figuras com imagem', () => {
    const figs = [{ numero: 1 }, { numero: 2 }, { numero: 3 }];
    expect(resumoDeConfirmacao(figs, { 1: {}, 3: {} })).toEqual({ total: 3, confirmadas: 2, faltam: 1, completo: false });
    expect(resumoDeConfirmacao(figs, { 1: {}, 2: {}, 3: {} }).completo).toBe(true);
    expect(resumoDeConfirmacao([], {}).completo).toBe(false);
  });
});

describe('matemática da caixa', () => {
  it('caixaSegura limita à página, ordena e garante o lado mínimo', () => {
    expect(caixaSegura([100, 100, 200, 300])).toEqual([100, 100, 200, 300]);
    expect(caixaSegura([-50, -50, 2000, 3000])).toEqual([0, 0, 1000, 1000]);
    expect(caixaSegura([200, 300, 100, 100])).toEqual([100, 100, 200, 300]); // invertida
    const fina = caixaSegura([500, 500, 500, 500]);
    expect(fina[2] - fina[0]).toBeGreaterThanOrEqual(MIN_LADO);
    expect(fina[3] - fina[1]).toBeGreaterThanOrEqual(MIN_LADO);
    expect(caixaSegura(null)).toHaveLength(4); // entrada ruim vira a caixa padrão, nunca quebra
    expect(caixaSegura([1, 2, 'x', 4])).toHaveLength(4);
  });
  it('caixa na borda não sai da página ao garantir o lado mínimo', () => {
    const c = caixaSegura([995, 995, 1000, 1000]);
    expect(c.every((v) => v >= 0 && v <= 1000)).toBe(true);
    expect(c[2] - c[0]).toBeGreaterThanOrEqual(MIN_LADO);
  });
  it('estilo em porcentagem e pixels batem com a caixa', () => {
    expect(caixaParaEstilo([100, 50, 300, 950])).toEqual({ top: '10%', left: '5%', height: '20%', width: '90%' });
    expect(caixaParaPixels([100, 50, 300, 950], 2000, 1000)).toEqual({ x: 100, y: 100, largura: 1800, altura: 200 });
  });
  it('mover não deixa a caixa sair da página e preserva o tamanho', () => {
    expect(moverCaixa([100, 100, 200, 300], 50, -40)).toEqual([150, 60, 250, 260]);
    const colada = moverCaixa([100, 100, 200, 300], 5000, 5000);
    expect(colada).toEqual([900, 800, 1000, 1000]);
    expect(moverCaixa([100, 100, 200, 300], -5000, -5000)).toEqual([0, 0, 100, 200]);
  });
  it('redimensionar mexe só no lado arrastado e respeita o lado mínimo', () => {
    expect(redimensionarCaixa([100, 100, 200, 300], 's', 80, 999)).toEqual([100, 100, 280, 300]); // só o lado de baixo
    expect(redimensionarCaixa([100, 100, 200, 300], 'o', 999, -40)).toEqual([100, 60, 200, 300]); // só a esquerda
    expect(redimensionarCaixa([100, 100, 200, 300], 'sl', 30, 30)).toEqual([100, 100, 230, 330]); // canto
    const min = redimensionarCaixa([100, 100, 200, 300], 'n', 5000, 0); // arrastar o topo para baixo além do limite
    expect(min[2] - min[0]).toBe(MIN_LADO);
    expect(redimensionarCaixa([100, 100, 200, 300], 'l', 0, 5000)[3]).toBe(1000);
  });
  it('deslocamento em pixels vira unidades da página exibida', () => {
    expect(pixelsParaUnidades(50, 500)).toBe(100);
    expect(pixelsParaUnidades(50, 0)).toBe(0);
  });
});

describe('nome do arquivo da figura', () => {
  it('ordenável, sem acento e sem caractere inválido no Windows', () => {
    expect(nomeArquivoFigura({ numero: 3, chave: 'extrato_vencimento', periodo: '2017' })).toBe('Figura-03_extrato-vencimento_2017.png');
    expect(nomeArquivoFigura({ numero: 12, chave: 'recibo_declaracao', periodo: '1T/2016' }, 'jpg')).toBe('Figura-12_recibo-declaracao_1t-2016.jpg');
    expect(nomeArquivoFigura({ numero: 5, chave: 'ajuizamento', periodo: '' })).toBe('Figura-05_ajuizamento.png');
    expect(nomeArquivoFigura({ numero: 1, chave: '', periodo: '' })).toBe('Figura-01.png');
    expect(nomeArquivoFigura({ numero: 2, chave: 'Notificação', periodo: 'a:b*c' })).not.toMatch(/[<>:"/\\|?*]/);
  });
});

describe('chamada ao servidor', () => {
  it('manda o token e devolve as figuras localizadas', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status: 'ok', figuras: [{ numero: 1 }], documentos: [] }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const r = await localizarFigurasNaAnalise({ analiseId: 'a1', figuras: [{ numero: 1 }] });
    expect(r).toMatchObject({ ok: true, figuras: [{ numero: 1 }] });
    expect(f.mock.calls[0][0]).toBe('/api/localizar-figuras');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ analise_id: 'a1', figuras: [{ numero: 1 }] });
  });
  it('erro do servidor vira mensagem para o usuário (sem expor detalhes)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'O Gemini (a IA do Google) está sobrecarregado neste momento. Aguarde alguns minutos e tente de novo.' }), { status: 503 })));
    const r = await localizarFigurasNaAnalise({ analiseId: 'a1', figuras: [] });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/sobrecarregado/);
  });
  it('falha de rede vira mensagem clara', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect((await localizarFigurasNaAnalise({ analiseId: 'a1', figuras: [] })).error).toMatch(/rede/);
  });
});
