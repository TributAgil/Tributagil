import { describe, it, expect } from 'vitest';
import { conferirCitacoes } from '../api/_lu-citacoes.js';

const BLOCOS = [{ id: 'D1' }, { id: 'D2' }, { id: 'P1' }, { id: 'L1' }];

describe('conferirCitacoes', () => {
  it('renumera por ordem de aparição e devolve os blocos usados', () => {
    const r = conferirCitacoes('A citação ocorreu em 2025 [P1]. O prazo é de cinco anos [L1], conforme a CDA [D2].', BLOCOS);
    expect(r.texto).toBe('A citação ocorreu em 2025 [1]. O prazo é de cinco anos [2], conforme a CDA [3].');
    expect(r.usados.map((b) => b.id)).toEqual(['P1', 'L1', 'D2']);
    expect(r.semFonte).toBe(false);
  });
  it('mesma fonte citada duas vezes mantém o mesmo número', () => {
    const r = conferirCitacoes('Primeiro [D1]. Depois de novo [D1], e outra [D2].', BLOCOS);
    expect(r.texto).toBe('Primeiro [1]. Depois de novo [1], e outra [2].');
    expect(r.usados).toHaveLength(2);
  });
  it('remove identificador inventado', () => {
    const r = conferirCitacoes('Fato real [D1] e fato inventado [D9].', BLOCOS);
    expect(r.texto).toBe('Fato real [1] e fato inventado.');
    expect(r.usados.map((b) => b.id)).toEqual(['D1']);
  });
  it('grupo com identificador válido e inválido mantém só o válido', () => {
    expect(conferirCitacoes('Duas fontes [D1, L9].', BLOCOS).texto).toBe('Duas fontes [1].');
  });
  it('grupo com vários válidos vira vários números', () => {
    expect(conferirCitacoes('Duas fontes [D1, P1].', BLOCOS).texto).toBe('Duas fontes [1][2].');
  });
  it('aceita minúscula', () => {
    expect(conferirCitacoes('Texto [d1].', BLOCOS).texto).toBe('Texto [1].');
  });
  it('sem nenhuma citação válida marca semFonte', () => {
    const r = conferirCitacoes('Resposta sem fonte nenhuma.', BLOCOS);
    expect(r.semFonte).toBe(true);
    expect(r.usados).toEqual([]);
    const s = conferirCitacoes('Só inventada [D9].', BLOCOS);
    expect(s.semFonte).toBe(true);
    expect(s.texto).toBe('Só inventada.');
  });
  it('não mexe em colchetes que não são citação', () => {
    expect(conferirCitacoes('Veja o art. 174 [parágrafo único] e [D1].', BLOCOS).texto).toBe('Veja o art. 174 [parágrafo único] e [1].');
  });
  it('texto vazio', () => {
    expect(conferirCitacoes('', BLOCOS)).toMatchObject({ texto: '', semFonte: true });
    expect(conferirCitacoes(undefined, BLOCOS).texto).toBe('');
  });
});
