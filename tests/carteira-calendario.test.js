import { describe, it, expect } from 'vitest';
import {
  montarCarteira, filtrarCarteira, filtrosAtivos, eventosDoCalendario, avisosDaCarteira, semanasDoMes, eventosPorDia, FILTROS_PADRAO,
} from '../src/lib/carteiraModelo.js';

// Avisos dentro da plataforma: calendário de prazos e filtros da carteira (sem e-mail).

const HOJE = new Date(Date.UTC(2026, 10, 25)); // 25/11/2026
const analise = (c) => ({ id: c.toLowerCase(), caso_id: c, versao: 1, created_at: '2026-11-01T10:00:00Z', titulo: `Comércio ${c} Ltda` });
const calc = (c, fase = 'analisado') => ({ caso_id: c, analise_id: c.toLowerCase(), fase, teses: [], calculado_em: '2026-11-20T00:00:00Z' });
const marco = (c, data, tipo, tese = 'prescricao_ordinaria', cda = `CDA-${c}`) => ({ id: `${c}-${data}`, caso_id: c, chave: `${c}|${data}`, tese, cda, periodo: '2020', data, tipo, condicao: '' });

const itens = montarCarteira({
  analises: ['A', 'B', 'C', 'D', 'E'].map(analise),
  carteira: [calc('A'), calc('B'), calc('C', 'protocolado'), calc('D', 'arquivado'), calc('E')],
  marcos: [
    marco('A', '2026-11-20', 'acompanhar'), // consumou agora
    marco('B', '2026-12-10', 'acompanhar', 'prescricao_intercorrente'), // em 15 dias
    marco('C', '2027-06-01', 'acompanhar'), // longe
    marco('C', '2018-01-01', 'consumado'),
    marco('D', '2026-12-01', 'acompanhar'), // caso arquivado: fora do calendário
    marco('E', '2019-05-05', 'consumado', 'decadencia'),
  ],
  hoje: HOJE,
});

describe('calendário de prazos', () => {
  it('só os prazos a acompanhar (futuros e consumados agora), sem casos encerrados nem consumados de origem', () => {
    const ev = eventosDoCalendario(itens);
    expect(ev.map((e) => [e.data, e.estado])).toEqual([
      ['2026-11-20', 'consumou_agora'],
      ['2026-12-10', 'futuro'],
      ['2027-06-01', 'futuro'],
    ]);
    expect(eventosPorDia(ev).get('2026-12-10')[0].titulo).toBe('Comércio B Ltda');
  });

  it('avisos: consumados agora e prazos nos próximos 30 dias', () => {
    expect(avisosDaCarteira(itens)).toEqual({ consumouAgora: 1, proximos: 1, janela: 30 });
  });

  it('grade do mês começa no domingo; novembro de 2026 começa num domingo e tem 5 semanas', () => {
    const s = semanasDoMes(2026, 10);
    expect(s[0][0]).toBe('2026-11-01');
    expect(s).toHaveLength(5);
    expect(s[4].filter(Boolean).pop()).toBe('2026-11-30');
    const fev = semanasDoMes(2027, 1); // 01/02/2027 é segunda
    expect(fev[0][0]).toBeNull();
    expect(fev[0][1]).toBe('2027-02-01');
  });
});

describe('filtros', () => {
  const ids = (lista) => lista.map((i) => i.casoId).sort();
  it('padrão: todos os ativos (sem encerrados); encerrados à parte', () => {
    expect(ids(filtrarCarteira(itens))).toEqual(['A', 'B', 'C', 'E']);
    expect(ids(filtrarCarteira(itens, { situacao: 'encerrado' }))).toEqual(['D']);
  });
  it('combina situação, fase, tese, busca (sem acento, também na CDA) e dia do calendário', () => {
    expect(ids(filtrarCarteira(itens, { situacao: 'acompanhando' }))).toEqual(['B', 'C']);
    expect(ids(filtrarCarteira(itens, { fase: 'protocolado' }))).toEqual(['C']);
    expect(ids(filtrarCarteira(itens, { tese: 'decadencia' }))).toEqual(['E']);
    expect(ids(filtrarCarteira(itens, { busca: 'comercio b' }))).toEqual(['B']);
    expect(ids(filtrarCarteira(itens, { busca: 'cda-c' }))).toEqual(['C']);
    expect(ids(filtrarCarteira(itens, { dia: '2026-12-10' }))).toEqual(['B']);
    expect(ids(filtrarCarteira(itens, { situacao: 'acompanhando', tese: 'prescricao_intercorrente' }))).toEqual(['B']);
  });
  it('conta os filtros ligados', () => {
    expect(filtrosAtivos(FILTROS_PADRAO)).toBe(0);
    expect(filtrosAtivos({ ...FILTROS_PADRAO, fase: 'protocolado', busca: 'x' })).toBe(2);
  });
});
