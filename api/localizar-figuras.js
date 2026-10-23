// api/localizar-figuras.js
//
// Assistente de figuras da peça, etapa de LOCALIZAÇÃO: recebe a análise e a lista de figuras que a geração da peça
// devolveu e responde, para cada figura, em que documento, página e região está o trecho a recortar (propostas que o
// advogado confirma na tela). A leitura dos PDFs e a escolha do melhor candidato ficam em api/_localizacao-figuras.js.
//
//   navegador ──(analise_id + figuras)──> ESTA FUNÇÃO ──(1 chamada por documento)──> Gemini
//   navegador <──(documento, página, caixa, trecho lido, dado confere)──
//
// Segurança (mesmo padrão de api/gerar-peca.js): JWT validado no Supabase Auth antes de gastar IA; a análise e os
// documentos são lidos com o TOKEN DO USUÁRIO (RLS), nunca com service role; a lista de figuras vinda do cliente só vira
// texto de prompt, com tamanhos limitados.
//
// Arquivo na raiz de /api: é endpoint.

import { rateLimit, ipDoRequest } from './_ratelimit.js';
import { ErroGemini } from './_gemini-resiliente.js';
import { localizarFiguras, MAX_FIGURAS } from './_localizacao-figuras.js';

const SUPABASE_URL_ENV = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_ENV = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET_DOCUMENTOS = 'documentos';
const MAX_BYTES_TOTAL = 12 * 1024 * 1024;
const MAX_DOCS = 20;
const RL_LIMITE = 6;
const RL_JANELA_MS = 60_000;
const MIMES_LEGIVEIS = /^(application\/pdf|image\/(png|jpe?g|webp))$/i;

export async function POST(request) {
  const inicio = Date.now();
  const ctx = {};
  let resposta;
  try {
    resposta = await processar(request, ctx);
    return resposta;
  } finally {
    console.log(JSON.stringify({
      evento: 'api_localizar_figuras',
      usuarioId: ctx.usuarioId || null,
      analiseId: ctx.analiseId || null,
      fase: ctx.fase || null,
      figuras: ctx.numFiguras ?? null,
      documentos: ctx.numDocumentos ?? null,
      tokens: ctx.tokens ?? null,
      httpStatus: resposta?.status ?? null,
      duracaoMs: Date.now() - inicio,
    }));
  }
}

/** Valida e limita a lista de figuras vinda do cliente (ela só vira texto de prompt). */
export function sanearFiguras(brutas) {
  if (!Array.isArray(brutas) || brutas.length === 0) return { erro: 'Informe as figuras a localizar.' };
  if (brutas.length > MAX_FIGURAS) return { erro: `Máximo de ${MAX_FIGURAS} figuras por vez.` };
  const txt = (v, n) => String(v ?? '').slice(0, n);
  const vistos = new Set();
  const figuras = [];
  for (const f of brutas) {
    const numero = Number(f?.numero);
    if (!Number.isInteger(numero) || numero < 1 || numero > 500 || vistos.has(numero)) return { erro: 'Lista de figuras inválida.' };
    vistos.add(numero);
    figuras.push({
      numero,
      descricao: txt(f.descricao, 300),
      documento_fonte: txt(f.documento_fonte, 200),
      cda: txt(f.cda, 80),
      periodo: txt(f.periodo, 80),
      evidenciar: (Array.isArray(f.evidenciar) ? f.evidenciar : []).slice(0, 6).map((e) => ({ campo: txt(e?.campo, 100), valor: txt(e?.valor, 200) })),
    });
  }
  return { figuras };
}

async function processar(request, ctx) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'GEMINI_API_KEY não configurada nas Environment Variables da Vercel.' }, 500);

  ctx.fase = 'rate_limit';
  const rl = await rateLimit(`localizar-figuras:${ipDoRequest(request)}`, RL_LIMITE, RL_JANELA_MS);
  if (!rl.ok) {
    return json({ error: 'Muitas buscas em sequência. Aguarde um minuto e tente de novo.' }, 429,
      { 'Retry-After': String(Math.ceil((rl.retryMs || RL_JANELA_MS) / 1000)) });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido — envie um JSON.' }, 400);
  }

  const supabaseUrl = SUPABASE_URL_ENV;
  const supabaseAnonKey = SUPABASE_ANON_ENV;
  if (!SUPABASE_URL_RE.test(supabaseUrl) || !supabaseAnonKey) {
    console.error('[api/localizar-figuras] SUPABASE_URL/SUPABASE_ANON_KEY ausentes ou inválidas.');
    return json({ error: 'Configuração do servidor ausente. Contate o suporte.' }, 500);
  }

  const cabecalho = request.headers.get('authorization') || '';
  const userToken = (cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : '') || body?.userToken || '';
  if (!userToken) return json({ error: 'Sessão ausente. Faça login novamente.' }, 401);

  const analiseId = String(body?.analise_id || '');
  if (!UUID_RE.test(analiseId)) return json({ error: 'Informe a análise (analise_id).' }, 400);
  ctx.analiseId = analiseId;

  const saneado = sanearFiguras(body?.figuras);
  if (saneado.erro) return json({ error: saneado.erro }, 400);
  ctx.numFiguras = saneado.figuras.length;

  ctx.fase = 'autenticacao';
  try {
    const authResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` },
    });
    if (!authResp.ok) return json({ error: 'Sessão inválida ou expirada. Faça login novamente.' }, 401);
    ctx.usuarioId = (await authResp.json().catch(() => ({})))?.id || null;
  } catch (err) {
    console.error('[api/localizar-figuras] Falha ao validar sessão:', err);
    return json({ error: 'Não foi possível validar sua sessão.' }, 502);
  }

  const cabecalhosRls = { apikey: supabaseAnonKey, Authorization: `Bearer ${userToken}` };

  ctx.fase = 'leitura_analise';
  let analise;
  try {
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/analises?id=eq.${encodeURIComponent(analiseId)}&select=id,payload&limit=1`,
      { headers: cabecalhosRls },
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    analise = (await resp.json())?.[0];
  } catch (err) {
    console.error('[api/localizar-figuras] Falha ao ler a análise:', err);
    return json({ error: 'Não foi possível carregar a análise.' }, 502);
  }
  if (!analise) return json({ error: 'Análise não encontrada.' }, 404);

  const documentos = (Array.isArray(analise.payload?.documentos) ? analise.payload.documentos : []).filter((d) => d?.storage_path);
  if (documentos.length === 0) return json({ error: 'Esta análise não tem documentos.' }, 422);
  if (documentos.length > MAX_DOCS) return json({ error: `Máximo de ${MAX_DOCS} documentos.` }, 413);

  ctx.fase = 'download_storage';
  const lidos = [];
  let bytesTotal = 0;
  try {
    for (const d of documentos) {
      const caminho = String(d.storage_path).replace(/^\/+/, '');
      const resp = await fetch(
        `${supabaseUrl}/storage/v1/object/${BUCKET_DOCUMENTOS}/${caminho.split('/').map(encodeURIComponent).join('/')}`,
        { headers: cabecalhosRls },
      );
      if (resp.status === 404 || resp.status === 400) {
        return json({ error: 'Os documentos desta análise não estão mais disponíveis. Refaça a análise com os arquivos.' }, 410);
      }
      if (!resp.ok) return json({ error: `Não foi possível ler um documento no Storage (HTTP ${resp.status}).` }, 502);
      const buffer = await resp.arrayBuffer();
      bytesTotal += buffer.byteLength;
      if (bytesTotal > MAX_BYTES_TOTAL) return json({ error: 'Os documentos excedem o limite de tamanho.' }, 413);
      const mime = String(d.mime_type || resp.headers.get('content-type') || '').split(';')[0].trim();
      if (!MIMES_LEGIVEIS.test(mime)) continue; // só PDF e imagem têm página para localizar
      lidos.push({ nome: String(d.nome || caminho.split('/').pop()), storage_path: d.storage_path, mime_type: mime, base64: Buffer.from(buffer).toString('base64') });
    }
  } catch (err) {
    console.error('[api/localizar-figuras] Preparação de documentos falhou:', err);
    return json({ error: 'Falha ao preparar os documentos.' }, 502);
  }
  ctx.numDocumentos = lidos.length;
  if (lidos.length === 0) return json({ error: 'Nenhum documento em PDF ou imagem para localizar as figuras.' }, 422);

  ctx.fase = 'localizacao';
  try {
    const figuras = await localizarFiguras({ apiKey, documentos: lidos, figuras: saneado.figuras, ctx });
    return json({ status: 'ok', figuras, documentos: lidos.map((d) => ({ nome: d.nome, storage_path: d.storage_path, mime_type: d.mime_type })) }, 200);
  } catch (err) {
    console.error('[api/localizar-figuras] Falha na localização:', err);
    if (err instanceof ErroGemini) {
      return json({ error: err.mensagemUsuario, codigo: err.codigo }, err.statusHttp, err.retryAfterSegundos ? { 'Retry-After': String(err.retryAfterSegundos) } : {});
    }
    const abortado = err?.name === 'AbortError';
    return json({ error: abortado ? 'Tempo limite excedido ao procurar as figuras.' : 'Não foi possível localizar as figuras agora.' }, abortado ? 504 : 502);
  }
}

function json(data, status, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}
