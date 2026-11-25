import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import { marcosDoCaso, dataIso } from '../api/_carteira.js';
import { dadosDoCaso } from '../scripts/casos-ficticios/montar-dados.mjs';

// Carteira de casos: os marcos que saem do motor (api/_carteira.js) e o alerta diário por e-mail (api/alertas-prazo.js).

const casos = JSON.parse(fs.readFileSync(new URL('../scripts/casos-ficticios/cenarios.json', import.meta.url), 'utf8'));
const parseBR = (s) => {
  const [d, m, a] = s.split('/').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};
const conclusoes = (c) => (c.parecer_favoravel || []).map((t) => ({ tipo: t === 'prescricao_ordinaria' ? 'prescricao' : t, severidade: 'favoravel', confianca: 90 }));
const marcosDe = (id) => {
  const c = casos.find((x) => x.id === id);
  return marcosDoCaso({ dados: dadosDoCaso(c), conclusoesParecer: conclusoes(c), agora: parseBR(c.agora) });
};
const resumo = (r) => r.marcos.map((m) => `${m.tipo}:${m.tese}:${m.cda}:${m.periodo}:${m.data}`);

describe('marcosDoCaso (casos fictícios do gabarito)', () => {
  it('P02: só as competências prescritas; a de 06/2014 já foi interrompida pelo ajuizamento e não entra', () => {
    const r = marcosDe('P02');
    expect(r.ajuizada).toBe(true);
    expect(resumo(r)).toEqual([
      'consumado:prescricao_ordinaria:50.100.002-1:01/2012:20/02/2017',
      'consumado:prescricao_ordinaria:50.100.002-1:02/2012:20/03/2017',
    ]);
    expect(r.teses.find((t) => t.tese === 'prescricao_ordinaria').status).toBe('ok');
  });

  it('P09: sem execução e dentro do prazo vira "acompanhar" até a consumação, com a condição do ajuizamento', () => {
    const r = marcosDe('P09');
    expect(resumo(r)).toEqual(['acompanhar:prescricao_ordinaria:50.100.009-1:2022:20/03/2028']);
    expect(r.marcos[0].condicao).toMatch(/execução fiscal não tenha sido ajuizada/);
  });

  it('D10: só o período decaído (decadência não muda com o tempo)', () => {
    expect(resumo(marcosDe('D10'))).toEqual(['consumado:decadencia:50.200.010-1:2016:01/01/2022']);
  });

  it('I05: intercorrente em curso vira "acompanhar" até 15/06/2029; I04: consumada em 10/03/2023', () => {
    const i05 = marcosDe('I05');
    expect(resumo(i05)).toEqual(['acompanhar:prescricao_intercorrente:::15/06/2029']);
    expect(i05.marcos[0].condicao).toMatch(/penhora efetiva/);
    expect(resumo(marcosDe('I04'))).toEqual(['consumado:prescricao_intercorrente:::10/03/2023']);
  });

  it('P04, D11 e I03: nada a acompanhar', () => {
    for (const id of ['P04', 'D11', 'I03']) expect(marcosDe(id).marcos).toEqual([]);
  });

  it('chave estável e única por marco; dataIso converte para o banco', () => {
    const r = marcosDe('C01');
    expect(new Set(r.marcos.map((m) => m.chave)).size).toBe(r.marcos.length);
    expect(marcosDe('C01').marcos.map((m) => m.chave)).toEqual(r.marcos.map((m) => m.chave));
    expect(dataIso('15/06/2029')).toBe('2029-06-15');
    expect(dataIso('x')).toBe('');
  });
});

describe('api/alertas-prazo (cron diário)', () => {
  let api;
  let chamadas;
  let cenario;
  const resp = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status });
  const linha = (extra) => ({
    id: 1, user_id: 'u1', email: 'a@x.com', caso_id: 'c1', titulo: 'Execução <Maria>', tese: 'prescricao_intercorrente',
    cda: '', periodo: '', data: '2029-06-15', condicao: 'desde que não tenha havido penhora efetiva, citação ou outro ato interruptivo até essa data', ...extra,
  });

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://abc123.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-de-teste';
    api = await import('../api/alertas-prazo.js');
  });
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-de-teste';
    process.env.SUPABASE_RPC_SEGREDO = 's'.repeat(40);
    process.env.RESEND_API_KEY = 'resend-de-teste';
    chamadas = [];
    cenario = {
      pendentes: [linha(), linha({ id: 2, caso_id: 'c2', titulo: 'Outro caso', tese: 'prescricao_ordinaria', cda: '50.1', periodo: '2022', data: '2028-03-20' }), linha({ id: 3, email: 'b@x.com', user_id: 'u2' })],
      resendFalhaPara: '',
    };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', async (url, opcoes = {}) => {
      const u = String(url);
      const corpo = opcoes.body ? JSON.parse(opcoes.body) : {};
      chamadas.push({ url: u, corpo, opcoes });
      if (u.endsWith('/rpc/alertas_prazo_pendentes')) return resp(cenario.pendentes);
      if (u.endsWith('/rpc/marcar_alertas_enviados')) return resp(corpo.p_ids.length);
      if (u === 'https://api.resend.com/emails') return corpo.to[0] === cenario.resendFalhaPara ? resp({ error: 'x' }, 500) : resp({ id: 'e1' });
      throw new Error(`fetch inesperado: ${u}`);
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const chamar = (auth = 'Bearer cron-de-teste') =>
    api.GET(new Request('http://localhost/api/alertas-prazo', { headers: auth ? { authorization: auth } : {} }));

  it('só o cron (CRON_SECRET) chama; sem CRON_SECRET configurado, desligado', async () => {
    expect((await chamar('Bearer errado')).status).toBe(401);
    expect((await chamar('')).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await chamar()).status).toBe(503);
    expect(chamadas).toEqual([]);
  });

  it('um e-mail por advogado, com os casos dele; marca como avisados só os enviados; usa o segredo no banco', async () => {
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, pendentes: 3, enviados: 2, falhas: 0 });
    const emails = chamadas.filter((c) => c.url === 'https://api.resend.com/emails');
    expect(emails.map((e) => e.corpo.to[0])).toEqual(['a@x.com', 'b@x.com']);
    expect(emails[0].corpo.subject).toBe('TributÁgil: 2 prazo(s) se consumaram nos seus casos');
    expect(emails[0].corpo.text).toContain('Prescrição intercorrente: consumou em 15/06/2029');
    expect(emails[0].corpo.text).toContain('Prescrição ordinária (CDA 50.1, período 2022): consumou em 20/03/2028');
    expect(emails[0].corpo.html).toContain('Execução &lt;Maria&gt;'); // título escapado
    expect(emails[0].corpo.text).not.toMatch(/[—–]/);
    const marcados = chamadas.filter((c) => c.url.endsWith('/rpc/marcar_alertas_enviados')).map((c) => c.corpo.p_ids);
    expect(marcados).toEqual([[1, 2], [3]]);
    expect(chamadas.filter((c) => c.url.includes('/rpc/')).every((c) => c.corpo.p_segredo === 's'.repeat(40))).toBe(true);
  });

  it('e-mail que falha não é marcado (sai no dia seguinte)', async () => {
    cenario.resendFalhaPara = 'b@x.com';
    const dados = await (await chamar()).json();
    expect(dados).toEqual({ ok: false, pendentes: 3, enviados: 1, falhas: 1 });
    expect(chamadas.filter((c) => c.url.endsWith('/rpc/marcar_alertas_enviados')).map((c) => c.corpo.p_ids)).toEqual([[1, 2]]);
  });

  it('nada pendente: não manda e-mail; sem Resend configurado: não marca nada', async () => {
    cenario.pendentes = [];
    expect(await (await chamar()).json()).toEqual({ ok: true, pendentes: 0, enviados: 0 });
    cenario.pendentes = [linha()];
    delete process.env.RESEND_API_KEY;
    expect((await chamar()).status).toBe(503);
    expect(chamadas.some((c) => c.url.endsWith('/rpc/marcar_alertas_enviados'))).toBe(false);
  });
});
