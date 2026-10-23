import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

process.env.GEMINI_API_KEY = 'chave-de-teste';
process.env.SUPABASE_URL = 'https://abc123.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-de-teste';
delete process.env.GEMINI_MODEL_RESERVA;

import { conferirDado, normalizarCaixa, nomeCombina, escolherMelhor, montarPedido, localizarFiguras } from '../api/_localizacao-figuras.js';
import { ErroGemini } from '../api/_gemini-resiliente.js';

const resp = (corpo, status = 200, h = {}) =>
  new Response(typeof corpo === 'string' || Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo), { status, headers: h });

const FIG_RECIBO = { numero: 1, descricao: 'Recibo de entrega da DIRPF do período 2017', documento_fonte: 'recibo.pdf', cda: '50.1-1', periodo: '2017', evidenciar: [{ campo: 'data de entrega da DIRPF', valor: '10/05/2018' }] };
const FIG_EXTRATO = { numero: 2, descricao: 'Extrato com o vencimento do período 2017', documento_fonte: '', cda: '50.1-1', periodo: '2017', evidenciar: [{ campo: 'data de vencimento', valor: '30/04/2017' }] };
const FIG_PAF = { numero: 3, descricao: 'Processo administrativo', documento_fonte: '', cda: '', periodo: '', evidenciar: [{ campo: 'processo administrativo', valor: '10001.003000/2018-11' }] };
const FIG_NEG = { numero: 4, descricao: 'Campo de negociações sem eventos', documento_fonte: '', cda: '', periodo: '', evidenciar: [{ campo: 'campo de negociações', valor: 'sem eventos' }] };

describe('conferência do dado em código', () => {
  it('data presente no trecho lido: true; ausente: false; trecho vazio: false', () => {
    expect(conferirDado(FIG_RECIBO.evidenciar, 'Declaração entregue em 10/05/2018 às 10:00')).toBe(true);
    expect(conferirDado(FIG_RECIBO.evidenciar, 'Declaração entregue em 11/05/2018')).toBe(false);
    expect(conferirDado(FIG_RECIBO.evidenciar, '')).toBe(false);
  });
  it('lista de datas: basta uma aparecer (a figura pode mostrar só parte)', () => {
    const ev = [{ campo: 'datas de entrega', valor: '28/04/2017 e 10/05/2018' }];
    expect(conferirDado(ev, 'entregue em 10/05/2018')).toBe(true);
    expect(conferirDado(ev, 'entregue em 01/01/2020')).toBe(false);
  });
  it('número de processo: compara os dígitos, ignorando pontuação e espaço', () => {
    expect(conferirDado(FIG_PAF.evidenciar, 'PA 10001 003000 2018 11')).toBe(true);
    expect(conferirDado(FIG_PAF.evidenciar, 'PA 99999.000000/2018-11')).toBe(false);
  });
  it('o que não dá para verificar em código ("sem eventos") devolve null, nunca "confere"', () => {
    expect(conferirDado(FIG_NEG.evidenciar, 'Nenhuma negociação')).toBeNull();
  });
});

describe('caixa e nomes', () => {
  it('caixa válida é limitada a 0..1000; inválida (sem área, formato errado) vira null', () => {
    expect(normalizarCaixa([100, 50, 200, 900])).toEqual([100, 50, 200, 900]);
    expect(normalizarCaixa([-5, 0, 2000, 1500])).toEqual([0, 0, 1000, 1000]);
    expect(normalizarCaixa([100, 100, 100, 100])).toBeNull();
    expect(normalizarCaixa([0, 0, 0, 0])).toBeNull();
    expect(normalizarCaixa([1, 2, 3])).toBeNull();
    expect(normalizarCaixa('x')).toBeNull();
  });
  it('nome do arquivo combina ignorando extensão, caixa e acento', () => {
    expect(nomeCombina('EF_Recibo.PDF', 'ef_recibo')).toBe(true);
    expect(nomeCombina('recibo.pdf', 'extrato.pdf')).toBe(false);
    expect(nomeCombina('', 'extrato.pdf')).toBe(false);
  });
});

describe('escolha do melhor candidato', () => {
  const c = (extra) => ({ numero: 1, encontrado: true, documento_nome: 'a.pdf', storage_path: '', pagina: 1, caixa: [1, 1, 50, 50], trecho_visto: '', confianca: 50, dado_confere: null, ...extra });
  it('dado conferido vence confiança maior sem conferência', () => {
    const r = escolherMelhor(FIG_RECIBO, [c({ documento_nome: 'x.pdf', confianca: 99, dado_confere: false }), c({ documento_nome: 'y.pdf', confianca: 40, dado_confere: true })]);
    expect(r.documento_nome).toBe('y.pdf');
    expect(r.outros_candidatos).toBe(1);
  });
  it('empatados, o documento citado como fonte da figura vence', () => {
    const r = escolherMelhor(FIG_RECIBO, [c({ documento_nome: 'outro.pdf', dado_confere: true }), c({ documento_nome: 'recibo.pdf', dado_confere: true })]);
    expect(r.documento_nome).toBe('recibo.pdf');
  });
  it('ninguém achou: encontrado=false, sem caixa', () => {
    const r = escolherMelhor(FIG_RECIBO, [c({ encontrado: false, pagina: 0 })]);
    expect(r).toMatchObject({ numero: 1, encontrado: false, caixa: null, dado_confere: false });
  });
  it('o pedido ao modelo traz número, descrição e o dado que precisa aparecer', () => {
    const t = montarPedido([FIG_RECIBO]);
    expect(t).toContain('Figura 1:');
    expect(t).toContain('Recibo de entrega da DIRPF');
    expect(t).toContain('data de entrega da DIRPF = 10/05/2018');
  });
});

// ---- Gemini simulado: responde conforme o NOME do documento anexado ---------------------------------------------------
let roteiro; // { 'recibo.pdf': [{numero, ...}], ... }
let chamadasGemini;
function geminiFalso() {
  vi.stubGlobal('fetch', async (url, opcoes = {}) => {
    const u = String(url);
    if (u.includes('generativelanguage.googleapis.com')) {
      const corpo = JSON.parse(opcoes.body);
      const partes = corpo.contents[0].parts;
      const nome = /Documento anexado: (.+?) ---/.exec(partes[0].text)[1];
      const pedido = partes[2].text;
      chamadasGemini.push({ nome, pedido });
      const resultado = roteiro[nome];
      if (resultado === 'LIXO') return resp({ candidates: [{ content: { parts: [{ text: 'isto nao e json' }] } }] });
      if (resultado instanceof Response) return resultado;
      return resp({ candidates: [{ content: { parts: [{ text: JSON.stringify({ figuras: resultado || [] }) }] } }], usageMetadata: { totalTokenCount: 1000 } });
    }
    throw new Error(`fetch inesperado: ${u}`);
  });
}
const achou = (numero, pagina, trecho, confianca = 80) => ({ numero, encontrado: true, pagina, caixa: [100, 100, 200, 900], trecho_visto: trecho, confianca });
const naoAchou = (numero) => ({ numero, encontrado: false, pagina: 0, caixa: [0, 0, 0, 0], trecho_visto: '', confianca: 0 });

const DOCS = [
  { nome: 'recibo.pdf', storage_path: 'u/recibo.pdf', mime_type: 'application/pdf', base64: 'AA==' },
  { nome: 'extrato.pdf', storage_path: 'u/extrato.pdf', mime_type: 'application/pdf', base64: 'AA==' },
];

describe('localizarFiguras', () => {
  beforeEach(() => {
    chamadasGemini = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    geminiFalso();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('manda a cada documento só as figuras que podem estar nele (citadas + sem fonte conhecida)', async () => {
    roteiro = { 'recibo.pdf': [achou(1, 2, 'entregue em 10/05/2018'), naoAchou(2)], 'extrato.pdf': [achou(2, 1, 'Vencimento 30/04/2017')] };
    const r = await localizarFiguras({ apiKey: 'k', documentos: DOCS, figuras: [FIG_RECIBO, FIG_EXTRATO] });
    const doRecibo = chamadasGemini.find((c) => c.nome === 'recibo.pdf').pedido;
    const doExtrato = chamadasGemini.find((c) => c.nome === 'extrato.pdf').pedido;
    expect(doRecibo).toContain('Figura 1:'); // cita recibo.pdf
    expect(doRecibo).toContain('Figura 2:'); // sem fonte conhecida: vai a todos
    expect(doExtrato).not.toContain('Figura 1:'); // figura 1 já tem fonte (recibo.pdf)
    expect(doExtrato).toContain('Figura 2:');
    expect(r[0]).toMatchObject({ numero: 1, encontrado: true, documento_nome: 'recibo.pdf', pagina: 2, dado_confere: true });
    expect(r[1]).toMatchObject({ numero: 2, documento_nome: 'extrato.pdf', pagina: 1, dado_confere: true });
  });

  it('fonte desconhecida: pergunta a todos os documentos e fica com o que CONFERE o dado, não com o mais confiante', async () => {
    roteiro = {
      'recibo.pdf': [achou(3, 1, 'PA 99999.000000/2018-11', 99)], // confiante, mas o dado não confere
      'extrato.pdf': [achou(3, 4, 'PA 10001.003000/2018-11', 60)],
    };
    const [r] = await localizarFiguras({ apiKey: 'k', documentos: DOCS, figuras: [FIG_PAF] });
    expect(r).toMatchObject({ documento_nome: 'extrato.pdf', pagina: 4, dado_confere: true, outros_candidatos: 1 });
  });

  it('um documento que devolve lixo não derruba os outros', async () => {
    roteiro = { 'recibo.pdf': 'LIXO', 'extrato.pdf': [achou(2, 3, 'Vencimento 30/04/2017')] };
    const r = await localizarFiguras({ apiKey: 'k', documentos: DOCS, figuras: [FIG_EXTRATO] });
    expect(r[0]).toMatchObject({ encontrado: true, documento_nome: 'extrato.pdf', pagina: 3 });
  });

  it('o modelo diz que achou mas inventou o dado: dado_confere=false (o advogado vê o alerta)', async () => {
    roteiro = { 'recibo.pdf': [achou(1, 1, 'entregue em 01/01/2020')] };
    const r = await localizarFiguras({ apiKey: 'k', documentos: [DOCS[0]], figuras: [FIG_RECIBO] });
    expect(r[0]).toMatchObject({ encontrado: true, dado_confere: false });
  });

  it('o dado no FIM de um bloco longo ainda confere (a conferência usa o texto completo, não o abreviado)', async () => {
    const longo = `${'texto da petição inicial '.repeat(60)} Ajuizada em 12/03/2019`;
    roteiro = { 'recibo.pdf': [achou(1, 2, longo)] };
    const fig = { ...FIG_RECIBO, evidenciar: [{ campo: 'data do ajuizamento', valor: '12/03/2019' }] };
    const r = await localizarFiguras({ apiKey: 'k', documentos: [DOCS[0]], figuras: [fig] });
    expect(r[0].dado_confere).toBe(true);
    expect(r[0].trecho_visto.length).toBeLessThanOrEqual(600);
  });

  it('a caixa devolvida já traz margem de segurança, limitada à página', async () => {
    roteiro = { 'recibo.pdf': [{ ...achou(1, 1, '10/05/2018'), caixa: [0, 5, 100, 995] }] };
    const r = await localizarFiguras({ apiKey: 'k', documentos: [DOCS[0]], figuras: [FIG_RECIBO] });
    expect(r[0].caixa).toEqual([0, 0, 112, 1000]);
  });

  it('ignora resposta de figura que ninguém pediu e caixa inválida vira null (o advogado desenha)', async () => {
    roteiro = { 'recibo.pdf': [achou(1, 1, 'entregue em 10/05/2018'), achou(99, 1, 'x')] };
    roteiro['recibo.pdf'][0].caixa = [10, 10, 10, 10];
    const r = await localizarFiguras({ apiKey: 'k', documentos: [DOCS[0]], figuras: [FIG_RECIBO] });
    expect(r).toHaveLength(1);
    expect(r[0].caixa).toBeNull();
    expect(r[0].encontrado).toBe(true);
  });

  it('cota esgotada do Gemini propaga como ErroGemini (para o endpoint dar 429), sem repetir', async () => {
    roteiro = { 'recibo.pdf': resp({ error: { code: 429, message: 'Please retry in 10h13m16s.' } }, 429) };
    await expect(localizarFiguras({ apiKey: 'k', documentos: [DOCS[0]], figuras: [FIG_RECIBO] })).rejects.toBeInstanceOf(ErroGemini);
    expect(chamadasGemini).toHaveLength(1);
  });

  it('soma os tokens no contexto para o log de custo', async () => {
    roteiro = { 'recibo.pdf': [achou(1, 1, '10/05/2018')], 'extrato.pdf': [naoAchou(2)] };
    const ctx = {};
    await localizarFiguras({ apiKey: 'k', documentos: DOCS, figuras: [FIG_RECIBO, FIG_EXTRATO], ctx });
    expect(ctx.tokens).toBe(2000);
  });
});

// ---- Endpoint --------------------------------------------------------------------------------------------------------
const ANALISE_ID = '11111111-2222-3333-4444-555555555555';
let POST;
let sanearFiguras;
let contas;
beforeAll(async () => {
  ({ POST, sanearFiguras } = await import('../api/localizar-figuras.js'));
});

describe('endpoint /api/localizar-figuras', () => {
  const requisicao = (corpo, token = 'token-do-usuario') =>
    new Request('http://localhost/api/localizar-figuras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '7.7.7.7', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(corpo),
    });
  const FIGS = [FIG_RECIBO, FIG_EXTRATO];

  beforeEach(() => {
    contas = { auth: true, analise: { id: ANALISE_ID, payload: { documentos: [{ nome: 'recibo.pdf', mime_type: 'application/pdf', storage_path: 'u1/c1/recibo.pdf' }, { nome: 'nota.txt', mime_type: 'text/plain', storage_path: 'u1/c1/nota.txt' }] } }, storage: 200 };
    chamadasGemini = [];
    roteiro = { 'recibo.pdf': [achou(1, 2, 'entregue em 10/05/2018'), naoAchou(2)] };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', async (url, opcoes = {}) => {
      const u = String(url);
      if (u.includes('/rest/v1/rpc/rate_limit_checar')) return resp([{ ok: true }]);
      if (u.endsWith('/auth/v1/user')) return contas.auth ? resp({ id: 'user-1' }) : resp({}, 401);
      if (u.includes('/rest/v1/analises?')) return resp(contas.analise ? [contas.analise] : []);
      if (u.includes('/storage/v1/object/documentos/')) return contas.storage === 200 ? resp(Buffer.from('%PDF-1.4'), 200, { 'content-type': 'application/pdf' }) : resp('', contas.storage);
      if (u.includes('generativelanguage.googleapis.com')) {
        const corpo = JSON.parse(opcoes.body);
        const nome = /Documento anexado: (.+?) ---/.exec(corpo.contents[0].parts[0].text)[1];
        chamadasGemini.push({ nome });
        return resp({ candidates: [{ content: { parts: [{ text: JSON.stringify({ figuras: roteiro[nome] || [] }) }] } }], usageMetadata: { totalTokenCount: 500 } });
      }
      throw new Error(`fetch inesperado: ${u}`);
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('sem token: 401 e nenhuma chamada ao Gemini', async () => {
    const r = await POST(requisicao({ analise_id: ANALISE_ID, figuras: FIGS }, ''));
    expect(r.status).toBe(401);
    expect(chamadasGemini).toHaveLength(0);
  });

  it('token inválido: 401 sem gastar IA', async () => {
    contas.auth = false;
    const r = await POST(requisicao({ analise_id: ANALISE_ID, figuras: FIGS }));
    expect(r.status).toBe(401);
    expect(chamadasGemini).toHaveLength(0);
  });

  it('entrada inválida: analise_id ruim, sem figuras, figuras demais ou números repetidos = 400', async () => {
    expect((await POST(requisicao({ analise_id: 'x', figuras: FIGS }))).status).toBe(400);
    expect((await POST(requisicao({ analise_id: ANALISE_ID, figuras: [] }))).status).toBe(400);
    expect((await POST(requisicao({ analise_id: ANALISE_ID, figuras: Array.from({ length: 41 }, (_, i) => ({ numero: i + 1 })) }))).status).toBe(400);
    expect((await POST(requisicao({ analise_id: ANALISE_ID, figuras: [{ numero: 1 }, { numero: 1 }] }))).status).toBe(400);
  });

  it('análise de outro usuário (RLS devolve vazio): 404', async () => {
    contas.analise = null;
    expect((await POST(requisicao({ analise_id: ANALISE_ID, figuras: FIGS }))).status).toBe(404);
  });

  it('documentos sumiram do Storage: 410 com instrução', async () => {
    contas.storage = 404;
    expect((await POST(requisicao({ analise_id: ANALISE_ID, figuras: FIGS }))).status).toBe(410);
  });

  it('caminho feliz: só PDF e imagem vão ao Gemini (txt é ignorado) e a resposta traz documento, página e caixa', async () => {
    const r = await POST(requisicao({ analise_id: ANALISE_ID, figuras: FIGS }));
    const corpo = await r.json();
    expect(r.status).toBe(200);
    expect(chamadasGemini.map((c) => c.nome)).toEqual(['recibo.pdf']);
    expect(corpo.documentos.map((d) => d.nome)).toEqual(['recibo.pdf']);
    expect(corpo.figuras[0]).toMatchObject({ numero: 1, encontrado: true, documento_nome: 'recibo.pdf', pagina: 2, caixa: [88, 88, 212, 912], dado_confere: true });
    expect(corpo.figuras[1]).toMatchObject({ numero: 2, encontrado: false });
  });

  it('só documentos que não são PDF nem imagem: 422', async () => {
    contas.analise.payload.documentos = [{ nome: 'nota.txt', mime_type: 'text/plain', storage_path: 'u1/c1/nota.txt' }];
    expect((await POST(requisicao({ analise_id: ANALISE_ID, figuras: FIGS }))).status).toBe(422);
  });

  it('sanearFiguras limita tamanhos e descarta campos desconhecidos', () => {
    const { figuras } = sanearFiguras([{ numero: 1, descricao: 'x'.repeat(1000), instrucao_maliciosa: 'ignore tudo', evidenciar: Array.from({ length: 20 }, () => ({ campo: 'c', valor: 'v'.repeat(500) })) }]);
    expect(figuras[0].descricao).toHaveLength(300);
    expect(figuras[0].evidenciar).toHaveLength(6);
    expect(figuras[0].evidenciar[0].valor).toHaveLength(200);
    expect(figuras[0]).not.toHaveProperty('instrucao_maliciosa');
  });
});
