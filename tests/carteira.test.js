import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { marcosDoCaso, dataIso } from '../api/_carteira.js';
import { dadosDoCaso } from '../scripts/casos-ficticios/montar-dados.mjs';

// Carteira de casos: os marcos que saem do motor (api/_carteira.js). Os avisos ficam dentro da plataforma (calendário da carteira).

const casos = JSON.parse(fs.readFileSync(new URL('../scripts/casos-ficticios/cenarios.json', import.meta.url), 'utf8'));
const parseBR = (s) => {
  const [d, m, a] = s.split('/').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};
const conclusoes = (c) => (c.parecer_favoravel || []).map((t) => ({ tipo: t === 'prescricao_ordinaria' ? 'prescricao' : t, severidade: 'favoravel', confianca: 90 }));
const marcosDe = (id) => {
  const c = casos.find((x) => x.id === id);
  return marcosDoCaso({ dados: dadosDoCaso(c), conclusoesParecer: conclusoes(c), agora: parseBR(c.agora) });
};
const resumo = (r) => r.marcos.map((m) => `${m.tipo}:${m.tese}:${m.cda}:${m.periodo}:${m.data}`);

describe('marcosDoCaso (casos fictícios do gabarito)', () => {
  it('P02: só as competências prescritas; a de 06/2014 já foi interrompida pelo ajuizamento e não entra', () => {
    const r = marcosDe('P02');
    expect(r.ajuizada).toBe(true);
    expect(resumo(r)).toEqual([
      'consumado:prescricao_ordinaria:50.100.002-1:01/2012:20/02/2017',
      'consumado:prescricao_ordinaria:50.100.002-1:02/2012:20/03/2017',
    ]);
    expect(r.teses.find((t) => t.tese === 'prescricao_ordinaria').status).toBe('ok');
  });

  it('P09: sem execução e dentro do prazo vira "acompanhar" até a consumação, com a condição do ajuizamento', () => {
    const r = marcosDe('P09');
    expect(resumo(r)).toEqual(['acompanhar:prescricao_ordinaria:50.100.009-1:2022:20/03/2028']);
    expect(r.marcos[0].condicao).toMatch(/execução fiscal não tenha sido ajuizada/);
  });

  it('D10: só o período decaído (decadência não muda com o tempo)', () => {
    expect(resumo(marcosDe('D10'))).toEqual(['consumado:decadencia:50.200.010-1:2016:01/01/2022']);
  });

  it('I05: intercorrente em curso vira "acompanhar" até 15/06/2029; I04: consumada em 10/03/2023', () => {
    const i05 = marcosDe('I05');
    expect(resumo(i05)).toEqual(['acompanhar:prescricao_intercorrente:::15/06/2029']);
    expect(i05.marcos[0].condicao).toMatch(/penhora efetiva/);
    expect(resumo(marcosDe('I04'))).toEqual(['consumado:prescricao_intercorrente:::10/03/2023']);
  });

  it('P04, D11 e I03: nada a acompanhar', () => {
    for (const id of ['P04', 'D11', 'I03']) expect(marcosDe(id).marcos).toEqual([]);
  });

  it('chave estável e única por marco; dataIso converte para o banco', () => {
    const r = marcosDe('C01');
    expect(new Set(r.marcos.map((m) => m.chave)).size).toBe(r.marcos.length);
    expect(marcosDe('C01').marcos.map((m) => m.chave)).toEqual(r.marcos.map((m) => m.chave));
    expect(dataIso('15/06/2029')).toBe('2029-06-15');
    expect(dataIso('x')).toBe('');
  });
});
