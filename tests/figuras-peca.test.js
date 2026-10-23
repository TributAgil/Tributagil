import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { avaliarCaso } from '../scripts/casos-ficticios/montar-dados.mjs';
import { montarContexto } from '../api/_contexto-peca.js';
import { renderizarPeca, figurasDoDocx, contarMarcadores } from '../api/_render-peca.js';
import { escritorio } from './fixtures-peca.js';

// A lista de figuras (o que o assistente de figuras recebe) precisa SER o que está no Word: mesmos números, mesma
// ordem, sem pular, e cada item dizendo o que mostrar e que dado precisa aparecer. Roda em TODAS as peças possíveis
// dos 34 casos fictícios.

const casos = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts', 'casos-ficticios', 'cenarios.json'), 'utf8'));
const parseBR = (s) => { const [d, m, a] = s.split('/').map(Number); return new Date(Date.UTC(a, m - 1, d)); };

async function pecasDe(caso) {
  const { dados, pecas } = avaliarCaso(caso);
  const saida = [];
  for (const p of pecas.filter((x) => x.status === 'ok')) {
    const contexto = montarContexto({ dados, avaliacao: p, escritorio, agora: parseBR(caso.agora) });
    const docx = await renderizarPeca({ template: p.template, contexto });
    saida.push({ caso: caso.id, template: p.template, tese: p.tese, contexto, docx, figuras: await figurasDoDocx(docx, contexto.figuras_meta) });
  }
  return saida;
}

describe('lista de figuras da peça', () => {
  const todas = [];
  it('gera as peças de todos os casos fictícios', async () => {
    for (const c of casos) todas.push(...(await pecasDe(c)));
    expect(todas.length).toBeGreaterThanOrEqual(19);
  }, 120000);

  it('os números são 1..N na ordem do documento, sem pular, em toda peça', () => {
    for (const p of todas) {
      const nums = p.figuras.map((f) => f.numero);
      expect(nums, `${p.caso} ${p.template}`).toEqual(nums.map((_, i) => i + 1));
    }
  });

  it('a quantidade de figuras bate com a contagem de marcadores do resumo', async () => {
    for (const p of todas) {
      const { figuras } = await contarMarcadores(p.docx);
      expect(p.figuras.length, `${p.caso} ${p.template}`).toBe(figuras);
    }
  });

  it('cada figura tem legenda "Figura N - ...", tipo conhecido, descrição e o dado que deve aparecer', () => {
    for (const p of todas) {
      for (const f of p.figuras) {
        const onde = `${p.caso} ${p.template} figura ${f.numero}`;
        expect(f.chave, onde).not.toBe('desconhecida');
        expect(f.legenda, onde).toMatch(new RegExp(`^Figura ${f.numero} - `));
        expect(f.descricao.length, onde).toBeGreaterThan(5);
        expect(f.evidenciar.length, onde).toBeGreaterThan(0);
        for (const e of f.evidenciar) expect(e.campo, onde).toBeTruthy();
      }
    }
  });

  it('quais figuras cada modelo traz (EPE de prescrição inclui a petição inicial; a Revisão PGFN não)', () => {
    const chaves = (p) => p.figuras.map((f) => f.chave);
    const epe = todas.find((p) => p.template === 'EPE_prescricao_ordinaria');
    const rev = todas.find((p) => p.template === 'Revisao_PGFN_prescricao_ordinaria');
    expect(chaves(epe)).toContain('ajuizamento');
    expect(chaves(rev)).not.toContain('ajuizamento');
    for (const p of [epe, rev]) {
      expect(chaves(p)).toContain('recibo_declaracao');
      expect(chaves(p)).toContain('extrato_vencimento');
      expect(chaves(p)).toContain('processo_administrativo');
      expect(chaves(p)).toContain('negociacoes');
    }
    // decadência: a EPE não traz figura; a Revisão PGFN traz a da notificação do lançamento
    expect(chaves(todas.find((p) => p.template === 'EPE_decadencia'))).toEqual([]);
    expect(chaves(todas.find((p) => p.template === 'Revisao_PGFN_decadencia'))).toEqual(['notificacao_lancamento']);
    const inter = todas.find((p) => p.template === 'EPE_prescricao_intercorrente');
    expect(chaves(inter)).toEqual(['ciencia_fazenda']);
  });

  it('o dado a evidenciar é o mesmo que o motor calculou (data de entrega, vencimento, ciência)', () => {
    const p01 = todas.find((p) => p.caso === 'P01' && p.tese === 'prescricao_ordinaria');
    const recibo = p01.figuras.find((f) => f.chave === 'recibo_declaracao');
    const extrato = p01.figuras.find((f) => f.chave === 'extrato_vencimento');
    expect(recibo.evidenciar[0].valor).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(extrato.evidenciar[0].valor).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    const i01 = todas.find((p) => p.caso === 'I01' && p.tese === 'prescricao_intercorrente');
    expect(i01.figuras[0].evidenciar[0].valor).toBe('10/03/2017');
  });

  it('a Revisão de prescrição com vários períodos continua sem salto de numeração (regressão)', () => {
    const p03 = todas.find((p) => p.caso === 'P03' && p.tese === 'prescricao_ordinaria');
    expect(p03.figuras.map((f) => f.numero)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('com várias CDAs a numeração continua entre os blocos (C01: 15 figuras)', () => {
    const c01 = todas.find((p) => p.caso === 'C01' && p.tese === 'prescricao_ordinaria');
    expect(c01.figuras.length).toBe(15);
    expect(c01.figuras.filter((f) => f.chave === 'processo_administrativo').length).toBe(3);
  });
});
