import { describe, it, expect } from 'vitest';
import { montarCarteira, estadoDoMarco, contarSituacoes, hojeEmBrasilia, formatarData } from '../src/lib/carteiraModelo.js';

const HOJE = new Date(Date.UTC(2026, 10, 25)); // 25/11/2026
const analise = (id, caso, versao = 1, extra = {}) => ({ id, caso_id: caso, versao, created_at: `2026-11-0${versao}T10:00:00Z`, titulo: `Caso ${caso}`, ...extra });
const marco = (caso, data, tipo, extra = {}) => ({ id: `${caso}-${data}`, caso_id: caso, chave: `${caso}|${data}`, tese: 'prescricao_ordinaria', cda: '1', periodo: '2020', data, tipo, condicao: '', ...extra });

describe('carteiraModelo', () => {
  it('estado do marco: consumado, consumou agora (acompanhar com data passada) e futuro com dias restantes', () => {
    expect(estadoDoMarco(marco('a', '2020-01-01', 'consumado'), HOJE).estado).toBe('consumado');
    expect(estadoDoMarco(marco('a', '2026-11-24', 'acompanhar'), HOJE)).toEqual({ estado: 'consumou_agora', dias: -1 });
    expect(estadoDoMarco(marco('a', '2026-11-25', 'acompanhar'), HOJE)).toEqual({ estado: 'futuro', dias: 0 });
    expect(estadoDoMarco(marco('a', '2026-12-25', 'acompanhar'), HOJE)).toEqual({ estado: 'futuro', dias: 30 });
  });

  it('uma linha por caso (a versão mais nova) e aviso de cálculo desatualizado', () => {
    const itens = montarCarteira({
      analises: [analise('a1', 'A', 1), analise('a2', 'A', 2), analise('b1', 'B', 1)],
      carteira: [{ caso_id: 'A', analise_id: 'a1', fase: 'analisado', teses: [], calculado_em: '2026-11-01T00:00:00Z' }],
      marcos: [],
      hoje: HOJE,
    });
    expect(itens.map((i) => i.analise.id).sort()).toEqual(['a2', 'b1']);
    expect(itens.find((i) => i.analise.id === 'a2').desatualizado).toBe(true);
    expect(itens.find((i) => i.analise.id === 'b1').situacao).toBe('sem_calculo');
  });

  it('situação e ordem: consumou agora > pronto > acompanhando (mais perto primeiro) > revisar > peça em andamento > sem cálculo > nada > encerrado', () => {
    const calc = (caso, fase = 'analisado', teses = []) => ({ caso_id: caso, analise_id: caso.toLowerCase(), fase, teses, calculado_em: '2026-11-20T00:00:00Z' });
    const itens = montarCarteira({
      analises: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((c) => analise(c.toLowerCase(), c)),
      carteira: [
        calc('A'), calc('B'), calc('C'), calc('D'),
        calc('E', 'analisado', [{ tese: 'decadencia', status: 'bloqueada', bloqueios: ['x'] }]),
        calc('F'), calc('G', 'arquivado'),
        calc('H', 'peca_gerada'),
      ],
      marcos: [
        marco('A', '2026-11-20', 'acompanhar'),
        marco('B', '2020-01-01', 'consumado'),
        marco('C', '2028-03-20', 'acompanhar'),
        marco('D', '2027-01-10', 'acompanhar'),
        marco('G', '2026-11-20', 'acompanhar'),
        marco('H', '2020-01-01', 'consumado'),
      ],
      hoje: HOJE,
    });
    expect(itens.map((i) => `${i.casoId}:${i.situacao}`)).toEqual([
      'A:consumou_agora', 'B:pronto', 'D:acompanhando', 'C:acompanhando', 'E:revisar', 'H:tramitando', 'F:nada', 'G:encerrado',
    ]);
    expect(contarSituacoes(itens)).toMatchObject({ consumou_agora: 1, pronto: 1, acompanhando: 2, revisar: 1, tramitando: 1, nada: 1, encerrado: 1 });
  });

  it('datas: hoje em Brasília (UTC-3) e formato BR', () => {
    expect(hojeEmBrasilia(new Date('2026-11-26T02:00:00Z')).toISOString().slice(0, 10)).toBe('2026-11-25');
    expect(formatarData('2029-06-15')).toBe('15/06/2029');
  });
});
