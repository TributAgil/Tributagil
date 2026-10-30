import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { trechosParaLu, luParaTrechos } from '../src/lib/edicaoTexto.js';
import { caractereDoObjeto, textoDosTrechos } from '../src/lib/docxEdicao.js';
import { chatbotLiberadoParaPerfil } from '../api/_chatbot-acesso.js';

// api/lu-peca.js lê estas variáveis na importação do módulo
process.env.GEMINI_API_KEY = 'chave-de-teste';
process.env.SUPABASE_URL = 'https://abc123.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-de-teste';

const ANALISE_ID = '11111111-2222-3333-4444-555555555555';
let POST;
let fontesDaBase;
let chamadas;
let cenario;

const resp = (corpo, status = 200) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status });
const respostaLu = (extra = {}) => ({ encontrou: true, texto: 'Texto **novo** do parágrafo.', explicacao: 'Deixei mais direto.', fontes: [], ...extra });

beforeAll(async () => {
  ({ POST, fontesDaBase } = await import('../api/lu-peca.js'));
});

beforeEach(() => {
  chamadas = [];
  cenario = {
    authOk: true,
    analises: [{ id: ANALISE_ID, resultado: { metadata: { processo: '1234567-60.2025.4.01.3300', parte_reu: 'Maria' }, fatos_importantes: [{ data: '27/01/2020', descricao: 'Entrega da DIRPF', fonte: 'recibo_2018.pdf' }], conclusoes: [] } }],
    lu: respostaLu(),
    geminiStatus: 200,
    gastoHoje: 0,
    consumoStatus: 200,
    uso: { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 50, totalTokenCount: 1150 },
  };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', async (url, opcoes = {}) => {
    const u = String(url);
    chamadas.push({ url: u, opcoes });
    if (u.includes('/rest/v1/rpc/rate_limit_checar')) return resp([{ ok: true }]);
    if (u.includes('/rest/v1/rpc/consumo_lu_hoje')) {
      return cenario.consumoStatus === 200 ? resp([{ creditos: cenario.gastoHoje, pedidos: 0, dia: '2026-10-30' }]) : resp({ message: 'função ausente' }, cenario.consumoStatus);
    }
    if (u.includes('/rest/v1/rpc/registrar_consumo_lu')) {
      cenario.gastoHoje += JSON.parse(opcoes.body).p_creditos;
      return resp(cenario.gastoHoje);
    }
    if (u.endsWith('/auth/v1/user')) return cenario.authOk ? resp({ id: 'user-1' }) : resp({}, 401);
    if (u.includes('/rest/v1/analises?')) return resp(cenario.analises);
    if (u.includes('generativelanguage.googleapis.com')) {
      if (cenario.geminiStatus !== 200) return resp({ error: 'x' }, cenario.geminiStatus);
      return resp({ candidates: [{ content: { parts: [{ text: JSON.stringify(cenario.lu) }] } }], usageMetadata: cenario.uso });
    }
    throw new Error(`fetch inesperado: ${u}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const pedido = (corpo, { token = 'token-do-usuario' } = {}) =>
  new Request('http://localhost/api/lu-peca', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ analise_id: ANALISE_ID, acao: 'reescrever', paragrafo: 'Trata-se de **débito** tributário.', topico: 'DOS FATOS', resumo_peca: { modelo: 'EPE' }, ...corpo }),
  });
const corpoDoGemini = () => JSON.parse(chamadas.find((c) => c.url.includes('generativelanguage')).opcoes.body);
const textoEnviado = () => corpoDoGemini().contents[0].parts[0].text;

describe('acesso ao Lu', () => {
  it('ligado só no editor da peça; o chat do caso continua desligado', () => {
    expect(chatbotLiberadoParaPerfil({ uso: 'peca' }).liberado).toBe(true);
    expect(chatbotLiberadoParaPerfil().liberado).toBe(false);
    expect(chatbotLiberadoParaPerfil({ uso: 'caso' }).liberado).toBe(false);
  });
});

describe('api/lu-peca', () => {
  it('reescrever: devolve a proposta e não manda PDF, base de legislação nem parecer', async () => {
    const r = await POST(pedido({ instrucao: 'mais incisivo' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ tipo: 'texto', encontrou: true, texto: 'Texto **novo** do parágrafo.', explicacao: 'Deixei mais direto.', fontes: [], consumo: { creditos: 2850, limite: 1_000_000 } });
    const t = textoEnviado();
    expect(t).toContain('AÇÃO: REESCREVER');
    expect(t).toContain('INSTRUÇÃO DO ADVOGADO: mais incisivo');
    expect(t).toContain('Trata-se de **débito** tributário.');
    expect(t).not.toContain('BASE DE LEGISLAÇÃO');
    expect(t).not.toContain('PARECER DA ANÁLISE');
    expect(chamadas.some((c) => c.url.includes('/storage/'))).toBe(false);
    expect(corpoDoGemini().generationConfig.responseSchema.required).toEqual(['encontrou', 'texto', 'explicacao', 'fontes']);
  });

  it('fundamentar: manda a base curada e só aceita fontes que existem nela', async () => {
    cenario.lu = respostaLu({ fontes: ['art. 174 do CTN', 'Súmula 999 do STJ (inventada)', 'CTN art. 174'] });
    const r = await POST(pedido({ acao: 'fundamentar' }));
    const dados = await r.json();
    const t = textoEnviado();
    expect(t).toContain('BASE DE LEGISLAÇÃO (única fonte permitida)');
    expect(t).toContain('[CTN art. 174');
    expect(t).not.toContain('PARECER DA ANÁLISE');
    expect(dados.fontes.length).toBe(1);
    expect(dados.fontes[0]).toMatch(/^CTN art\. 174/);
    expect(corpoDoGemini().generationConfig.temperature).toBe(0);
  });

  it('preencher: manda o parecer salvo (lido sob RLS) e exige um [PREENCHER] no parágrafo', async () => {
    const sem = await POST(pedido({ acao: 'preencher' }));
    expect(sem.status).toBe(400);
    const r = await POST(pedido({ acao: 'preencher', paragrafo: 'Execução Fiscal n.º [PREENCHER: nº do processo]' }));
    expect(r.status).toBe(200);
    const t = textoEnviado();
    expect(t).toContain('PARECER DA ANÁLISE');
    expect(t).toContain('1234567-60.2025.4.01.3300');
    expect(t).toContain('recibo_2018.pdf');
    // a análise foi lida com o token do próprio usuário (RLS), nunca com chave de serviço
    const leitura = chamadas.find((c) => c.url.includes('/rest/v1/analises?'));
    expect(leitura.opcoes.headers.Authorization).toBe('Bearer token-do-usuario');
  });

  it('não encontrou: devolve encontrou false (a tela não oferece "Aceitar")', async () => {
    cenario.lu = respostaLu({ encontrou: false, texto: 'Doc. [PREENCHER: nº do Doc.]', explicacao: 'O número do documento anexo não está na análise.' });
    const r = await POST(pedido({ acao: 'preencher', paragrafo: 'Doc. [PREENCHER: nº do Doc.]' }));
    expect((await r.json()).encontrou).toBe(false);
  });

  it('tira travessão da explicação (regra J01)', async () => {
    cenario.lu = respostaLu({ explicacao: 'Mudei o tom — ficou mais firme.' });
    const r = await POST(pedido({}));
    expect((await r.json()).explicacao).toBe('Mudei o tom, ficou mais firme.');
  });

  it('recusa pedido sem login, ação inválida, análise de outro e parágrafo vazio', async () => {
    expect((await POST(pedido({}, { token: '' }))).status).toBe(401);
    cenario.authOk = false;
    expect((await POST(pedido({}))).status).toBe(401);
    cenario.authOk = true;
    expect((await POST(pedido({ acao: 'apagar_tudo' }))).status).toBe(400);
    expect((await POST(pedido({ paragrafo: '   ' }))).status).toBe(400);
    expect((await POST(pedido({ analise_id: 'nao-e-uuid' }))).status).toBe(400);
    cenario.analises = []; // RLS: a análise de outro usuário não aparece
    expect((await POST(pedido({}))).status).toBe(404);
    expect(chamadas.some((c) => c.url.includes('generativelanguage'))).toBe(false);
  });

  it('limite de pedidos por usuário (não só por IP)', async () => {
    await POST(pedido({}));
    const chaves = chamadas.filter((c) => c.url.includes('rate_limit_checar')).map((c) => JSON.parse(c.opcoes.body).p_chave);
    expect(chaves).toContain('lu-peca:user-1');
  });

  it('Gemini fora do ar: mensagem clara, sem quebrar', async () => {
    cenario.geminiStatus = 400;
    const r = await POST(pedido({}));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect((await r.json()).error).toBeTruthy();
  });

  it('fontes: reconhece a citação escrita de vários jeitos e descarta o que não é da base', () => {
    expect(fontesDaBase(['Súmula 555 do STJ', 'STJ, Súmula 555', 'Súmula STJ Súmula 555'])).toEqual(['Súmula STJ Súmula 555']);
    expect(fontesDaBase(['art. 174 do CTN'])).toEqual(['CTN art. 174']);
    expect(fontesDaBase(['CTN, art. 173, I'])).toEqual(['CTN art. 173, I']);
    expect(fontesDaBase(['art. 40 da LEF'])).toEqual(['LEF (Lei 6.830/80) art. 40']);
    expect(fontesDaBase(['art. 40 da Lei 6.830/80'])).toEqual(['LEF (Lei 6.830/80) art. 40']);
    expect(fontesDaBase(['REsp 1.340.553/RS'])).toEqual(['STJ — Recurso Repetitivo REsp 1.340.553/RS (Temas 566 a 571)']);
    expect(fontesDaBase(['art. 150, § 4º, do CTN'])).toEqual(['CTN art. 150, §4º']);
    // fora da base, ou artigo de outra lei com o mesmo número: some
    expect(fontesDaBase(['art. 999 do CTN', 'Súmula 999 do STJ', 'art. 174 do CPC'])).toEqual([]);
  });
});

describe('texto entre o editor e o Lu', () => {
  const T = (texto, f = {}) => ({ texto, negrito: false, italico: false, sublinhado: false, ...f });

  it('negrito vira **…** e o elemento fixo do Word vira ⟦n⟧, e volta igual', () => {
    const trechos = [T('Requer a condenação, '), T('honorários', { negrito: true }), T(` conforme o tribunal${caractereDoObjeto(0)}.`)];
    const ida = trechosParaLu(trechos);
    expect(ida).toBe('Requer a condenação, **honorários** conforme o tribunal⟦0⟧.');
    expect(luParaTrechos(ida, 1)).toEqual(trechos);
  });

  it('o espaço fica fora das estrelas', () => {
    expect(trechosParaLu([T('a'), T(' b ', { negrito: true }), T('c')])).toBe('a **b** c');
  });

  it('elemento que o Lu esqueceu volta no fim; elemento inventado ou repetido é descartado', () => {
    const volta = luParaTrechos('Texto novo ⟦3⟧ sem a nota ⟦3⟧.', 1);
    expect(textoDosTrechos(volta)).toBe(`Texto novo  sem a nota .${caractereDoObjeto(0)}`);
  });
});

describe('novas ações do Lu', () => {
  it('adequar: o destinatário sai do modelo da peça (juízo na EPE, Procuradoria na revisão)', async () => {
    await POST(pedido({ acao: 'adequar', template: 'Revisao_PGFN_decadencia' }));
    expect(textoEnviado()).toContain('Procurador(a) da Fazenda Nacional');
    chamadas.length = 0;
    await POST(pedido({ acao: 'adequar', template: 'EPE_prescricao_ordinaria' }));
    expect(textoEnviado()).toContain('Juízo da execução fiscal');
    expect(corpoDoGemini().generationConfig.temperature).toBe(0.3);
  });

  it('conferir: não reescreve; devolve a lista contra o parecer, só com situações válidas', async () => {
    cenario.lu = {
      itens: [
        { afirmacao: 'CDA nº 12 3 45', situacao: 'confere', detalhe: '', fonte: 'extrato_cda.pdf' },
        { afirmacao: 'entregue em 26/01/2020', situacao: 'diverge', detalhe: 'O recibo diz 27/01/2020 — conferir.', fonte: 'recibo_2018.pdf' },
        { afirmacao: 'qualquer', situacao: 'inventada', detalhe: '', fonte: '' },
      ],
      resumo: 'Uma data diverge.',
    };
    const r = await POST(pedido({ acao: 'conferir' }));
    const dados = await r.json();
    expect(textoEnviado()).toContain('PARECER DA ANÁLISE');
    expect(corpoDoGemini().generationConfig.responseSchema.required).toEqual(['itens', 'resumo']);
    expect(dados.tipo).toBe('conferencia');
    expect(dados.itens.map((i) => i.situacao)).toEqual(['confere', 'diverge']);
    expect(dados.itens[1].detalhe).toBe('O recibo diz 27/01/2020, conferir.');
  });

  it('prazos: a IA só localiza as datas; a comparação com o cálculo do sistema é feita em código', async () => {
    cenario.lu = {
      datas: [
        { trecho: 'entre 27/01/2020', marco: 'termo_inicial', data: '27/01/2020', cda: '', periodo: '2018' },
        { trecho: 'e 27/01/2026', marco: 'consumacao', data: '27/01/2026', cda: '', periodo: '2018' },
        { trecho: 'protesto em 03/07/2025', marco: 'outro', data: '03/07/2025', cda: '', periodo: '' },
      ],
    };
    const resumo = { creditos: [{ cda: '12 3 45 678901-23', periodo: '2018', termo_inicial: '27/01/2020', consumacao: '27/01/2025' }] };
    const r = await POST(pedido({ acao: 'prazos', paragrafo: 'Entre 27/01/2020 e 27/01/2026 ocorreu o quinquênio.', resumo_peca: resumo }));
    const dados = await r.json();
    expect(textoEnviado()).toContain('LOCALIZAR AS DATAS DE PRAZO');
    expect(textoEnviado()).not.toContain('PARECER DA ANÁLISE');
    expect(dados.tipo).toBe('conferencia');
    expect(dados.itens.map((i) => i.situacao)).toEqual(['confere', 'diverge']);
    expect(dados.itens[1].detalhe).toBe('O sistema calculou 27/01/2025 para a consumação do prazo; o texto diz 27/01/2026.');
    expect(dados.itens[0].detalhe).toBe('Início do prazo: 27/01/2020');
    expect(dados.resumo).toContain('1 data(s)');
  });

  it('prazos: exige data no parágrafo', async () => {
    expect((await POST(pedido({ acao: 'prazos', paragrafo: 'Sem data nenhuma.' }))).status).toBe(400);
  });
});

describe('conferirPrazos (puro)', () => {
  let conferirPrazos;
  beforeAll(async () => {
    ({ conferirPrazos } = await import('../api/lu-peca.js'));
  });
  const resumo = {
    creditos: [
      { cda: '80.6.19.000111-22', periodo: '2016', termo_inicial: '01/01/2017', consumacao: '01/01/2022' },
      { cda: '80.6.19.000111-22', periodo: '2017', termo_inicial: '01/01/2018', consumacao: '01/01/2023' },
    ],
    intercorrente: { data_intimacao: '10/03/2015', data_fim_suspensao: '10/03/2016', data_prazo_final: '10/03/2021' },
  };
  it('acha o crédito pela CDA (só dígitos) e pelo período', () => {
    const r = conferirPrazos([{ trecho: 't', marco: 'consumacao', data: '01/01/2023', cda: '80619000111-22', periodo: '2017' }], resumo);
    expect(r.itens[0].situacao).toBe('confere');
  });
  it('sem CDA nem período, vale qualquer crédito; data que não bate diverge', () => {
    expect(conferirPrazos([{ trecho: 't', marco: 'termo_inicial', data: '01/01/2018', cda: '', periodo: '' }], resumo).itens[0].situacao).toBe('confere');
    expect(conferirPrazos([{ trecho: 't', marco: 'termo_inicial', data: '02/01/2018', cda: '', periodo: '' }], resumo).itens[0].situacao).toBe('diverge');
  });
  it('marcos da intercorrente', () => {
    const r = conferirPrazos([
      { trecho: 'a', marco: 'intimacao', data: '10/03/2015', cda: '', periodo: '' },
      { trecho: 'b', marco: 'prazo_final', data: '10/03/2020', cda: '', periodo: '' },
    ], resumo);
    expect(r.itens.map((i) => i.situacao)).toEqual(['confere', 'diverge']);
  });
  it('sem cálculo para aquilo: sem fonte; data inválida e "outro" ficam de fora', () => {
    const r = conferirPrazos([
      { trecho: 'a', marco: 'consumacao', data: '01/01/2022', cda: '', periodo: '2010' },
      { trecho: 'b', marco: 'consumacao', data: '2022', cda: '', periodo: '' },
      { trecho: 'c', marco: 'outro', data: '01/01/2022', cda: '', periodo: '' },
    ], { creditos: resumo.creditos });
    expect(r.itens.map((i) => i.situacao)).toEqual(['sem_fonte']);
  });
});

describe('créditos do Lu (1.000.000 por dia = US$ 1,00)', () => {
  let creditosDoUso;
  let LIMITE_CREDITOS_DIA;
  let USD_DO_LIMITE;
  beforeAll(async () => {
    ({ creditosDoUso, LIMITE_CREDITOS_DIA, USD_DO_LIMITE } = await import('../api/lu-peca.js'));
  });

  it('conversão: 1 token de entrada = 1,5 crédito; saída e raciocínio = 9; 1 milhão = US$ 1,00 no preço de lista', () => {
    expect(creditosDoUso({ promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 50 })).toBe(2850);
    expect(creditosDoUso({ promptTokenCount: 1, candidatesTokenCount: 0 })).toBe(2); // arredonda para cima, nunca subestima
    // sem detalhe: tudo como saída (nunca subestima)
    expect(creditosDoUso({ totalTokenCount: 100 })).toBe(900);
    expect(creditosDoUso(undefined)).toBe(0);
    // 1 milhão de créditos em tokens de entrada (US$ 1,50/M) ou de saída (US$ 9,00/M) custam US$ 1,00
    expect(USD_DO_LIMITE).toBe(1);
    expect((LIMITE_CREDITOS_DIA / 1.5) * (1.5 / 1e6)).toBeCloseTo(USD_DO_LIMITE);
    expect((LIMITE_CREDITOS_DIA / 9) * (9 / 1e6)).toBeCloseTo(USD_DO_LIMITE);
  });

  it('cada pedido registra o gasto real e devolve o medidor', async () => {
    cenario.gastoHoje = 10_000;
    const dados = await (await POST(pedido({}))).json();
    const registro = chamadas.find((c) => c.url.includes('registrar_consumo_lu'));
    expect(JSON.parse(registro.opcoes.body)).toEqual({ p_creditos: 2850 });
    expect(registro.opcoes.headers.Authorization).toBe('Bearer token-do-usuario');
    expect(dados.consumo).toEqual({ creditos: 12_850, limite: 1_000_000 });
  });

  it('com o limite do dia atingido, não chama o Gemini e explica', async () => {
    cenario.gastoHoje = 1_000_000;
    const r = await POST(pedido({}));
    expect(r.status).toBe(429);
    const dados = await r.json();
    expect(dados.limiteAtingido).toBe(true);
    expect(dados.error).toMatch(/meia-noite/);
    expect(dados.consumo).toEqual({ creditos: 1_000_000, limite: 1_000_000 });
    expect(chamadas.some((c) => c.url.includes('generativelanguage'))).toBe(false);
  });

  it('o saldo precisa cobrir o pior caso do pedido: perto do limite, recusa antes de gastar (o dia não passa de 1.000.000)', async () => {
    cenario.gastoHoje = 990_000; // sobram 10 mil; o pior caso de um pedido (saída no teto) passa disso
    const r = await POST(pedido({}));
    expect(r.status).toBe(429);
    expect((await r.json()).limiteAtingido).toBe(true);
    expect(chamadas.some((c) => c.url.includes('generativelanguage'))).toBe(false);
    cenario.gastoHoje = 900_000; // folga suficiente: sai
    chamadas.length = 0;
    expect((await POST(pedido({}))).status).toBe(200);
  });

  it('sem o contador (migração ausente ou banco fora), o Lu não roda: nunca gasta sem contar', async () => {
    cenario.consumoStatus = 404;
    const r = await POST(pedido({}));
    expect(r.status).toBe(503);
    expect(chamadas.some((c) => c.url.includes('generativelanguage'))).toBe(false);
  });

  it('"consumo": só lê o medidor, sem IA e sem precisar de parágrafo', async () => {
    cenario.gastoHoje = 250_000;
    const r = await POST(pedido({ acao: 'consumo', analise_id: '', paragrafo: '' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ consumo: { creditos: 250_000, limite: 1_000_000 } });
    expect(chamadas.some((c) => c.url.includes('generativelanguage') || c.url.includes('registrar_consumo_lu'))).toBe(false);
  });

  it('o pedido ao Gemini tem teto de saída e raciocínio curto (custo por pedido limitado)', async () => {
    await POST(pedido({}));
    const cfg = corpoDoGemini().generationConfig;
    expect(cfg.maxOutputTokens).toBe(4096);
    expect(cfg.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });
});
