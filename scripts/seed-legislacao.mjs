#!/usr/bin/env node
// scripts/seed-legislacao.mjs
//
// Popula `legislacao_chunks` com o corpus curado de api/_legislacao-tributagil.js.
// Roda LOCALMENTE, uma vez (e de novo sempre que o corpus mudar) — nunca em
// produção/Vercel. Precisa da service_role key (bypassa RLS) porque a tabela
// não tem policy de INSERT para o client (escrita é só do desenvolvedor).
//
// Uso:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   GEMINI_API_KEY=AQ.... \
//   node scripts/seed-legislacao.mjs
//
// Idempotente: apaga e recria todo o conteúdo de `legislacao_chunks` a cada
// execução (o corpus é pequeno e curado à mão — não há "diff incremental").

import { LEGISLACAO_TRIBUTAGIL } from '../api/_legislacao-tributagil.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODELO_EMBEDDING = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';
const DIMENSOES = 768;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
  console.error(
    'Defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e GEMINI_API_KEY antes de rodar este script.',
  );
  process.exit(1);
}

async function gerarEmbedding(texto) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_EMBEDDING}:embedContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${MODELO_EMBEDDING}`,
        content: { parts: [{ text: texto.slice(0, 8000) }] },
        outputDimensionality: DIMENSOES,
      }),
    },
  );
  if (!resp.ok) {
    throw new Error(`Falha ao gerar embedding (HTTP ${resp.status}): ${(await resp.text()).slice(0, 300)}`);
  }
  const data = await resp.json();
  return data?.embedding?.values;
}

async function main() {
  console.log(`Limpando legislacao_chunks...`);
  const del = await fetch(`${SUPABASE_URL}/rest/v1/legislacao_chunks?id=neq.00000000-0000-0000-0000-000000000000`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!del.ok) {
    console.warn(`Aviso: falha ao limpar (HTTP ${del.status}) — seguindo mesmo assim (tabela pode estar vazia).`);
  }

  console.log(`Indexando ${LEGISLACAO_TRIBUTAGIL.length} dispositivos/súmulas...`);
  const linhas = [];
  for (const [i, item] of LEGISLACAO_TRIBUTAGIL.entries()) {
    process.stdout.write(`  [${i + 1}/${LEGISLACAO_TRIBUTAGIL.length}] ${item.norma} — ${item.identificador}... `);
    const embedding = await gerarEmbedding(`${item.norma} ${item.identificador}\n${item.texto_integral}`);
    linhas.push({ ...item, embedding });
    console.log('ok');
    // Respeita rate limit do free tier do Gemini.
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log('Gravando no Supabase...');
  const ins = await fetch(`${SUPABASE_URL}/rest/v1/legislacao_chunks`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(linhas),
  });

  if (!ins.ok) {
    console.error(`Falha ao gravar (HTTP ${ins.status}):`, (await ins.text()).slice(0, 1000));
    process.exit(1);
  }

  console.log(`Pronto — ${linhas.length} dispositivos indexados em legislacao_chunks.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
