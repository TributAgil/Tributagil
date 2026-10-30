import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { paginasDoPdf } from '../api/_documentos-caso.js';

// api/lu-peca.js lê estas variáveis na importação do módulo
process.env.GEMINI_API_KEY = 'chave-de-teste';
process.env.SUPABASE_URL = 'https://abc123.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-de-teste';

const ANALISE_ID = '11111111-2222-3333-4444-555555555555';
let api;
let chamadas;
let cenario;

const resp = (corpo, status = 200, headers = {}) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers });
const pdfDePaginas = (n) => `%PDF-1.4\n${Array.from({ length: n }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`).join('\n')}\n2 0 obj << /Type /Pages /Count ${n} >> endobj`;
const respostaConversa = (extra = {}) => ({
  resposta: 'A CDA 80.1.20.000001-01 venceu em 30/04/2016.',
  fontes: [{ tipo: 'documento', referencia: 'cda.pdf', pagina: 2 }],
  proposta: { paragrafo: 0, texto: '', explicacao: '' },
  ...extra,
});

beforeAll(async () => {
  api = await import('../api/lu-peca.js');
});

beforeEach(() => {
  chamadas = [];
  cenario = {
    documentos: [
      { nome: 'cda.pdf', storage_path: 'user-1/a/1_cda.pdf', mime_type: 'application/pdf' },
      { nome: 'planilha.xlsx', storage_path: 'user-1/a/2_planilha.xlsx', mime_type: 'application/vnd.ms-excel' },
    ],
    arquivos: { 'user-1/a/1_cda.pdf': pdfDePaginas(3) },
    lu: respostaConversa(),
    gastoHoje: 0,
    uso: { promptTokenCount: 5000, candidatesTokenCount: 200, thoughtsTokenCount: 100, totalTokenCount: 5300 },
  };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', async (url, opcoes = {}) => {
    const u = String(url);
    chamadas.push({ url: u, opcoes });
    if (u.includes('/rest/v1/rpc/rate_limit_checar')) return resp([{ ok: true }]);
    if (u.includes('/rest/v1/rpc/consumo_lu_hoje')) return resp([{ creditos: cenario.gastoHoje, pedidos: 0, dia: '2026-10-30' }]);
    if (u.includes('/rest/v1/rpc/registrar_consumo_lu')) {
      cenario.gastoHoje += JSON.parse(opcoes.body).p_creditos;
      return resp(cenario.gastoHoje);
    }
    if (u.endsWith('/auth/v1/user')) return resp({ id: 'user-1' });
    if (u.includes('/rest/v1/analises?')) {
      return resp([{ id: ANALISE_ID, resultado: { metadata: { processo: '123' }, fatos_importantes: [], conclusoes: [] }, payload: { documentos: cenario.documentos } }]);
    }
    if (u.includes('/storage/v1/object/documentos/')) {
      const caminho = decodeURIComponent(u.split('/storage/v1/object/documentos/')[1]);
      const conteudo = cenario.arquivos[caminho];
      return conteudo === undefined ? resp('', 404) : resp(conteudo, 200, { 'content-type': 'application/pdf' });
    }
    if (u.includes('generativelanguage.googleapis.com')) {
      return resp({ candidates: [{ content: { parts: [{ text: JSON.stringify(cenario.lu) }] } }], usageMetadata: cenario.uso });
    }
    throw new Error(`fetch inesperado: ${u}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PECA = [
  { n: 1, topico: 'DOS FATOS', texto: 'A executada foi citada em [PREENCHER: data].', editavel: true },
  { topico: 'DOS FATOS', texto: 'CDA | Vencimento', editavel: false },
  { n: 2, topico: 'DA PRESCRIÇÃO', texto: 'O crédito está **prescrito**⟦0⟧.', editavel: true },
];
const pedido = (corpo = {}) =>
  new Request('http://localhost/api/lu-peca', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4', Authorization: 'Bearer token-do-usuario' },
    body: JSON.stringify({ analise_id: ANALISE_ID, acao: 'conversar', mensagem: 'Quando venceu a CDA?', historico: [], peca: PECA, resumo_peca: { modelo: 'EPE' }, ...corpo }),
  });
const corpoDoGemini = () => JSON.parse(chamadas.find((c) => c.url.includes('generativelanguage')).opcoes.body);
const textoEnviado = () => corpoDoGemini().contents[0].parts.at(-1).text;

describe('Conversa com o Lu (api/lu-peca, acao conversar)', () => {
  it('lê os PDFs do caso com o token do usuário e manda ao Gemini antes do texto; Excel fica de fora e é avisado', async () => {
    const r = await api.POST(pedido());
    expect(r.status).toBe(200);
    const dados = await r.json();
    expect(dados.tipo).toBe('conversa');
    expect(dados.resposta).toMatch(/30\/04\/2016/);
    expect(dados.fontes).toEqual([{ tipo: 'documento', rotulo: 'cda.pdf, p. 2' }]);
    expect(dados.proposta).toBeNull();
    expect(dados.documentos).toEqual({ lidos: ['cda.pdf'], deFora: ['planilha.xlsx'] });

    const download = chamadas.find((c) => c.url.includes('/storage/v1/object/documentos/'));
    expect(download.opcoes.headers.Authorization).toBe('Bearer token-do-usuario');
    expect(chamadas.filter((c) => c.url.includes('/storage/')).length).toBe(1); // o Excel nem é baixado

    const partes = corpoDoGemini().contents[0].parts;
    expect(partes[0].inline_data.mime_type).toBe('application/pdf');
    const t = textoEnviado();
    expect(t).toContain('- cda.pdf (3 página(s))');
    expect(t).toContain('planilha.xlsx');
    expect(t).toContain('§1 A executada foi citada');
    expect(t).toContain('[só leitura] CDA | Vencimento');
    expect(t).toContain('== DA PRESCRIÇÃO ==');
    expect(t).toContain('BASE DE LEGISLAÇÃO');
    expect(t).toContain('PERGUNTA DO ADVOGADO: Quando venceu a CDA?');
    expect(corpoDoGemini().generationConfig.responseSchema.required).toEqual(['resposta', 'fontes', 'proposta']);
  });

  it('proposta só para um parágrafo §n editável que existe; número inventado vira nenhuma proposta', async () => {
    cenario.lu = respostaConversa({ proposta: { paragrafo: 2, texto: 'O crédito está **prescrito**, nos termos do art. 174 do CTN⟦0⟧.', explicacao: 'Citei o artigo — direto.' } });
    let dados = await (await api.POST(pedido({ mensagem: 'Cite o art. 174 no §2' }))).json();
    expect(dados.proposta).toEqual({ paragrafo: 2, texto: 'O crédito está **prescrito**, nos termos do art. 174 do CTN⟦0⟧.', explicacao: 'Citei o artigo, direto.' });

    cenario.lu = respostaConversa({ proposta: { paragrafo: 9, texto: 'qualquer', explicacao: '' } });
    dados = await (await api.POST(pedido())).json();
    expect(dados.proposta).toBeNull();
  });

  it('fontes conferidas: documento não enviado e legislação fora da base caem; página fora do PDF some', async () => {
    cenario.lu = respostaConversa({
      fontes: [
        { tipo: 'documento', referencia: 'outro_processo.pdf', pagina: 1 },
        { tipo: 'documento', referencia: 'CDA.pdf', pagina: 40 },
        { tipo: 'legislacao', referencia: 'art. 174 do CTN', pagina: 0 },
        { tipo: 'legislacao', referencia: 'Súmula 999 do STJ', pagina: 0 },
        { tipo: 'peca', referencia: '§2', pagina: 0 },
        { tipo: 'peca', referencia: '§7', pagina: 0 },
      ],
    });
    const dados = await (await api.POST(pedido())).json();
    expect(dados.fontes.map((f) => f.rotulo)).toEqual(['cda.pdf', expect.stringMatching(/^CTN art\. 174/), 'Peça, §2']);
  });

  it('manda só as últimas mensagens da conversa', async () => {
    const historico = Array.from({ length: 10 }, (_, i) => ({ papel: i % 2 ? 'lu' : 'advogado', texto: `mensagem ${i}` }));
    await api.POST(pedido({ historico }));
    const t = textoEnviado();
    expect(t).not.toContain('mensagem 3');
    expect(t).toContain('Advogado: mensagem 4');
    expect(t).toContain('Lu: mensagem 9');
  });

  it('valida a entrada: pergunta vazia, peça ausente, número repetido', async () => {
    expect((await api.POST(pedido({ mensagem: '  ' }))).status).toBe(400);
    expect((await api.POST(pedido({ peca: [] }))).status).toBe(400);
    expect((await api.POST(pedido({ peca: [PECA[0], { ...PECA[2], n: 1 }] }))).status).toBe(400);
    expect(chamadas.some((c) => c.url.includes('generativelanguage'))).toBe(false);
  });

  it('a reserva conta os PDFs pelas páginas (não pelo base64): caso grande perto do limite é recusado antes de gastar', async () => {
    cenario.arquivos['user-1/a/1_cda.pdf'] = pdfDePaginas(300); // ~180 mil tokens estimados = ~270 mil créditos
    cenario.gastoHoje = 800_000;
    const r = await api.POST(pedido());
    expect(r.status).toBe(429);
    expect((await r.json()).limiteAtingido).toBe(true);
    expect(chamadas.some((c) => c.url.includes('generativelanguage'))).toBe(false);

    // com saldo, o mesmo caso sai (o base64 de 300 páginas não é contado como texto)
    cenario.gastoHoje = 0;
    chamadas.length = 0;
    expect((await api.POST(pedido())).status).toBe(200);
  });

  it('registra o gasto real informado pelo Gemini', async () => {
    const dados = await (await api.POST(pedido())).json();
    expect(dados.consumo).toEqual({ creditos: 5000 * 1.5 + 300 * 9, limite: 1_000_000 });
  });

  it('documento que sumiu do Storage não derruba a conversa: responde com o resto e avisa', async () => {
    cenario.arquivos = {};
    const dados = await (await api.POST(pedido())).json();
    expect(dados.documentos.lidos).toEqual([]);
    expect(dados.documentos.deFora).toEqual(['cda.pdf', 'planilha.xlsx']);
    expect(corpoDoGemini().contents[0].parts.length).toBe(1);
  });
});

describe('paginasDoPdf', () => {
  it('conta /Type /Page sem contar /Pages; sem objetos visíveis, estima pelo tamanho', () => {
    expect(paginasDoPdf(new TextEncoder().encode(pdfDePaginas(5)).buffer)).toBe(5);
    expect(paginasDoPdf(new Uint8Array(200 * 1024).buffer)).toBe(4);
  });
});
