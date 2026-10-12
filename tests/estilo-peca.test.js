// Guarda de ESTILO do texto que o SISTEMA escreve dentro das peças (rótulos da linha do tempo, quadro
// sinóptico, avisos). O texto jurídico da advogada não entra aqui: ele é fixo e conferido contra os
// originais em pecas-render.test.js. Regra (skill jusmanizer, J01): zero travessão/meia-risca no texto
// autoral. Ficam de fora o que não é prosa do sistema: marcadores [PREENCHER]/[INSERIR FIGURA] (somem
// quando o advogado preenche), legendas "Figura n - …" e a tabela de marcos da EPE de decadência
// (`linhas`), que reproduzem a redação do modelo original.
import { describe, it, expect } from 'vitest';
import { avaliarPeca } from '../api/_motor-peca.js';
import { montarContexto } from '../api/_contexto-peca.js';
import { dadosPrescricao, dadosDecadencia, dadosIntercorrente, escritorio, AGORA, parecerFavoravel, periodoDecadencia, intimacao, evento } from './fixtures-peca.js';

const RISCA = /[—–]/;
const ISENTO_CHAVES = new Set(['linhas']); // redação do modelo original (EPE de decadência)
const ISENTO_VALOR = /^(\[PREENCHER|\[INSERIR FIGURA|Figura \d+ -)/;

function proseDoSistema(no, caminho = 'contexto', achados = []) {
  if (typeof no === 'string') {
    if (!ISENTO_VALOR.test(no) && RISCA.test(no)) achados.push(`${caminho}: ${no}`);
    return achados;
  }
  if (Array.isArray(no)) return no.forEach((x, i) => proseDoSistema(x, `${caminho}[${i}]`, achados)) || achados;
  if (no && typeof no === 'object') {
    for (const [k, v] of Object.entries(no)) if (!ISENTO_CHAVES.has(k)) proseDoSistema(v, `${caminho}.${k}`, achados);
  }
  return achados;
}

const contextoDe = (dados, tese, tipoParecer, esc = escritorio) => {
  const avaliacao = avaliarPeca({ dados, tese, conclusoesParecer: parecerFavoravel(tipoParecer), agora: AGORA });
  expect(avaliacao.status, JSON.stringify(avaliacao.bloqueios)).toBe('ok');
  return montarContexto({ dados, avaliacao, escritorio: esc, agora: AGORA });
};

describe('texto escrito pelo sistema nas peças: sem travessão nem meia-risca', () => {
  it('prescrição ordinária (EPE e Revisão)', () => {
    expect(proseDoSistema(contextoDe(dadosPrescricao(), 'prescricao_ordinaria', 'prescricao'))).toEqual([]);
    expect(proseDoSistema(contextoDe(dadosPrescricao({ ajuizada: false }), 'prescricao_ordinaria', 'prescricao'))).toEqual([]);
  });

  it('decadência (EPE e Revisão), com art. 150 §4º, art. 173 I e dois períodos', () => {
    const dois = dadosDecadencia({ ajuizada: false, periodos: [periodoDecadencia(), periodoDecadencia({ periodo: '2006', houve_pagamento_antecipado: 'sim', fonte_pagamento_antecipado: 'extrato.pdf' })] });
    expect(proseDoSistema(contextoDe(dadosDecadencia(), 'decadencia', 'decadencia'))).toEqual([]);
    expect(proseDoSistema(contextoDe(dois, 'decadencia', 'decadencia'))).toEqual([]);
  });

  it('prescrição intercorrente, com ciclo interrompido e protesto', () => {
    const dados = dadosIntercorrente({ protesto: true, eventos: [intimacao('10/03/2016', 'devedor'), evento('citacao', '15/05/2016'), intimacao('10/03/2017')] });
    expect(proseDoSistema(contextoDe(dados, 'prescricao_intercorrente', 'prescricao_intercorrente'))).toEqual([]);
  });

  it('o aviso de gênero ausente no cadastro (que vai para o documento) também sai sem risca', () => {
    const semGenero = { ...escritorio, advogados: [{ nome: 'Ana', oab: '1', uf: 'BA' }] };
    expect(proseDoSistema(contextoDe(dadosPrescricao(), 'prescricao_ordinaria', 'prescricao', semGenero))).toEqual([]);
  });

  it('o detector enxerga uma risca de verdade (o teste não é vazio)', () => {
    expect(proseDoSistema({ linha_do_tempo: [{ evento: 'Fato gerador — período 2005' }] })).toHaveLength(1);
    expect(proseDoSistema({ linhas: [{ fundamento: 'Extrapolação — Operada' }], fig: '[INSERIR FIGURA 1 – x]' })).toEqual([]);
  });
});
