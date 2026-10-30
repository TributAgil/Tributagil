// scripts/limpar-orfaos-storage.mjs
//
// Manutenção LGPD: apaga do bucket `documentos` os arquivos ÓRFÃOS — enviados
// pelo usuário mas nunca comprometidos a um caso salvo (sem linha
// correspondente em `documentos_caso`) — depois de um prazo de graça. Sem
// base legal para reter esses arquivos indefinidamente (o usuário pode ter
// fechado a aba no meio do envio, cancelado a análise, etc.).
//
// Usa a SERVICE_ROLE_KEY para bypassar a RLS de Storage (o client comum, a
// partir da mudança que restringiu update/delete a órfãos, já não consegue
// apagar objetos de qualquer forma além dessa — ver README, seção Storage).
// Rode manualmente ou agende via cron externo (ex.: GitHub Actions
// scheduled workflow). NUNCA rode dentro de uma function da Vercel: a
// SERVICE_ROLE_KEY não pode existir em nenhuma variável de ambiente da
// Vercel, mesmo sem prefixo VITE_ (mesma regra do seed-legislacao.mjs).
//
// Também limpa o bucket `pecas` (peças salvas, docs/sql/pecas-salvas.sql): apaga os arquivos que nenhuma peça
// (`pecas.original_path`) nem versão (`pecas_versoes.imagens[*].path`) usa mais — sobras de peça apagada, de "gerar de
// novo", de versão que saiu pelo limite de 3 ou de uma gravação que falhou no meio. O app já apaga na hora; isto é a
// rede de segurança. Prazo de graça curto (o arquivo é gravado segundos antes da linha que o referencia).
//
// Uso:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/limpar-orfaos-storage.mjs [--dias=7] [--dias-pecas=2] [--dry-run]

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'documentos';
const BUCKET_PECAS = 'pecas';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const diasArg = args.find((a) => a.startsWith('--dias='));
// 30 dias (não 7): um advogado pode enviar documentos e só voltar para
// concluir/submeter a análise depois de alguns dias (juntando mais provas,
// por exemplo) — o vínculo a um caso só é criado quando a análise É SALVA,
// não no upload. Um prazo curto demais apagaria um caso em preparo antes de
// virar órfão "de verdade" (abandonado), causando falha na leitura sem
// perda de crédito, mas com frustração real. Ajustado após revisão externa.
const DIAS_GRACA = diasArg ? Number(diasArg.split('=')[1]) : 30;
const diasPecasArg = args.find((a) => a.startsWith('--dias-pecas='));
const DIAS_GRACA_PECAS = diasPecasArg ? Number(diasPecasArg.split('=')[1]) : 2;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de rodar este script.');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

async function listarTodosOsObjetos(bucket = BUCKET) {
  // Storage não tem "listar tudo recursivo" nativo — lista por pasta
  // (1 pasta = 1 usuário, primeiro segmento do path). Primeiro lista as
  // pastas de usuário na raiz do bucket, depois desce em cada uma.
  const objetos = [];
  const raiz = await listarPasta('', bucket);
  const usuarios = raiz.filter((o) => !o.id); // entradas sem `id` = "pastas" (prefixos)
  for (const pasta of usuarios) {
    await coletarRecursivo(pasta.name, objetos, bucket);
  }
  return objetos;
}

async function coletarRecursivo(prefixo, acumulador, bucket) {
  const itens = await listarPasta(prefixo, bucket);
  for (const item of itens) {
    const caminho = `${prefixo}/${item.name}`;
    if (item.id) {
      acumulador.push({ path: caminho, created_at: item.created_at });
    } else {
      await coletarRecursivo(caminho, acumulador, bucket);
    }
  }
}

// Pagina em lotes de 1000 (teto da API de Storage) — sem isto, uma pasta
// (de usuário ou de análise) com mais de 1000 objetos era varrida só
// parcialmente, deixando órfãos antigos de fora da limpeza sem aviso.
async function listarPasta(prefixo, bucket = BUCKET) {
  const LOTE = 1000;
  const todos = [];
  for (let offset = 0; ; offset += LOTE) {
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prefix: prefixo, limit: LOTE, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!resp.ok) throw new Error(`Falha ao listar "${prefixo}" (offset ${offset}): HTTP ${resp.status}`);
    const pagina = await resp.json();
    todos.push(...pagina);
    if (pagina.length < LOTE) break;
  }
  return todos;
}

async function pathsComCasoVinculado(paths) {
  if (paths.length === 0) return new Set();
  const filtro = paths.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(',');
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/documentos_caso?select=storage_path&storage_path=in.(${filtro})`,
    { headers },
  );
  if (!resp.ok) throw new Error(`Falha ao consultar documentos_caso: HTTP ${resp.status}`);
  const linhas = await resp.json();
  return new Set(linhas.map((l) => l.storage_path));
}

async function apagar(paths, bucket = BUCKET) {
  const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!resp.ok) throw new Error(`Falha ao apagar lote: HTTP ${resp.status}`);
}

// Todas as linhas de uma tabela (paginado pelo cabeçalho Range do PostgREST).
async function lerTudo(tabela, colunas) {
  const LOTE = 1000;
  const linhas = [];
  for (let inicio = 0; ; inicio += LOTE) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?select=${colunas}&order=id`, {
      headers: { ...headers, Range: `${inicio}-${inicio + LOTE - 1}` },
    });
    if (!resp.ok) throw new Error(`Falha ao ler ${tabela}: HTTP ${resp.status}`);
    const pagina = await resp.json();
    linhas.push(...pagina);
    if (pagina.length < LOTE) break;
  }
  return linhas;
}

/** Caminhos do bucket `pecas` que alguma peça ou versão ainda usa. */
async function caminhosUsadosPorPecas() {
  const usados = new Set();
  for (const p of await lerTudo('pecas', 'id,original_path')) if (p.original_path) usados.add(p.original_path);
  for (const v of await lerTudo('pecas_versoes', 'id,imagens')) {
    for (const img of Object.values(v.imagens || {})) if (img?.path) usados.add(img.path);
  }
  return usados;
}

async function limparPecas() {
  console.log(`Listando objetos do bucket "${BUCKET_PECAS}"...`);
  const objetos = await listarTodosOsObjetos(BUCKET_PECAS);
  const limite = Date.now() - DIAS_GRACA_PECAS * 24 * 60 * 60 * 1000;
  const candidatos = objetos.filter((o) => o.created_at && new Date(o.created_at).getTime() < limite);
  if (candidatos.length === 0) {
    console.log(`Nenhum arquivo de peça além do prazo de graça de ${DIAS_GRACA_PECAS} dia(s).`);
    return;
  }
  const usados = await caminhosUsadosPorPecas();
  const orfaos = candidatos.filter((o) => !usados.has(o.path));
  console.log(`${orfaos.length} arquivo(s) de peça sem uso a apagar.`);
  if (orfaos.length === 0) return;
  if (dryRun) {
    orfaos.forEach((o) => console.log(' -', o.path, o.created_at));
    return;
  }
  for (let i = 0; i < orfaos.length; i += 100) await apagar(orfaos.slice(i, i + 100).map((o) => o.path), BUCKET_PECAS);
}

async function main() {
  await limparDocumentos();
  await limparPecas();
}

async function limparDocumentos() {
  console.log(`Listando objetos do bucket "${BUCKET}"...`);
  const objetos = await listarTodosOsObjetos();
  console.log(`${objetos.length} objeto(s) encontrado(s).`);

  const limite = Date.now() - DIAS_GRACA * 24 * 60 * 60 * 1000;
  const candidatos = objetos.filter((o) => o.created_at && new Date(o.created_at).getTime() < limite);
  console.log(`${candidatos.length} objeto(s) além do prazo de graça de ${DIAS_GRACA} dia(s).`);

  if (candidatos.length === 0) return;

  const comCaso = await pathsComCasoVinculado(candidatos.map((o) => o.path));
  const orfaos = candidatos.filter((o) => !comCaso.has(o.path));
  console.log(`${orfaos.length} objeto(s) órfão(s) (sem caso vinculado) a apagar.`);

  if (orfaos.length === 0) return;
  if (dryRun) {
    console.log('--dry-run: nenhum arquivo será apagado. Lista:');
    orfaos.forEach((o) => console.log(' -', o.path, o.created_at));
    return;
  }

  const LOTE = 100;
  for (let i = 0; i < orfaos.length; i += LOTE) {
    const lote = orfaos.slice(i, i + LOTE).map((o) => o.path);
    await apagar(lote);
    console.log(`Apagados ${Math.min(i + LOTE, orfaos.length)}/${orfaos.length}`);
  }
}

main().catch((err) => {
  console.error('Falha na limpeza:', err);
  process.exit(1);
});
