// Gera o .docx de CADA peça possível de CADA caso fictício (sem rede, sem Gemini), para validação estrutural
// e para abrir no Word. Saída: pasta indicada (padrão: exemplos/casos-ficticios/docx).
//   node scripts/casos-ficticios/gerar-docx-de-todos.mjs [pasta]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avaliarCaso } from './montar-dados.mjs';
import { montarContexto } from '../../api/_contexto-peca.js';
import { renderizarPeca } from '../../api/_render-peca.js';
import { escritorio } from '../../tests/fixtures-peca.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const saida = process.argv[2] || path.join(aqui, '..', '..', 'exemplos', 'casos-ficticios', 'docx');
fs.mkdirSync(saida, { recursive: true });
const casos = JSON.parse(fs.readFileSync(path.join(aqui, 'cenarios.json'), 'utf8'));
const parseBR = (s) => { const [d, m, a] = s.split('/').map(Number); return new Date(Date.UTC(a, m - 1, d)); };

let n = 0;
for (const c of casos) {
  const { dados, pecas } = avaliarCaso(c);
  for (const p of pecas.filter((x) => x.status === 'ok')) {
    const contexto = montarContexto({ dados, avaliacao: p, escritorio, agora: parseBR(c.agora) });
    const buffer = await renderizarPeca({ template: p.template, contexto });
    fs.writeFileSync(path.join(saida, `${c.id}_${p.tese}.docx`), buffer);
    n++;
  }
}
console.log(n, 'arquivos .docx em', saida);
