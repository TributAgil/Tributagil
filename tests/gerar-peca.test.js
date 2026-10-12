import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import { dadosPrescricao, dadosDecadencia, escritorio } from './fixtures-peca.js';

// api/gerar-peca.js lê estas variáveis na importação do módulo
process.env.GEMINI_API_KEY = 'chave-de-teste';
process.env.SUPABASE_URL = 'https://abc123.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-de-teste';

const USER_TOKEN = 'token-do-usuario';
const ANALISE_ID = '11111111-2222-3333-4444-555555555555';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let POST;
let chamadas;
let cenario;

const analisePadrao = () => ({
  id: ANALISE_ID,
  caso_id: 'caso-1',
  payload: { documentos: [{ nome: 'cda.pdf', mime_type: 'application/pdf', storage_path: 'user-1/caso-1/cda.pdf' }] },
  resultado: { conclusoes: [{ tipo: 'prescricao', severidade: 'favoravel', confianca: 90 }] },
});

function cenarioPadrao(extra = {}) {
  return {
    authOk: true,
    analises: [analisePadrao()],
    escritorios: [{ ...escritorio, logo_path: null }],
    dadosGemini: dadosPrescricao(),
    storageStatus: 200,
    geminiStatus: 200,
    logo: null,
    ...extra,
  };
}

const resp = (corpo, status = 200, headers = {}) =>
  new Response(typeof corpo === 'string' || corpo instanceof Uint8Array || Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo), { status, headers });

beforeAll(async () => {
  ({ POST } = await import('../api/gerar-peca.js'));
});

beforeEach(() => {
  chamadas = [];
  cenario = cenarioPadrao();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', async (url, opcoes = {}) => {
    const u = String(url);
    chamadas.push({ url: u, opcoes });
    if (u.includes('/rest/v1/rpc/rate_limit_checar')) return resp([{ ok: true }]);
    if (u.endsWith('/auth/v1/user')) return cenario.authOk ? resp({ id: 'user-1' }) : resp({}, 401);
    if (u.includes('/rest/v1/analises?')) return resp(cenario.analises);
    if (u.includes('/rest/v1/escritorios')) return resp(cenario.escritorios);
    if (u.includes('/storage/v1/object/logos/')) return cenario.logo ? resp(cenario.logo, 200) : resp('', 404);
    if (u.includes('/storage/v1/object/documentos/')) return cenario.storageStatus === 200 ? resp(Buffer.from('%PDF-1.4 teste'), 200, { 'content-type': 'application/pdf' }) : resp('', cenario.storageStatus);
    if (u.includes('generativelanguage.googleapis.com')) {
      if (cenario.geminiStatus !== 200) return resp({ error: 'x' }, cenario.geminiStatus);
      return resp({ candidates: [{ content: { parts: [{ text: JSON.stringify(cenario.dadosGemini) }] } }], usageMetadata: { totalTokenCount: 321 } });
    }
    throw new Error(`fetch inesperado: ${u}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const requisicao = (corpo = { analise_id: ANALISE_ID }, { token = USER_TOKEN, ip = '1.2.3.4' } = {}) =>
  new Request('http://localhost/api/gerar-peca', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(corpo),
  });

const chamar = async (corpo, opcoes) => {
  const r = await POST(requisicao(corpo, opcoes));
  return { status: r.status, corpo: await r.json() };
};

const abrir = async (arquivo) => {
  const zip = await JSZip.loadAsync(Buffer.from(arquivo.base64, 'base64'));
  const doc = await zip.file('word/document.xml').async('string');
  const texto = doc.split('</w:p>').map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')).join('\n');
  return { zip, doc, texto };
};

describe('autenticação e entrada', () => {
  it('sem token: 401, sem tocar em Supabase nem Gemini', async () => {
    const r = await chamar({ analise_id: ANALISE_ID }, { token: '' });
    expect(r.status).toBe(401);
    expect(chamadas.some((c) => c.url.includes('generativelanguage'))).toBe(false);
  });

  it('token inválido: 401 e nenhuma chamada ao Gemini', async () => {
    cenario = cenarioPadrao({ authOk: false });
    const r = await chamar();
    expect(r.status).toBe(401);
    expect(chamadas.some((c) => c.url.includes('generativelanguage'))).toBe(false);
  });

  it('analise_id inválido: 400', async () => {
    expect((await chamar({ analise_id: 'abc' })).status).toBe(400);
    expect((await chamar({})).status).toBe(400);
  });

  it('análise de outro usuário (RLS devolve vazio): 404', async () => {
    cenario = cenarioPadrao({ analises: [] });
    expect((await chamar()).status).toBe(404);
  });

  it('o token do próprio usuário é usado em TODA leitura (nunca service role)', async () => {
    await chamar();
    const leituras = chamadas.filter((c) => c.url.includes('/rest/v1/analises') || c.url.includes('/rest/v1/escritorios') || c.url.includes('/storage/'));
    expect(leituras.length).toBeGreaterThanOrEqual(3);
    for (const c of leituras) expect(c.opcoes.headers.Authorization).toBe(`Bearer ${USER_TOKEN}`);
    expect(JSON.stringify(chamadas)).not.toMatch(/service_role/i);
  });
});

describe('caso feliz — EPE prescrição', () => {
  it('devolve resumo e um .docx real, preenchido, com UMA chamada ao Gemini (temperatura 0, schema)', async () => {
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(r.corpo.status).toBe('ok');
    expect(r.corpo.resumo.modelo).toMatch(/Exceção de Pré-Executividade — prescrição ordinária/);
    expect(r.corpo.resumo.tese).toBe('Prescrição ordinária');
    expect(r.corpo.resumo.creditos).toEqual([
      { cda: '12 3 45 678901-23', periodo: '2018', termo_inicial: '27/01/2020', consumacao: '27/01/2025' },
      { cda: '12 3 45 678901-23', periodo: '2019', termo_inicial: '30/06/2020', consumacao: '30/06/2025' },
    ]);
    expect(r.corpo.resumo.aviso_fixo).toBe('Minuta gerada automaticamente. Revisão do advogado responsável é obrigatória antes do protocolo.');
    expect(r.corpo.resumo.figuras).toBe(7);
    expect(r.corpo.arquivo.nome).toMatch(/^EPE_Prescricao_Maria_Exemplo_da_Silva_\d{4}-\d{2}-\d{2}\.docx$/);

    const { texto } = await abrir(r.corpo.arquivo);
    expect(texto).toContain('AO JUÍZO DA 3ª VARA FEDERAL DE EXECUÇÃO FISCAL DE SALVADOR/BA.');
    expect(texto).not.toContain('+++');

    const g = chamadas.filter((c) => c.url.includes('generativelanguage'));
    expect(g).toHaveLength(1);
    const pedido = JSON.parse(g[0].opcoes.body);
    expect(pedido.generationConfig.temperature).toBe(0);
    expect(pedido.generationConfig.responseSchema.properties.inscricoes).toBeDefined();
    expect(pedido.contents[0].parts.some((p) => p.inline_data?.mime_type === 'application/pdf')).toBe(true);
  });

  it('sem cadastro de escritório: gera mesmo assim, com mais [PREENCHER]', async () => {
    const com = await chamar();
    cenario = cenarioPadrao({ escritorios: [] });
    const sem = await chamar();
    expect(sem.corpo.status).toBe('ok');
    expect(sem.corpo.resumo.campos_preencher).toBeGreaterThan(com.corpo.resumo.campos_preencher);
    expect((await abrir(sem.corpo.arquivo)).texto).toContain('[PREENCHER: nome do(a) advogado(a)]');
  });

  it('com logo válido: entra no cabeçalho; logo inválido: gera sem logo e avisa', async () => {
    cenario = cenarioPadrao({ escritorios: [{ ...escritorio, logo_path: 'user-1/logo.png' }], logo: PNG });
    const ok = await chamar();
    const { zip } = await abrir(ok.corpo.arquivo);
    const headers = await Promise.all(['word/header1.xml', 'word/header2.xml'].map((n) => zip.file(n).async('string')));
    expect(headers.some((h) => h.includes('<w:drawing'))).toBe(true);

    cenario = cenarioPadrao({ escritorios: [{ ...escritorio, logo_path: 'user-1/logo.png' }], logo: Buffer.from('não é imagem de verdade, só texto qualquer') });
    const ruim = await chamar();
    expect(ruim.corpo.status).toBe('ok');
    expect(ruim.corpo.resumo.avisos.join(' ')).toMatch(/logo/i);
  });
});

describe('bloqueios e cenários sem modelo (nada de arquivo)', () => {
  it('parcelamento no meio do prazo: bloqueia, lista o evento e não devolve arquivo', async () => {
    const dados = dadosPrescricao();
    dados.inscricoes[0].eventos_interruptivos = [{ tipo: 'parcelamento', data: '10/05/2022', fonte: 'extrato.pdf' }];
    cenario = cenarioPadrao({ dadosGemini: dados });
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(r.corpo.status).toBe('bloqueada');
    expect(r.corpo.arquivo).toBeUndefined();
    expect(r.corpo.bloqueios.join(' ')).toMatch(/parcelamento em 10\/05\/2022/);
  });

  it('divergência com o parecer: bloqueia, mostra e LOGA', async () => {
    cenario = cenarioPadrao({ analises: [{ ...analisePadrao(), resultado: { conclusoes: [{ tipo: 'prescricao', severidade: 'desfavoravel' }] } }] });
    const r = await chamar();
    expect(r.corpo.status).toBe('bloqueada');
    expect(r.corpo.divergencias[0]).toMatch(/parecer salvo não traz conclusão favorável/);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('DIVERGÊNCIA motor da peça x parecer salvo'), expect.objectContaining({ analiseId: ANALISE_ID }));
  });

  it('decadência sem execução ajuizada: "Modelo de peça ainda não disponível para este cenário"', async () => {
    const dados = dadosDecadencia();
    dados.processo_execucao = { numero: '', vara: '', comarca_secao: '', data_ajuizamento: { data: '', fonte: '' }, data_despacho_citatorio: { data: '', fonte: '' }, data_citacao: { data: '', fonte: '' } };
    cenario = cenarioPadrao({ dadosGemini: dados, analises: [{ ...analisePadrao(), resultado: { conclusoes: [{ tipo: 'decadencia', severidade: 'favoravel' }] } }] });
    const r = await chamar();
    expect(r.corpo.status).toBe('indisponivel');
    expect(r.corpo.mensagem).toBe('Modelo de peça ainda não disponível para este cenário');
    expect(r.corpo.arquivo).toBeUndefined();
  });

  it('decadência COM execução: usa a EPE de decadência', async () => {
    cenario = cenarioPadrao({ dadosGemini: dadosDecadencia(), analises: [{ ...analisePadrao(), resultado: { conclusoes: [{ tipo: 'decadencia', severidade: 'favoravel' }] } }] });
    const r = await chamar();
    expect(r.corpo.status).toBe('ok');
    expect(r.corpo.resumo.modelo).toMatch(/decadência/);
    expect(r.corpo.resumo.creditos[0]).toMatchObject({ termo_inicial: '01/01/2006', consumacao: '01/01/2011' });
  });

  it('saída malformada da IA (modalidade fora do enum, data inválida): bloqueia em vez de presumir', async () => {
    const dados = dadosPrescricao();
    dados.inscricoes[0].periodos[0].modalidade_lancamento = 'qualquer coisa';
    cenario = cenarioPadrao({ dadosGemini: dados });
    const r = await chamar();
    expect(r.corpo.status).toBe('bloqueada');
    expect(r.corpo.bloqueios.join(' ')).toMatch(/modalidade de lançamento não identificada/);
  });
});

describe('falhas de infraestrutura', () => {
  it('documento sumido do Storage: 410 com instrução, sem chamar o Gemini', async () => {
    cenario = cenarioPadrao({ storageStatus: 404 });
    const r = await chamar();
    expect(r.status).toBe(410);
    expect(chamadas.some((c) => c.url.includes('generativelanguage'))).toBe(false);
  });

  it('Gemini falhando (400): 502, sem arquivo', async () => {
    cenario = cenarioPadrao({ geminiStatus: 400 });
    const r = await chamar();
    expect(r.status).toBe(502);
    expect(r.corpo.arquivo).toBeUndefined();
  });

  it('análise sem documentos: 422', async () => {
    cenario = cenarioPadrao({ analises: [{ ...analisePadrao(), payload: { documentos: [] } }] });
    expect((await chamar()).status).toBe(422);
  });

  it('extração ilegível sinalizada pelo modelo: 422 com a mensagem', async () => {
    cenario = cenarioPadrao({ dadosGemini: { ...dadosPrescricao(), alerta_ilegivel: 'O arquivo extrato.pdf está ilegível.' } });
    const r = await chamar();
    expect(r.status).toBe(422);
    expect(r.corpo.error).toBe('O arquivo extrato.pdf está ilegível.');
  });
});

describe('política de créditos centralizada', () => {
  it('hoje gerar a peça não consome crédito (nenhuma chamada a consumir_credito)', async () => {
    await chamar();
    expect(chamadas.some((c) => c.url.includes('consumir_credito'))).toBe(false);
  });

  it('se a política passar a cobrar sem a cobrança estar implementada, recusa (501) em vez de servir de graça', async () => {
    vi.resetModules();
    vi.doMock('../api/_politica-peca.js', () => ({ creditosParaGerarPeca: () => 1 }));
    const { POST: POSTCobrando } = await import('../api/gerar-peca.js');
    const r = await POSTCobrando(requisicao());
    expect(r.status).toBe(501);
    expect(chamadas.some((c) => c.url.includes('generativelanguage'))).toBe(false);
    vi.doUnmock('../api/_politica-peca.js');
  });
});
