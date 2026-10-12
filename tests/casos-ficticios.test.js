// Cada caso fictício (scripts/casos-ficticios/cenarios.py -> cenarios.json) foi DESENHADO para provocar um
// resultado do motor. Este teste confere que o motor chega a ele. Se falhar, ou o motor mudou de regra ou o
// caso foi desenhado errado: nos dois casos vale olhar antes de seguir.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { avaliarCaso } from '../scripts/casos-ficticios/montar-dados.mjs';

const casos = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts', 'casos-ficticios', 'cenarios.json'), 'utf8'));

describe('casos fictícios: o motor chega ao resultado para o qual cada caso foi desenhado', () => {
  it('há casos para os três tipos de tese e para as peças combinadas', () => {
    const ids = casos.map((c) => c.id);
    expect(ids.filter((i) => i.startsWith('P')).length).toBeGreaterThanOrEqual(9);
    expect(ids.filter((i) => i.startsWith('D')).length).toBeGreaterThanOrEqual(14);
    expect(ids.filter((i) => i.startsWith('I')).length).toBeGreaterThanOrEqual(9);
    expect(ids).toContain('C01');
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const c of casos) {
    it(`${c.id}: ${c.titulo}`, () => {
      const { pecas } = avaliarCaso(c);
      const obtido = Object.fromEntries(pecas.map((p) => [p.tese, p.status]));
      expect(obtido, JSON.stringify(pecas.map((p) => ({ tese: p.tese, status: p.status, bloqueios: p.bloqueios, mensagem: p.mensagem })))).toEqual(c.esperado);
      for (const [tese, template] of Object.entries(c.template || {})) {
        expect(pecas.find((p) => p.tese === tese)?.template).toBe(template);
      }
    });
  }
});
