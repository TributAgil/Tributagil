// scripts/teste-rls-isolamento.mjs
//
// Teste de integração: prova que a RLS de Storage isola usuários de
// verdade — cria dois usuários DESCARTÁVEIS (A e B), sobe um documento
// como A, e tenta lê-lo como B tanto direto no Storage quanto pelo
// caminho real da aplicação (a própria função `POST` de api/gemini.js,
// invocada localmente, sem precisar de um deploy no ar). Falha se B
// conseguir ler qualquer coisa de A.
//
// POR QUE ISSO É UM TESTE, NÃO SÓ CONFIANÇA NA POLICY: isolamento entre
// clientes é obrigação legal (LGPD), não só boa prática — um bug aqui é
// vazamento de dado fiscal de um cliente pra outro, com consequência
// jurídica real. "A policy está escrita certa" não é a mesma garantia que
// "a policy continua funcionando depois do próximo commit".
//
// Roda contra o Supabase de PRODUÇÃO (não existe projeto de staging) —
// seguro porque os dois usuários são criados e apagados dentro do próprio
// teste, nunca tocam em dado de usuário real. A SERVICE_ROLE_KEY é usada
// SÓ para criar/apagar esses dois usuários (Admin API) — a chamada a
// api/gemini.js usa exclusivamente o token de sessão de cada usuário de
// teste, o mesmíssimo caminho que um usuário real percorre.
//
// Uso:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   SUPABASE_ANON_KEY=eyJ... \
//   node scripts/teste-rls-isolamento.mjs

import assert from 'node:assert/strict';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const BUCKET = 'documentos';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_ANON_KEY.');
  process.exit(1);
}

// api/gemini.js lê SUPABASE_URL/SUPABASE_ANON_KEY do ambiente no momento
// em que o módulo é importado — garante que bate com o alvo do teste.
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_ANON_KEY = ANON_KEY;
// Nunca chega a ser usada: a tentativa de B falha no download do Storage,
// ANTES de qualquer chamada ao Gemini.
if (!process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = 'placeholder-nao-usado-neste-teste';

const adminHeaders = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

async function criarUsuarioDescartavel(rotulo) {
  const email = `teste-rls-${rotulo}-${Date.now()}-${Math.random().toString(36).slice(2)}@teste.tributagil.invalid`;

  const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (!resp.ok) throw new Error(`Falha ao criar usuário de teste "${rotulo}": HTTP ${resp.status} — ${await resp.text()}`);
  const usuario = await resp.json();

  // Sem senha/login por grant_type=password: o projeto tem hCaptcha exigido
  // nesse fluxo (proteção real contra bot, não deve ser contornada nem
  // desligada só pra este teste). Em vez disso, gera um magic link pela API
  // de admin (fluxo privilegiado, não sujeito a captcha) e troca o
  // token_hash por uma sessão de verdade via /auth/v1/verify — mesmo
  // resultado (um access_token real do usuário de teste), sem tocar na
  // proteção de captcha do login público.
  const linkResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  if (!linkResp.ok) throw new Error(`Falha ao gerar magic link pro usuário de teste "${rotulo}": HTTP ${linkResp.status} — ${await linkResp.text()}`);
  const linkData = await linkResp.json();
  const hashedToken = linkData.hashed_token;
  if (!hashedToken) throw new Error(`generate_link não retornou hashed_token pro usuário de teste "${rotulo}".`);

  const loginResp = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: hashedToken }),
  });
  if (!loginResp.ok) throw new Error(`Falha ao trocar o magic link por sessão do usuário de teste "${rotulo}": HTTP ${loginResp.status} — ${await loginResp.text()}`);
  const sessao = await loginResp.json();

  return { id: usuario.id, email, token: sessao.access_token };
}

async function apagarUsuario(id) {
  if (!id) return;
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: adminHeaders }).catch(() => {});
}

async function main() {
  console.log('Criando usuários de teste descartáveis (A e B)...');
  const usuarioA = await criarUsuarioDescartavel('a');
  const usuarioB = await criarUsuarioDescartavel('b');

  try {
    const storagePath = `${usuarioA.id}/teste-rls/documento.txt`;
    const conteudoSecreto = `SEGREDO-DE-A-${Math.random().toString(36).slice(2)}`;

    console.log('Subindo documento como A...');
    const uploadResp = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${usuarioA.token}`, 'Content-Type': 'text/plain' },
      body: conteudoSecreto,
    });
    if (!uploadResp.ok) {
      throw new Error(`Upload como A falhou (HTTP ${uploadResp.status}) — deveria funcionar, é a própria pasta de A. Corpo: ${await uploadResp.text()}`);
    }

    console.log('Sanity check: A consegue ler o próprio documento...');
    const leituraA = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${usuarioA.token}` },
    });
    assert.ok(leituraA.ok, 'A não conseguiu ler o próprio documento — RLS bloqueando demais, ambiente com problema (não é o cenário deste teste).');

    console.log('Tentando ler o documento de A direto no Storage, com o token de B (deve falhar)...');
    const leituraDiretaB = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${usuarioB.token}` },
    });
    assert.equal(leituraDiretaB.ok, false, 'VAZAMENTO: B leu o Storage de A diretamente — a policy de storage.objects está quebrada.');

    console.log('Tentando ler o documento de A via /api/gemini, com o token de B (o caminho real da aplicação)...');
    const { POST } = await import('../api/gemini.js');
    const request = new Request('http://localhost/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentos: [{ nome: 'documento.txt', mime_type: 'text/plain', storage_path: storagePath }],
        metadata: {},
        userToken: usuarioB.token,
      }),
    });
    const resposta = await POST(request);
    const corpoTexto = await resposta.text();

    assert.notEqual(resposta.status, 200, `VAZAMENTO: /api/gemini devolveu 200 pra B lendo documento de A. Corpo: ${corpoTexto.slice(0, 300)}`);
    assert.ok(
      !corpoTexto.includes(conteudoSecreto),
      'VAZAMENTO: a resposta de /api/gemini para B contém o conteúdo secreto do documento de A.',
    );

    console.log(`OK: /api/gemini recusou corretamente (HTTP ${resposta.status}) — isolamento entre usuários confirmado.`);
  } finally {
    console.log('Limpando usuários de teste...');
    await apagarUsuario(usuarioA.id);
    await apagarUsuario(usuarioB.id);
  }
}

main().catch((err) => {
  console.error('FALHA NO TESTE DE ISOLAMENTO:', err.message);
  process.exit(1);
});
