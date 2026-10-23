import { describe, it, expect } from 'vitest';
import { GRUPOS_PRE_MONTADAS, SUGESTOES_IA, LIMITE_PERGUNTAS_IA, responderPreMontada } from '../src/lib/luPreMontadas.js';

const RESULTADO = {
  alerta_dados_insuficientes: '',
  conclusoes: [
    { id: 1, tipo: 'cautela', severidade: 'atencao', titulo: 'Possível suspensão por parcelamento', resumo: 'Há parcelamento deferido em 2019.', fundamento_legal: 'Art. 151, VI, do CTN', confianca: 60 },
    { id: 2, tipo: 'prescricao', severidade: 'favoravel', titulo: 'Prescrição ordinária consumada', resumo: 'Mais de cinco anos entre a constituição e o ajuizamento.', fundamento_legal: 'Art. 174 do CTN', confianca: 90 },
  ],
  fatos_importantes: [
    { id: 2, categoria: 'processual', data: '20/09/2025', descricao: 'Ajuizamento da execução fiscal', fonte: 'execucao.pdf', relevancia: 'critica' },
    { id: 1, categoria: 'tributaria', data: '30/04/2017', descricao: 'Vencimento do tributo', fonte: 'cda.pdf', relevancia: 'critica' },
    { id: 3, categoria: 'processual', data: '10/11/2025', descricao: 'Citação do executado', fonte: 'execucao.pdf', relevancia: 'media' },
    { id: 4, categoria: 'tributaria', data: '15/01/2018', descricao: 'Inscrição em dívida ativa', fonte: 'cda.pdf', relevancia: 'alta' },
  ],
  raciocinio: [
    { id: 1, premissa: 'O prazo é de cinco anos (art. 174 do CTN).', aplicacao: 'Constituição em 30/04/2017 e ajuizamento em 20/09/2025.', conclusao_logica: 'O prazo se esgotou em 30/04/2022.', referencia: 'CTN art. 174' },
  ],
  recomendacoes: ['Opor exceção de pré-executividade.', 'Juntar o extrato de parcelamento.'],
};

const PECA = {
  gerada_em: '2026-10-23T17:00:00.000Z',
  pecas: [{ modelo: 'Exceção de pré-executividade', tese: 'Prescrição ordinária', descricao: 'Prescrição de dois períodos.', data_referencia: '11/10/2026', campos_preencher: 3, figuras: 4, a_confirmar: 1, avisos: ['Confira a data da citação.'] }],
};

const citados = (r) => [...r.texto.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));

describe('catálogo', () => {
  it('tem as quatro frentes e ids únicos', () => {
    expect(GRUPOS_PRE_MONTADAS.map((g) => g.grupo)).toEqual(['Fundamentação legal', 'Conferência de dados', 'Estratégia processual', 'Peça']);
    const ids = GRUPOS_PRE_MONTADAS.flatMap((g) => g.itens.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(14);
  });
  it('tem 5 sugestões de IA e a cota é 5', () => {
    expect(SUGESTOES_IA).toHaveLength(5);
    expect(LIMITE_PERGUNTAS_IA).toBe(5);
  });
  it('todo id do catálogo tem resposta, sem rede, mesmo com parecer vazio', () => {
    for (const g of GRUPOS_PRE_MONTADAS) for (const i of g.itens) {
      const r = responderPreMontada(i.id, { resultado: {}, pecaResumo: null });
      expect(typeof r.texto, i.id).toBe('string');
      expect(r.texto.length, i.id).toBeGreaterThan(0);
    }
  });
  it('id desconhecido não quebra', () => {
    expect(responderPreMontada('nao_existe', { resultado: RESULTADO }).fontes).toEqual([]);
  });
});

describe('respostas', () => {
  it('conclusão: favorável primeiro, com confiança e citação', () => {
    const r = responderPreMontada('conclusao', { resultado: RESULTADO });
    expect(r.texto.split('\n')[0]).toContain('Prescrição ordinária consumada (favorável, confiança 90%)');
    expect(r.fontes[0]).toMatchObject({ n: 1, tipo: 'parecer', rotulo: 'Parecer, conclusão 2' });
    expect(citados(r)).toEqual([1, 2]);
  });
  it('fundamento legal: conclusões e referências do raciocínio', () => {
    const r = responderPreMontada('fundamento', { resultado: RESULTADO });
    expect(r.texto).toContain('Art. 174 do CTN');
    expect(r.texto).toContain('CTN art. 174');
    expect(r.fontes.some((f) => f.rotulo === 'Parecer, raciocínio 1')).toBe(true);
  });
  it('prazo: regra, aplicação e conclusão do raciocínio', () => {
    const r = responderPreMontada('prazo', { resultado: RESULTADO });
    expect(r.texto).toContain('Regra: O prazo é de cinco anos');
    expect(r.texto).toContain('Aplicação: Constituição em 30/04/2017');
    expect(r.texto).toContain('Conclusão: O prazo se esgotou em 30/04/2022.');
  });
  it('datas: só relevância crítica e alta, em ordem cronológica, com documento', () => {
    const r = responderPreMontada('datas', { resultado: RESULTADO });
    const linhas = r.texto.split('\n');
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toContain('30/04/2017');
    expect(linhas[1]).toContain('15/01/2018');
    expect(linhas[2]).toContain('20/09/2025');
    expect(r.texto).not.toContain('Citação do executado');
    expect(r.fontes[0]).toMatchObject({ tipo: 'parecer', documento: 'cda.pdf' });
  });
  it('linha do tempo: todos os fatos em ordem de data', () => {
    const r = responderPreMontada('linha_tempo', { resultado: RESULTADO });
    const datas = r.texto.split('\n').map((l) => l.slice(0, 10));
    expect(datas).toEqual(['30/04/2017', '15/01/2018', '20/09/2025', '10/11/2025']);
  });
  it('não altera o parecer recebido', () => {
    const copia = JSON.stringify(RESULTADO);
    responderPreMontada('datas', { resultado: RESULTADO });
    responderPreMontada('linha_tempo', { resultado: RESULTADO });
    expect(JSON.stringify(RESULTADO)).toBe(copia);
  });
  it('em que documento consta a citação', () => {
    const r = responderPreMontada('doc_citacao', { resultado: RESULTADO });
    expect(r.texto).toContain('execucao.pdf');
    expect(r.texto).toContain('10/11/2025');
    expect(r.fontes[0].documento).toBe('execucao.pdf');
  });
  it('marco ausente: diz que o parecer não registra', () => {
    const r = responderPreMontada('doc_notificacao', { resultado: RESULTADO });
    expect(r.texto).toContain('não registra');
    expect(r.fontes).toHaveLength(0);
  });
  it('riscos: atenção e cautela; sem nenhum, diz isso', () => {
    expect(responderPreMontada('riscos', { resultado: RESULTADO }).texto).toContain('Possível suspensão por parcelamento');
    expect(responderPreMontada('riscos', { resultado: { conclusoes: [{ id: 1, tipo: 'prescricao', severidade: 'favoravel', titulo: 't', resumo: 'r', fundamento_legal: 'f', confianca: 90 }] } }).texto).toContain('Nenhum ponto de atenção');
  });
  it('confirmar: confiança baixa, alerta e pendências da peça', () => {
    const r = responderPreMontada('confirmar', { resultado: { ...RESULTADO, alerta_dados_insuficientes: '[ALERTA DE DADOS INSUFICIENTES] Informar a data da citação.' }, pecaResumo: PECA });
    expect(r.texto).toContain('Informar a data da citação');
    expect(r.texto).toContain('confiança de 60%');
    expect(r.texto).toContain('3 campo(s) a preencher');
    expect(r.fontes.some((f) => f.tipo === 'peca')).toBe(true);
  });
  it('próximos passos: recomendações numeradas', () => {
    const r = responderPreMontada('proximos', { resultado: RESULTADO });
    expect(r.texto.split('\n')).toEqual(['1. Opor exceção de pré-executividade. [1]', '2. Juntar o extrato de parcelamento. [2]']);
  });
});

describe('peça', () => {
  it('sem peça: avisa e marca semPeca', () => {
    for (const id of ['peca_pendencias', 'peca_modelo']) {
      const r = responderPreMontada(id, { resultado: RESULTADO, pecaResumo: null });
      expect(r.semPeca, id).toBe(true);
      expect(r.texto, id).toContain('Nenhuma peça foi gerada');
    }
  });
  it('com peça: pendências e modelo', () => {
    const p = responderPreMontada('peca_pendencias', { resultado: RESULTADO, pecaResumo: PECA });
    expect(p.semPeca).toBe(false);
    expect(p.texto).toContain('3 campo(s) a preencher');
    expect(p.texto).toContain('4 figura(s)');
    expect(p.texto).toContain('Confira a data da citação.');
    const m = responderPreMontada('peca_modelo', { resultado: RESULTADO, pecaResumo: PECA });
    expect(m.texto).toContain('Exceção de pré-executividade');
    expect(m.texto).toContain('23/10/2026');
  });
});

describe('estilo', () => {
  it('nenhuma resposta usa travessão', () => {
    for (const g of GRUPOS_PRE_MONTADAS) for (const i of g.itens) {
      const r = responderPreMontada(i.id, { resultado: RESULTADO, pecaResumo: PECA });
      expect(r.texto, i.id).not.toMatch(/[—–]/);
    }
  });
});
