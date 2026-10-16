import { describe, it, expect, vi, afterEach } from 'vitest';
import { extrairDados } from '../api/_extracao-peca.js';
import { dadosDoCaso } from '../scripts/casos-ficticios/montar-dados.mjs';
import { compararExtracao } from '../scripts/casos-ficticios/comparar.mjs';
import { ESQUEMA_DADOS_PECA, PROMPT_DADOS_PECA } from '../api/_schema-dados-peca.js';
import fs from 'node:fs';
import path from 'node:path';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const resposta = (status, corpo) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status });

describe('extrairDados: limite de uso do Gemini', () => {
  it('cota DIÁRIA esgotada (retry in 10h...): falha na hora, sem repetir (repetir só gasta cota) e com a marca cotaEsgotada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = vi.fn(async () => resposta(429, { error: { code: 429, message: 'Quota exceeded ... limit: 20 ... Please retry in 10h13m16.34s.' } }));
    vi.stubGlobal('fetch', f);
    await expect(extrairDados({ apiKey: 'k', partes: [], ctx: {} })).rejects.toMatchObject({ cotaEsgotada: true });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('erro transitório (503) ainda é repetido e a resposta boa é usada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++n === 1 ? resposta(503, { error: { status: 'UNAVAILABLE' } }) : resposta(200, { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { totalTokenCount: 7 } }))));
    const ctx = {};
    expect(await extrairDados({ apiKey: 'k', partes: [], ctx })).toEqual({ ok: true });
    expect(ctx.tokens).toBe(7);
  }, 15000);
});

describe('comparador dos casos fictícios', () => {
  it('crédito declarado: "não" e "não consta" para dolo/vício são a mesma coisa (só importam na decadência)', () => {
    const casos = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts', 'casos-ficticios', 'cenarios.json'), 'utf8'));
    const c = casos.find((x) => x.id === 'P03');
    const certo = dadosDoCaso(c);
    const lido = JSON.parse(JSON.stringify(certo));
    for (const p of lido.inscricoes[0].periodos) { p.imputacao_dolo_fraude_simulacao = 'não'; p.lancamento_anterior_anulado_vicio_formal = 'não'; }
    expect(compararExtracao(certo, lido)).toEqual([]);
  });

  it('lançamento de ofício: dolo lido errado CONTINUA sendo acusado', () => {
    const casos = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts', 'casos-ficticios', 'cenarios.json'), 'utf8'));
    const certo = dadosDoCaso(casos.find((x) => x.id === 'D06'));
    const lido = JSON.parse(JSON.stringify(certo));
    lido.inscricoes[0].periodos[0].imputacao_dolo_fraude_simulacao = 'não';
    expect(compararExtracao(certo, lido).map((d) => d.campo)).toContain('dolo/fraude/simulação');
  });
});

describe('roteiro da extração: dolo "não" só com declaração expressa', () => {
  it('o schema e o roteiro mandam usar "não consta" quando o documento é omisso sobre multa e qualificação', () => {
    const desc = ESQUEMA_DADOS_PECA.properties.inscricoes.items.properties.periodos.items.properties.imputacao_dolo_fraude_simulacao.description;
    expect(desc).toMatch(/"não" SOMENTE se o documento AFIRMA expressamente/);
    expect(desc).toMatch(/a ausência de menção NÃO é "não"/);
    expect(PROMPT_DADOS_PECA).toMatch(/documento que não menciona multa nem qualificação é "não consta", nunca "não"/);
  });
});

describe('roteiro da extração: ciência da Fazenda não é AR negativo', () => {
  it('o schema e o roteiro dizem que AR devolvido / certidão negativa NÃO são a ciência da Fazenda', () => {
    const desc = ESQUEMA_DADOS_PECA.properties.eventos_execucao.items.properties.categoria.description;
    expect(desc).toMatch(/NÃO é a data do AR devolvido/);
    expect(PROMPT_DADOS_PECA).toMatch(/AR devolvido, mandado negativo ou certidão do oficial de justiça NÃO são a ciência da Fazenda/);
  });
});
