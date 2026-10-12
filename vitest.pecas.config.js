import { defineConfig } from 'vitest/config';

// Testes do motor de peças e da renderização dos templates: Node puro (sem
// jsdom, sem React). Separado de vitest.config.ts de propósito — aquele é o
// ambiente de testes de componentes e depende de jsdom/@testing-library.
// Rodar: vitest run --config vitest.pecas.config.js
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
