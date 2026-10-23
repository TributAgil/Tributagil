import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// Endpoint do Lu (api/lu.js) com Supabase e Gemini simulados: citações conferidas, cota de 5, parecer como fonte do caso.

process.env.GEMINI_API_KEY = 'chave-de-teste';
process.env.SUPABASE_URL = 'https://abc123.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-de-teste';
delete process.env.GEMINI_MODEL_RESERVA;
delete process.env.GEMINI_MODEL;

let POST;
let gemini; // { texto } ou { status }
let analise; // linha de analises devolvida
let docs; // chunks de documento devolvidos pela busca
let chamadasGeracao;
let rpcs;
let corpoGeracao;

const resp = (corpo, status = 200) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status });
const PARECER = {
  conclusoes: [{ id: 1, tipo: 'prescricao', severidade: 'favoravel', titulo: 'Prescrição consumada', resumo: 'Mais de cinco anos.', fundamento_legal: 'Art. 174 do CTN', confianca: 90 }],
  fatos_importantes: [],
  raciocinio: [],
  recomendacoes: [],
  alerta_dados_insuficientes: '',
};

beforeAll(async () => {
  ({ POST } = await import('../api/lu.js'));
});

beforeEach(() => {
  chamadasGeracao = 0;
  rpcs = [];
  corpoGeracao = null;
  gemini = { texto: 'A prescrição se consumou [P1].' };
  analise = { perguntas_lu_disponiveis: 5, resultado: PARECER, peca_resumo: null };
  docs = [{ documento_nome: 'cda.pdf', storage_path: 'u/c/cda.pdf', pagina: 2, conteudo: 'Vencimento 30/04/2017', similaridade: 0.9 }];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', async (url, opcoes) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) return resp({ id: 'user-1' });
    if (u.includes('/rest/v1/analises')) return resp([analise]);
    if (u.includes('/rest/v1/rpc/')) {
      const nome = u.split('/rpc/')[1];
      rpcs.push(nome);
      if (nome === 'rate_limit_checar') return resp([{ ok: true }]);
      if (nome === 'buscar_documento_chunks') return resp(docs);
      if (nome === 'buscar_legislacao_chunks') return resp([{ norma: 'CTN', identificador: 'art. 174', texto_integral: 'Cinco anos.', similaridade: 0.9 }]);
      if (nome === 'decrementar_pergunta_lu') return resp(Math.max(0, Math.min(analise.perguntas_lu_disponiveis, 5) - 1));
      return new Response(null, { status: 204 });
    }
    if (u.includes(':embedContent')) return resp({ embedding: { values: new Array(768).fill(0.1) } });
    if (u.includes(':generateContent')) {
      chamadasGeracao += 1;
      corpoGeracao = JSON.parse(opcoes.body);
      if (gemini.status) return resp({ error: { status: 'INVALID_ARGUMENT', message: 'x' } }, gemini.status);
      return resp({ candidates: [{ content: { parts: [{ text: gemini.texto }] } }] });
    }
    throw new Error(`fetch inesperado: ${u}`);
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const pedir = (pergunta = 'Qual a conclusão?') =>
  POST(
    new Request('http://localhost/api/lu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '8.8.8.8' },
      body: JSON.stringify({ casoId: 'c1', analiseId: 'a1', pergunta, historico: [], userToken: 'tok' }),
    }),
  );

describe('api/lu', () => {
  it('responde com citação válida, devolve só a fonte citada e desconta 1 da cota', async () => {
    const r = await pedir();
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.resposta).toBe('A prescrição se consumou [1].');
    expect(j.fontes).toHaveLength(1);
    expect(j.fontes[0]).toMatchObject({ n: 1, tipo: 'parecer' });
    expect(j.perguntasDisponiveis).toBe(4);
    expect(rpcs).toContain('decrementar_pergunta_lu');
  });

  it('o contexto enviado ao modelo traz o parecer numerado', async () => {
    await pedir();
    const texto = corpoGeracao.contents.at(-1).parts[0].text;
    expect(texto).toContain('[P1] Parecer, conclusão 1');
    expect(texto).toContain('[D1] cda.pdf, pág. 2');
    expect(texto).toContain('nenhuma peça foi gerada');
  });

  it('cita documento: a fonte leva página e caminho do arquivo', async () => {
    gemini.texto = 'O vencimento foi em 30/04/2017 [D1].';
    const j = await (await pedir()).json();
    expect(j.fontes[0]).toMatchObject({ tipo: 'documento', documento: 'cda.pdf', pagina: 2, storage_path: 'u/c/cda.pdf' });
  });

  it('resposta sem citação válida: marca semFonteConferida e NÃO desconta', async () => {
    gemini.texto = 'Resposta com fonte inventada [D9].';
    const j = await (await pedir()).json();
    expect(j.semFonteConferida).toBe(true);
    expect(j.fontes).toEqual([]);
    expect(j.perguntasDisponiveis).toBe(5);
    expect(rpcs).not.toContain('decrementar_pergunta_lu');
  });

  it('sem documento mas com parecer: ainda responde', async () => {
    docs = [];
    const j = await (await pedir()).json();
    expect(chamadasGeracao).toBe(1);
    expect(j.fontes[0].tipo).toBe('parecer');
  });

  it('sem documento e sem parecer: "não sei" sem chamar o modelo e sem descontar', async () => {
    docs = [];
    analise = { perguntas_lu_disponiveis: 5, resultado: null, peca_resumo: null };
    const j = await (await pedir()).json();
    expect(chamadasGeracao).toBe(0);
    expect(j.resposta).toMatch(/Não encontrei/);
    expect(rpcs).not.toContain('decrementar_pergunta_lu');
  });

  it('cota zerada: nem chama o modelo', async () => {
    analise.perguntas_lu_disponiveis = 0;
    const j = await (await pedir()).json();
    expect(j.limiteAtingido).toBe(true);
    expect(j.resposta).toMatch(/5 perguntas/);
    expect(chamadasGeracao).toBe(0);
  });

  it('consulta antiga com mais de 5 passa a valer no máximo 5', async () => {
    analise.perguntas_lu_disponiveis = 9;
    docs = [];
    analise.resultado = null;
    const j = await (await pedir()).json();
    expect(j.perguntasDisponiveis).toBe(5);
  });

  it('erro do Gemini que repetir não resolve: 502 com mensagem clara e sem desconto', async () => {
    gemini = { status: 400 };
    const r = await pedir();
    expect(r.status).toBe(502);
    expect((await r.json()).error).toBeTruthy();
    expect(rpcs).not.toContain('decrementar_pergunta_lu');
  });
});
