import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { numeroCnj, formatarCnj, tribunalDoNumero, dataDoMovimento, classificarMovimento, resumirResposta, consultarDataJud } from '../api/_datajud.js';
import { montarCarteira, novidadesDoAndamento, avisosDaCarteira, eventosDoCalendario } from '../src/lib/carteiraModelo.js';

// Acompanhamento do processo pelo DataJud (CNJ). A resposta de exemplo é real (processo usado no tutorial do CNJ).
const exemplo = JSON.parse(fs.readFileSync(new URL('./fixtures/datajud-trf1-exemplo.json', import.meta.url), 'utf8'));
const NUM = '00008323520184013202';

describe('número CNJ e tribunal', () => {
  it('confere o dígito verificador (módulo 97) e formata', () => {
    expect(numeroCnj('0000832-35.2018.4.01.3202')).toBe(NUM);
    expect(numeroCnj('0000832-36.2018.4.01.3202')).toBeNull();
    expect(numeroCnj('Não identificado')).toBeNull();
    expect(formatarCnj(NUM)).toBe('0000832-35.2018.4.01.3202');
  });
  it('Justiça Federal -> trfN; Estadual -> sigla do TJ; outras justiças: não suportado', () => {
    expect(tribunalDoNumero(NUM)).toBe('trf1');
    expect(tribunalDoNumero('00000000020208050001')).toBe('tjba');
    expect(tribunalDoNumero('00000000020208260001')).toBe('tjsp');
    expect(tribunalDoNumero('00000000020208070001')).toBe('tjdft');
    expect(tribunalDoNumero('00000000020205010001')).toBeNull(); // Justiça do Trabalho
  });
});

describe('movimentações', () => {
  it('datas ISO e compactas', () => {
    expect(dataDoMovimento('2018-10-30T14:06:24.000Z')).toBe('2018-10-30T14:06:24.000Z');
    expect(dataDoMovimento('20181030140624')).toBe('2018-10-30T14:06:24.000Z');
    expect(dataDoMovimento('x')).toBeNull();
  });
  it('classificação: tentativa frustrada não é constrição; códigos da TPU para nomes ambíguos', () => {
    expect(classificarMovimento('Mandado de penhora devolvido negativo')).toBe('tentativa_frustrada');
    expect(classificarMovimento('Bloqueio de valores via SISBAJUD infrutífero')).toBe('tentativa_frustrada');
    expect(classificarMovimento('Penhora realizada')).toBe('constricao');
    expect(classificarMovimento('Bloqueio de valores SISBAJUD')).toBe('constricao');
    expect(classificarMovimento('Citação realizada por mandado')).toBe('citacao');
    expect(classificarMovimento('Suspensão do processo: art. 40 da Lei 6.830/80')).toBe('suspensao_art40');
    expect(classificarMovimento('Parcelamento do débito')).toBe('parcelamento');
    expect(classificarMovimento('Desarquivamento')).toBe('desarquivamento');
    expect(classificarMovimento('Definitivo', 246)).toBe('extincao');
    expect(classificarMovimento('Provisório', 245)).toBe('suspensao_art40');
    expect(classificarMovimento('Ato ordinatório', 11383)).toBe('outro');
  });
  it('resposta real do DataJud: dados do processo e movimentações da mais nova para a mais antiga', () => {
    const r = resumirResposta(exemplo);
    expect(r.classe).toBe('Procedimento do Juizado Especial Cível');
    expect(r.ultima_movimentacao).toBe('2024-07-03T09:05:34.000Z');
    expect(r.movimentos[0]).toMatchObject({ nome: 'Ato ordinatório', codigo: 11383, categoria: 'outro' });
    expect(r.movimentos.find((m) => m.codigo === 246).categoria).toBe('extincao');
    const datas = r.movimentos.map((m) => m.data);
    expect([...datas].sort().reverse()).toEqual(datas);
    expect(resumirResposta({ hits: { hits: [] } })).toBeNull();
  });
});

describe('consulta (fetch simulado)', () => {
  const resp = (status, corpo = {}) => new Response(JSON.stringify(corpo), { status });
  it('manda a chave no cabeçalho e busca pelo número sem pontuação', async () => {
    let pedido;
    const r = await consultarDataJud({ numero: NUM, apiKey: 'CHAVE', fetchFn: async (url, op) => ((pedido = { url, op }), resp(200, exemplo)) });
    expect(r.status).toBe('ok');
    expect(pedido.url).toBe('https://api-publica.datajud.cnj.jus.br/api_publica_trf1/_search');
    expect(pedido.op.headers.Authorization).toBe('APIKey CHAVE');
    expect(JSON.parse(pedido.op.body).query).toEqual({ match: { numeroProcesso: NUM } });
  });
  it('429/500/tempo esgotado: indisponível; 401: chave recusada; vazio: não encontrado', async () => {
    expect((await consultarDataJud({ numero: NUM, apiKey: 'x', fetchFn: async () => resp(429) })).status).toBe('indisponivel');
    expect((await consultarDataJud({ numero: NUM, apiKey: 'x', fetchFn: async () => resp(503) })).status).toBe('indisponivel');
    const tempo = await consultarDataJud({
      numero: NUM, apiKey: 'x', timeoutMs: 10,
      fetchFn: (u, op) => new Promise((_, rej) => op.signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' })))),
    });
    expect(tempo).toMatchObject({ status: 'indisponivel', detalhe: 'tempo esgotado' });
    expect((await consultarDataJud({ numero: NUM, apiKey: 'x', fetchFn: async () => resp(401) })).detalhe).toMatch(/Chave do DataJud recusada/);
    expect((await consultarDataJud({ numero: NUM, apiKey: 'x', fetchFn: async () => resp(200, { hits: { hits: [] } }) })).status).toBe('nao_encontrado');
  });
});

describe('carteira: andamento novo', () => {
  const HOJE = new Date(Date.UTC(2026, 10, 26));
  const analise = { id: 'a', caso_id: 'A', versao: 1, created_at: '2026-09-01T10:00:00Z', titulo: 'Caso A' };
  const carteira = [{ caso_id: 'A', analise_id: 'a', fase: 'analisado', teses: [], calculado_em: '2026-09-01T10:00:00Z' }];
  const marcos = [{ id: 1, caso_id: 'A', chave: 'x', tese: 'prescricao_intercorrente', cda: '1', periodo: '', data: '2027-03-10', tipo: 'acompanhar', condicao: '' }];
  const mov = (data, categoria, nome = 'x') => ({ data, categoria, nome, complemento: '', codigo: null });

  it('constrição, citação ou parcelamento DEPOIS da análise: caso vai para o topo como "andamento novo"', () => {
    const andamentos = [{ caso_id: 'A', numero: NUM, status: 'ok', consultado_em: '2026-11-26T00:00:00Z', ultima_movimentacao: '2026-10-05T00:00:00Z',
      movimentos: [mov('2026-10-05T00:00:00Z', 'constricao', 'Penhora'), mov('2026-08-01T00:00:00Z', 'citacao'), mov('2026-10-01T00:00:00Z', 'tentativa_frustrada')] }];
    const [item] = montarCarteira({ analises: [analise], carteira, marcos, andamentos, hoje: HOJE });
    expect(item.situacao).toBe('andamento_novo');
    expect(item.novidades.map((m) => m.nome)).toEqual(['Penhora']); // a citação é anterior e a tentativa frustrada não conta
    expect(item.diasParado).toBe(52);
    expect(avisosDaCarteira([item]).andamentosNovos).toBe(1);
    expect(eventosDoCalendario([item])[0].conferir).toBe(true);
  });
  it('sem novidade: situação de sempre; caso arquivado não vira aviso', () => {
    expect(novidadesDoAndamento({ movimentos: [mov('2026-08-01T00:00:00Z', 'constricao')] }, analise.created_at)).toEqual([]);
    const andamentos = [{ caso_id: 'A', movimentos: [mov('2026-10-05T00:00:00Z', 'constricao')] }];
    const [arq] = montarCarteira({ analises: [analise], carteira: [{ ...carteira[0], fase: 'arquivado' }], marcos, andamentos, hoje: HOJE });
    expect(arq.situacao).toBe('encerrado');
    const [semAnd] = montarCarteira({ analises: [analise], carteira, marcos, hoje: HOJE });
    expect(semAnd.situacao).toBe('acompanhando');
  });
});

// ---- endpoint -------------------------------------------------------------------------------------------------------
process.env.SUPABASE_URL = 'https://abc123.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-de-teste';
const ANALISE = '11111111-2222-3333-4444-555555555555';
const CASO = '99999999-2222-3333-4444-555555555555';

describe('api/andamentos', () => {
  let POST;
  let chamadas;
  let cenario;
  beforeAll(async () => {
    ({ POST } = await import('../api/andamentos.js'));
  });
  beforeEach(() => {
    process.env.DATAJUD_API_KEY = 'CHAVE';
    chamadas = [];
    cenario = { processo: '0000832-35.2018.4.01.3202', salvo: null, datajud: () => new Response(JSON.stringify(exemplo), { status: 200 }) };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', async (url, op = {}) => {
      const u = String(url);
      chamadas.push({ url: u, op });
      const r = (c, s = 200) => new Response(JSON.stringify(c), { status: s });
      if (u.includes('/rpc/rate_limit_checar')) return r([{ ok: true }]);
      if (u.endsWith('/auth/v1/user')) return r({ id: 'user-1' });
      if (u.includes('/rest/v1/analises?')) return r([{ id: ANALISE, caso_id: CASO, resultado: { metadata: { processo: cenario.processo } } }]);
      if (u.includes('/rest/v1/andamentos_caso?')) return r(cenario.salvo ? [cenario.salvo] : []);
      if (u.includes('/rpc/salvar_andamentos_caso')) {
        const b = JSON.parse(op.body);
        cenario.salvo = { caso_id: CASO, numero: b.p_numero, status: b.p_status, consultado_em: new Date().toISOString(), movimentos: b.p_dados?.movimentos || [] };
        return new Response(null, { status: 204 });
      }
      if (u.includes('api-publica.datajud.cnj.jus.br')) return cenario.datajud();
      throw new Error(`fetch inesperado: ${u}`);
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const chamar = async (corpo = { analise_id: ANALISE }, token = 'tok') => {
    const res = await POST(new Request('http://localhost/api/andamentos', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(corpo),
    }));
    return { status: res.status, corpo: await res.json() };
  };

  it('sem chave configurada: 503; sem login: 401', async () => {
    delete process.env.DATAJUD_API_KEY;
    expect((await chamar()).status).toBe(503);
    process.env.DATAJUD_API_KEY = 'CHAVE';
    expect((await chamar(undefined, '')).status).toBe(401);
  });

  it('consulta, grava com o token do usuário e devolve o andamento', async () => {
    const { status, corpo } = await chamar();
    expect(status).toBe(200);
    expect(corpo.status).toBe('ok');
    expect(corpo.andamento.numero).toBe(NUM);
    const grava = chamadas.find((c) => c.url.includes('salvar_andamentos_caso'));
    expect(grava.op.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(grava.op.body)).toMatchObject({ p_caso_id: CASO, p_tribunal: 'trf1', p_status: 'ok' });
  });

  it('consulta recente (menos de 6 h): devolve o salvo sem chamar o DataJud; "forcar" consulta de novo', async () => {
    cenario.salvo = { caso_id: CASO, numero: NUM, status: 'ok', consultado_em: new Date().toISOString(), movimentos: [] };
    expect((await chamar()).corpo.status).toBe('recente');
    expect(chamadas.some((c) => c.url.includes('datajud'))).toBe(false);
    expect((await chamar({ analise_id: ANALISE, forcar: true })).corpo.status).toBe('ok');
  });

  it('número do parecer inválido: 422 pedindo o número; número digitado válido é usado; inválido: 422', async () => {
    cenario.processo = 'Não identificado';
    expect((await chamar()).status).toBe(422);
    expect((await chamar({ analise_id: ANALISE, numero: '0000832-36.2018.4.01.3202' })).status).toBe(422);
    const ok = await chamar({ analise_id: ANALISE, numero: '0000832-35.2018.4.01.3202' });
    expect(ok.corpo.status).toBe('ok');
  });

  it('DataJud sobrecarregado: 200 com status "indisponivel" e mensagem (a tela tenta depois)', async () => {
    cenario.datajud = () => new Response('{}', { status: 429 });
    const { status, corpo } = await chamar();
    expect(status).toBe(200);
    expect(corpo.status).toBe('indisponivel');
    expect(corpo.mensagem).toMatch(/sobrecarregado/);
  });
});
