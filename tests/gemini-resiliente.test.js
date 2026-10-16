import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chamarGemini, ErroGemini, MENSAGEM_SOBRECARGA, MENSAGEM_INDISPONIVEL, MARCADOR_ALERTA_CREDITOS, segundosDeEspera } from '../api/_gemini-resiliente.js';

beforeEach(() => {
  // os logs de erro/aviso são esperados nestes testes
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const resposta = (status, corpo = {}) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status });
const OK = () => resposta(200, { candidates: [] });
const SOBRECARGA = () => resposta(503, { error: { status: 'UNAVAILABLE', message: 'The model is overloaded. Please try again later.' } });
const COTA_DIARIA = () => resposta(429, { error: { message: 'Quota exceeded ... limit: 20 ... Please retry in 10h13m16.34s.' } });
const montarUrl = (m) => `https://exemplo.test/${m}:generateContent`;

// fetch roteirizado por modelo: { principal: [fn, fn, ...], reserva: [...] }; a última resposta da lista se repete
function roteiro(porModelo) {
  const chamadas = [];
  const cursor = {};
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const modelo = /exemplo\.test\/([^:]+):/.exec(String(url))[1];
    chamadas.push(modelo);
    const lista = porModelo[modelo];
    cursor[modelo] = (cursor[modelo] ?? -1) + 1;
    return lista[Math.min(cursor[modelo], lista.length - 1)]();
  }));
  return chamadas;
}

const base = () => ({ montarUrl, corpo: '{}', modelo: 'principal', modeloReserva: '', rotulo: 't' });
const semEspera = () => vi.fn(async () => {});

describe('chamarGemini: resistência a sobrecarga', () => {
  it('503 uma vez e depois OK: repete no mesmo modelo, com espera, e devolve a resposta', async () => {
    const chamadas = roteiro({ principal: [SOBRECARGA, OK] });
    const dormir = semEspera();
    const r = await chamarGemini({ ...base(), dormir });
    expect(r.modelo).toBe('principal');
    expect(r.usouReserva).toBe(false);
    expect(chamadas).toEqual(['principal', 'principal']);
    expect(dormir).toHaveBeenCalledTimes(1);
    expect(dormir.mock.calls[0][0]).toBe(2000);
  });

  it('esperas crescentes: 2s, 5s e 12s antes de desistir', async () => {
    const chamadas = roteiro({ principal: [SOBRECARGA] });
    const dormir = semEspera();
    await expect(chamarGemini({ ...base(), dormir })).rejects.toBeInstanceOf(ErroGemini);
    expect(chamadas.length).toBe(4);
    expect(dormir.mock.calls.map((c) => c[0])).toEqual([2000, 5000, 12000]);
  });

  it('sobrecarga que não passa e sem reserva: ErroGemini "sobrecarga" com mensagem clara e 503', async () => {
    roteiro({ principal: [SOBRECARGA] });
    const erro = await chamarGemini({ ...base(), dormir: semEspera() }).catch((e) => e);
    expect(erro.tipo).toBe('sobrecarga');
    expect(erro.statusHttp).toBe(503);
    expect(erro.mensagemUsuario).toBe(MENSAGEM_SOBRECARGA);
    expect(erro.mensagemUsuario).toMatch(/sobrecarregado/);
    expect(erro.retryAfterSegundos).toBe(120);
  });

  it('sobrecarga no principal e reserva configurada: a reserva atende', async () => {
    const chamadas = roteiro({ principal: [SOBRECARGA], reserva: [OK] });
    const r = await chamarGemini({ ...base(), modeloReserva: 'reserva', dormir: semEspera() });
    expect(r).toMatchObject({ modelo: 'reserva', usouReserva: true });
    expect(chamadas).toEqual(['principal', 'principal', 'principal', 'principal', 'reserva']);
  });

  it('a reserva também sobrecarregada: falha com a sobrecarga do principal', async () => {
    roteiro({ principal: [SOBRECARGA], reserva: [SOBRECARGA] });
    const erro = await chamarGemini({ ...base(), modeloReserva: 'reserva', dormir: semEspera() }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroGemini);
    expect(erro.tipo).toBe('sobrecarga');
  });

  it('reserva igual ao principal é ignorada (não repete a mesma coisa)', async () => {
    const chamadas = roteiro({ principal: [SOBRECARGA] });
    await chamarGemini({ ...base(), modeloReserva: 'principal', dormir: semEspera() }).catch(() => {});
    expect(chamadas.length).toBe(4);
  });

  it('falha de rede até o Google é tratada como transitória', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => { if (++n === 1) throw new TypeError('fetch failed'); return OK(); }));
    const r = await chamarGemini({ ...base(), dormir: semEspera() });
    expect(r.resp.ok).toBe(true);
    expect(n).toBe(2);
  });
});

describe('chamarGemini: cota e erros que repetir não resolve', () => {
  it('cota DIÁRIA (retry in 10h...): não repete no principal; sem reserva falha na hora com 429', async () => {
    const chamadas = roteiro({ principal: [COTA_DIARIA] });
    const dormir = semEspera();
    const erro = await chamarGemini({ ...base(), dormir }).catch((e) => e);
    expect(chamadas).toEqual(['principal']);
    expect(dormir).not.toHaveBeenCalled();
    expect(erro).toMatchObject({ tipo: 'cota', cotaEsgotada: true, statusHttp: 429 });
    expect(erro.mensagemUsuario).toMatch(/limite de uso da IA/);
    expect(erro.mensagemUsuario).toMatch(/11 h/);
  });

  it('cota diária do principal e reserva configurada: vai direto para a reserva (a cota gratuita é por modelo)', async () => {
    const chamadas = roteiro({ principal: [COTA_DIARIA], reserva: [OK] });
    const dormir = semEspera();
    const r = await chamarGemini({ ...base(), modeloReserva: 'reserva', dormir });
    expect(r.usouReserva).toBe(true);
    expect(chamadas).toEqual(['principal', 'reserva']);
    expect(dormir).not.toHaveBeenCalled();
  });

  it('429 por minuto com "retry in 12s": espera pelo menos o que o Gemini pediu', async () => {
    roteiro({ principal: [() => resposta(429, { error: { message: 'Rate limit. Please retry in 12.5s.' } }), OK] });
    const dormir = semEspera();
    await chamarGemini({ ...base(), dormir });
    expect(dormir.mock.calls[0][0]).toBe(12500);
  });

  it('400 (schema recusado): falha na hora, não usa a reserva e não diz que é sobrecarga', async () => {
    const chamadas = roteiro({ principal: [() => resposta(400, { error: { message: 'schema inválido' } })], reserva: [OK] });
    const erro = await chamarGemini({ ...base(), modeloReserva: 'reserva', dormir: semEspera() }).catch((e) => e);
    expect(chamadas).toEqual(['principal']);
    expect(erro).toMatchObject({ tipo: 'erro', statusGemini: 400, statusHttp: 502 });
    expect(erro.mensagemUsuario).toBe('Falha na API do Gemini (HTTP 400).');
  });

  it('timeout de quem chama (AbortError) passa direto, sem virar ErroGemini', async () => {
    const ctrl = new AbortController();
    vi.stubGlobal('fetch', vi.fn(async () => { ctrl.abort(); throw Object.assign(new Error('Aborted'), { name: 'AbortError' }); }));
    await expect(chamarGemini({ ...base(), signal: ctrl.signal, dormir: semEspera() })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('chamarGemini: 402 (créditos pré-pagos)', () => {
  const CREDITOS = () => resposta(402, { error: { code: 402, status: 'RESOURCE_EXHAUSTED', message: 'Your prepayment credits are depleted.' } });

  it('402 intermitente (crédito recém-comprado ainda propagando): repete e a resposta boa é usada', async () => {
    const chamadas = roteiro({ principal: [CREDITOS, CREDITOS, OK] });
    const dormir = semEspera();
    const r = await chamarGemini({ ...base(), dormir });
    expect(r.resp.ok).toBe(true);
    expect(chamadas.length).toBe(3);
    expect(dormir.mock.calls.map((c) => c[0])).toEqual([2000, 5000]);
  });

  it('402 que persiste: ErroGemini "creditos", 503, sem usar a reserva, com alerta no log para o dono', async () => {
    const chamadas = roteiro({ principal: [CREDITOS], reserva: [OK] });
    const erro = await chamarGemini({ ...base(), modeloReserva: 'reserva', dormir: semEspera() }).catch((e) => e);
    expect(chamadas.every((m) => m === 'principal')).toBe(true);
    expect(chamadas.length).toBe(4);
    expect(erro).toMatchObject({ tipo: 'creditos', statusHttp: 503, retryAfterSegundos: 300 });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(MARCADOR_ALERTA_CREDITOS));
  });

  it('o cliente não vê "crédito", "402" nem "faturamento": só que o serviço está indisponível', async () => {
    roteiro({ principal: [CREDITOS] });
    const erro = await chamarGemini({ ...base(), dormir: semEspera() }).catch((e) => e);
    expect(erro.mensagemUsuario).toBe(MENSAGEM_INDISPONIVEL);
    expect(erro.mensagemUsuario).not.toMatch(/cr[eé]dito|402|faturamento|billing/i);
    expect(erro.codigo).toBe('gemini_indisponivel');
  });
});

describe('segundosDeEspera', () => {
  it('lê horas, minutos e segundos', () => {
    expect(segundosDeEspera('Please retry in 10h13m16.34s.')).toBeCloseTo(36796.34, 1);
    expect(segundosDeEspera('retry in 12s')).toBe(12);
    expect(segundosDeEspera('sem dica')).toBe(0);
  });
});
