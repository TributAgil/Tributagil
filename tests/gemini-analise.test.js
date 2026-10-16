import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// Teste de ponta a ponta do endpoint da ANÁLISE (api/gemini.js), com Supabase e Gemini simulados: login, crédito,
// idempotência, download do documento, fase 1 (leitura), fase 2 (parecer em streaming) e o estorno automático.
// Garante que a resistência a 502/503/402 não mudou o que o endpoint já fazia: cobrar uma vez, entregar o parecer e,
// se a IA falhar, devolver o crédito.

process.env.GEMINI_API_KEY = 'chave-de-teste';
process.env.SUPABASE_URL = 'https://abc123.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-de-teste';
delete process.env.GEMINI_MODEL;
delete process.env.GEMINI_MODEL_RESERVA;

let POST;
let rpcs; // nomes das RPCs do Supabase chamadas, em ordem
let urlsGemini; // URLs do Gemini chamadas, em ordem
let gemini; // roteiro do Gemini: { extracao: [fn...], geracao: [fn...] }; a última se repete

const resp = (corpo, status = 200, headers = {}) =>
  new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers });

const EVENTOS = [
  { data: '10/03/2017', categoria: 'processual', descricao: 'Ajuizamento da execução', fonte: 'cda.pdf' },
  { data: '15/05/2017', categoria: 'processual', descricao: 'Citação', fonte: 'cda.pdf' },
  { data: '20/08/2018', categoria: 'tributaria', descricao: 'Inscrição em dívida ativa', fonte: 'cda.pdf' },
];
const EXTRACAO_OK = () => resp({ candidates: [{ content: { parts: [{ text: JSON.stringify({ eventos: EVENTOS, alerta_ilegivel: '' }) }] } }], usageMetadata: { totalTokenCount: 4321 } });
const PARECER = { metadata: { processo: '1' }, conclusoes: [{ id: 1, tipo: 'cautela', severidade: 'neutro', titulo: 't', resumo: 'r', fundamento_legal: 'f', confianca: 80 }], fatos_importantes: [], raciocinio: [], recomendacoes: [], alerta_dados_insuficientes: '' };
const STREAM_OK = () => resp(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(PARECER) }] } }] })}\n\n`, 200, { 'content-type': 'text/event-stream' });
const ERRO = (status, corpo = { error: { status: 'X', message: 'x' } }) => () => resp(corpo, status);

function roteiroPadrao(extra = {}) {
  return { extracao: [EXTRACAO_OK], geracao: [STREAM_OK], credito: 'ok', ...extra };
}

beforeAll(async () => {
  ({ POST } = await import('../api/gemini.js'));
});

beforeEach(() => {
  rpcs = [];
  urlsGemini = [];
  gemini = roteiroPadrao();
  const cursor = { extracao: -1, geracao: -1 };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', async (url) => {
    const u = String(url);
    if (u.includes('/rest/v1/rpc/')) {
      const nome = u.split('/rpc/')[1];
      rpcs.push(nome);
      if (nome === 'rate_limit_checar') return resp([{ ok: true }]);
      if (nome === 'idempotencia_reclamar') return resp([{ acao: 'cobrar' }]);
      if (nome === 'consumir_credito') return gemini.credito === 'ok' ? resp('', 200) : resp({ message: 'SEM_CREDITOS' }, 400);
      return new Response(null, { status: 204 }); // 204 não aceita corpo
    }
    if (u.endsWith('/auth/v1/user')) return resp({ id: 'user-1' });
    if (u.includes('/storage/v1/object/documentos/')) return resp(Buffer.from('%PDF-1.4 teste'), 200, { 'content-type': 'application/pdf' });
    if (u.includes('generativelanguage.googleapis.com')) {
      urlsGemini.push(u);
      const fase = u.includes(':streamGenerateContent') ? 'geracao' : 'extracao';
      const lista = gemini[fase];
      cursor[fase] += 1;
      return lista[Math.min(cursor[fase], lista.length - 1)]();
    }
    throw new Error(`fetch inesperado: ${u}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.GEMINI_MODEL_RESERVA;
});

const requisicao = () =>
  new Request('http://localhost/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
    body: JSON.stringify({
      userToken: 'token-do-usuario',
      documentos: [{ nome: 'cda.pdf', mime_type: 'application/pdf', storage_path: 'user-1/caso-1/cda.pdf' }],
      metadata: { caso_id: 'c1', analise_id: 'a1' },
    }),
  });

// Roda o endpoint adiantando as esperas (2s, 5s, 12s) das repetições
async function chamar() {
  vi.useFakeTimers();
  const pendente = POST(requisicao());
  await vi.runAllTimersAsync();
  const r = await pendente;
  vi.useRealTimers();
  return r;
}

const jaCobrou = () => rpcs.filter((n) => n === 'consumir_credito').length;
const estornou = () => rpcs.includes('idempotencia_falhar_e_estornar');

describe('api/gemini.js: caminho feliz', () => {
  it('lê, gera o parecer em streaming, cobra UM crédito e confirma a entrega, sem estorno', async () => {
    const r = await chamar();
    expect(r.status, await r.clone().text()).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/event-stream/);
    const texto = await r.text();
    expect(texto).toContain('conclusoes');
    await vi.waitFor(() => expect(rpcs).toContain('idempotencia_confirmar_entrega'));
    expect(jaCobrou()).toBe(1);
    expect(estornou()).toBe(false);
    expect(urlsGemini.filter((u) => u.includes(':generateContent')).length).toBe(1); // fase 1
    expect(urlsGemini.filter((u) => u.includes(':streamGenerateContent')).length).toBe(1); // fase 2
    expect(urlsGemini.every((u) => u.includes('/models/gemini-3.5-flash:'))).toBe(true);
  });

  it('sem créditos: 402 antes de chamar o Gemini', async () => {
    gemini = roteiroPadrao({ credito: 'sem' });
    const r = await chamar();
    expect(r.status).toBe(402);
    expect(urlsGemini.length).toBe(0);
  });
});

describe('api/gemini.js: o Gemini oscila e o sistema aguenta', () => {
  it('fase 1 com 503 duas vezes e depois OK: a análise sai normalmente', async () => {
    gemini = roteiroPadrao({ extracao: [ERRO(503), ERRO(503), EXTRACAO_OK] });
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('conclusoes');
    expect(urlsGemini.filter((u) => u.includes(':generateContent')).length).toBe(3);
    expect(estornou()).toBe(false);
  });

  it('fase 2 (streaming) com 503 uma vez e depois OK: a análise sai normalmente', async () => {
    gemini = roteiroPadrao({ geracao: [ERRO(503), STREAM_OK] });
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('conclusoes');
    expect(estornou()).toBe(false);
  });

  it('fase 1 sobrecarregada o tempo todo: 503 com mensagem clara, Retry-After e o crédito é ESTORNADO', async () => {
    gemini = roteiroPadrao({ extracao: [ERRO(503)] });
    const r = await chamar();
    const corpo = await r.json();
    expect(r.status).toBe(503);
    expect(corpo.error).toMatch(/sobrecarregado/);
    expect(corpo.codigo).toBe('gemini_sobrecarga');
    expect(r.headers.get('Retry-After')).toBe('120');
    expect(estornou()).toBe(true);
    expect(urlsGemini.filter((u) => u.includes(':streamGenerateContent')).length).toBe(0);
  });

  it('fase 2 sobrecarregada o tempo todo: 503 e o crédito é ESTORNADO', async () => {
    gemini = roteiroPadrao({ geracao: [ERRO(503)] });
    const r = await chamar();
    expect(r.status).toBe(503);
    expect((await r.json()).codigo).toBe('gemini_sobrecarga');
    expect(estornou()).toBe(true);
  });

  it('principal sobrecarregado e GEMINI_MODEL_RESERVA configurado: a reserva atende a fase 1', async () => {
    process.env.GEMINI_MODEL_RESERVA = 'gemini-reserva-teste';
    let n = 0;
    gemini = roteiroPadrao({ extracao: [() => (++n <= 4 ? resp({ error: { status: 'UNAVAILABLE' } }, 503) : EXTRACAO_OK())] });
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(urlsGemini.some((u) => u.includes('/models/gemini-reserva-teste:generateContent'))).toBe(true);
    expect(estornou()).toBe(false);
  });
});

describe('api/gemini.js: 402 e cota do Gemini', () => {
  const CREDITOS = () => resp({ error: { code: 402, status: 'RESOURCE_EXHAUSTED', message: 'Your prepayment credits are depleted.' } }, 402);

  it('402 intermitente na fase 1: repete e a análise sai', async () => {
    gemini = roteiroPadrao({ extracao: [CREDITOS, EXTRACAO_OK] });
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(estornou()).toBe(false);
  });

  it('402 que persiste: cliente vê só "serviço indisponível" (sem falar de crédito), log de alerta e crédito ESTORNADO', async () => {
    gemini = roteiroPadrao({ extracao: [CREDITOS] });
    const r = await chamar();
    const corpo = await r.json();
    expect(r.status).toBe(503);
    expect(corpo.error).toBe('O serviço de IA está temporariamente indisponível. Tente novamente em alguns minutos.');
    expect(corpo.error).not.toMatch(/cr[eé]dito|402|faturamento/i);
    expect(corpo.codigo).toBe('gemini_indisponivel');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[ALERTA-GEMINI-CREDITOS]'));
    expect(estornou()).toBe(true);
  });

  it('cota diária esgotada (429, retry in 10h): 429 com a explicação, sem repetir, crédito ESTORNADO', async () => {
    gemini = roteiroPadrao({ extracao: [ERRO(429, { error: { code: 429, message: 'Quota exceeded ... Please retry in 10h13m16.34s.' } })] });
    const r = await chamar();
    const corpo = await r.json();
    expect(r.status).toBe(429);
    expect(corpo.error).toMatch(/limite de uso da IA/);
    expect(urlsGemini.length).toBe(1);
    expect(estornou()).toBe(true);
  });

  it('erro 400 do Gemini (requisição recusada): 502 com o código HTTP, sem repetir e crédito ESTORNADO', async () => {
    gemini = roteiroPadrao({ extracao: [ERRO(400, { error: { message: 'schema inválido' } })] });
    const r = await chamar();
    expect(r.status).toBe(502);
    expect((await r.json()).error).toBe('Falha na API do Gemini (HTTP 400).');
    expect(urlsGemini.length).toBe(1);
    expect(estornou()).toBe(true);
  });
});
