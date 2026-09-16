// scripts/checar-sem-service-role-em-api.mjs
//
// Guarda-corpo contra a SUPABASE_SERVICE_ROLE_KEY vazar para dentro de
// api/ (que roda na Vercel) — documentação não protege chave, isto sim.
// Falha (exit 1) se a string "SUPABASE_SERVICE_ROLE_KEY" aparecer em
// qualquer arquivo .js/.mjs dentro de api/. Os únicos lugares onde essa
// variável deve existir são scripts/*.mjs (rodados manualmente ou via
// GitHub Actions, nunca pela Vercel) — ver README, seção Storage.
//
// Uso: node scripts/checar-sem-service-role-em-api.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR_API = fileURLToPath(new URL('../api', import.meta.url));
const PADRAO = 'SUPABASE_SERVICE_ROLE_KEY';

function listarArquivos(dir) {
  const resultado = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    const info = statSync(caminho);
    if (info.isDirectory()) {
      resultado.push(...listarArquivos(caminho));
    } else if (/\.(js|mjs)$/.test(nome)) {
      resultado.push(caminho);
    }
  }
  return resultado;
}

const encontrados = [];
for (const arquivo of listarArquivos(DIR_API)) {
  const conteudo = readFileSync(arquivo, 'utf8');
  if (conteudo.includes(PADRAO)) {
    encontrados.push(arquivo);
  }
}

if (encontrados.length > 0) {
  console.error(`ERRO: "${PADRAO}" encontrado dentro de api/ — essa chave NUNCA pode existir em código que roda na Vercel:`);
  encontrados.forEach((f) => console.error(' -', f));
  process.exit(1);
}

console.log(`OK: "${PADRAO}" não aparece em nenhum arquivo dentro de api/.`);
