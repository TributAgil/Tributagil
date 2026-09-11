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
// Uso:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/limpar-orfaos-storage.mjs [--dias=7] [--dry-run]

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'documentos';

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

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de rodar este script.');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

async function listarTodosOsObjetos() {
  // Storage não tem "listar tudo recursivo" nativo — lista por pasta
  // (1 pasta = 1 usuário, primeiro segmento do path). Primeiro lista as
  // pastas de usuário na raiz do bucket, depois desce em cada uma.
  const objetos = [];
  const raiz = await listarPasta('');
  const usuarios = raiz.filter((o) => !o.id); // entradas sem `id` = "pastas" (prefixos)
  for (const pasta of usuarios) {
    await coletarRecursivo(pasta.name, objetos);
  }
  return objetos;
}

async function coletarRecursivo(prefixo, acumulador) {
  const itens = await listarPasta(prefixo);
  for (const item of itens) {
    const caminho = `${prefixo}/${item.name}`;
    if (item.id) {
      acumulador.push({ path: caminho, created_at: item.created_at });
    } else {
      await coletarRecursivo(caminho, acumulador);
    }
  }
}

// Pagina em lotes de 1000 (teto da API de Storage) — sem isto, uma pasta
// (de usuário ou de análise) com mais de 1000 objetos era varrida só
// parcialmente, deixando órfãos antigos de fora da limpeza sem aviso.
async function listarPasta(prefixo) {
  const LOTE = 1000;
  const todos = [];
  for (let offset = 0; ; offset += LOTE) {
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
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

async function apagar(paths) {
  const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!resp.ok) throw new Error(`Falha ao apagar lote: HTTP ${resp.status}`);
}

async function main() {
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
