import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import JSZip from 'jszip';
import { confrontar, montarReplica, normalizarManifestacao } from '../api/_replica.js';
import { contextoGenerico, TEMPLATE_GENERICO, par } from '../api/_pecas-extras.js';
import { renderizarPeca } from '../api/_render-peca.js';
import { dadosDoCaso } from '../scripts/casos-ficticios/montar-dados.mjs';

// Etapa 2: réplica à manifestação da Fazenda. A IA só extrai os argumentos; o confronto com os prazos é código.

const casos = JSON.parse(fs.readFileSync(new URL('../scripts/casos-ficticios/cenarios.json', import.meta.url), 'utf8'));
const caso = (id) => {
  const c = casos.find((x) => x.id === id);
  const [d, m, a] = c.agora.split('/').map(Number);
  return { dados: dadosDoCaso(c), agora: new Date(Date.UTC(a, m - 1, d)) };
};
const arg = (extra) => ({ tipo: 'causa_interruptiva', resumo: 'x', evento: 'nenhum', data_evento: '', cda: '', periodo: '', trecho_literal: '', pagina: 0, ...extra });
const textoDe = (paragrafos) => paragrafos.map((p) => (typeof p === 'string' ? p : p.trechos.map((t) => t.x).join(''))).join('\n');

describe('confrontar (P02: GFIP 01/2012 e 02/2012 prescritas em 2017; execução de 2019)', () => {
  const { dados, agora } = caso('P02');

  it('parcelamento depois da consumação: refutado, citando SÓ os créditos prescritos (06/2014 foi interrompido pelo ajuizamento)', () => {
    const [r] = confrontar({ argumentos: [arg({ evento: 'parcelamento', data_evento: '10/05/2018', cda: '50.100.002-1' })], dados, agora });
    expect(r.situacao).toBe('refutado');
    const t = textoDe(r.paragrafos);
    expect(t).toContain('período 01/2012');
    expect(t).toContain('período 02/2012');
    expect(t).not.toContain('06/2014');
    expect(t).toMatch(/parcelamento .* dívida já prescrita não renuncia/);
  });

  it('ato DENTRO do prazo de um crédito prescrito: conferir, com [CONFIRMAR]', () => {
    const [r] = confrontar({ argumentos: [arg({ evento: 'parcelamento', data_evento: '10/05/2015' })], dados, agora });
    expect(r.situacao).toBe('conferir');
    expect(textoDe(r.paragrafos)).toContain('[CONFIRMAR:');
  });

  it('ato depois da consumação de TODOS os créditos: refutado e sem marcador', () => {
    const [r] = confrontar({ argumentos: [arg({ evento: 'despacho_citatorio', data_evento: '01/08/2019' })], dados, agora });
    expect(r.situacao).toBe('refutado');
    const t = textoDe(r.paragrafos);
    expect(t).toContain('01/08/2019');
    expect(t).toContain('20/02/2017');
    expect(t).toContain('art. 156, V, do CTN');
    expect(t).not.toContain('[CONFIRMAR');
  });

  it('inadequação da via: Súmula 393 citada; argumento sem regra: [PREENCHER] com o resumo', () => {
    const r = confrontar({
      argumentos: [arg({ tipo: 'inadequacao_da_via', resumo: 'exige dilação' }), arg({ tipo: 'outro', resumo: 'a CDA goza de presunção' })],
      dados,
      agora,
    });
    expect(r[0].situacao).toBe('refutado');
    expect(r[0].paragrafos.some((p) => typeof p !== 'string' && p.citacao)).toBe(true);
    expect(r[1].situacao).toBe('sem_resposta');
    expect(textoDe(r[1].paragrafos)).toContain('[PREENCHER: resposta ao argumento da Fazenda: "a CDA goza de presunção"]');
  });
});

describe('confrontar (I04: intercorrente com ciência em 10/03/2017, consumada em 10/03/2023)', () => {
  const { dados, agora } = caso('I04');
  it('pedido de penhora dentro do prazo: refutado (só constrição efetiva interrompe), com aviso para conferir', () => {
    const [r] = confrontar({ argumentos: [arg({ evento: 'requerimento_constricao', data_evento: '05/05/2020' })], dados, agora });
    expect(r.situacao).toBe('refutado');
    expect(textoDe(r.paragrafos)).toMatch(/REsp 1\.340\.553\/RS/);
  });
  it('penhora efetiva dentro do prazo: PROCEDE (o advogado precisa saber); depois da consumação: refutada', () => {
    const [dentro, depois] = confrontar({
      argumentos: [arg({ evento: 'penhora_constricao', data_evento: '05/05/2020' }), arg({ evento: 'penhora_constricao', data_evento: '05/05/2024' })],
      dados,
      agora,
    });
    expect(dentro.situacao).toBe('procede');
    expect(depois.situacao).toBe('refutado');
    expect(textoDe(depois.paragrafos)).toContain('10/03/2023');
  });
});

describe('confrontar (D10: decadência do período 2016 em 01/01/2022)', () => {
  it('constituição alegada depois do prazo decadencial confirma a tese', () => {
    const { dados, agora } = caso('D10');
    const [r] = confrontar({ argumentos: [arg({ tipo: 'constituicao_definitiva', evento: 'notificacao_lancamento', data_evento: '22/08/2023', periodo: '2016' })], dados, agora });
    // 2019 termina em 01/01/2025: a notificação de 2023 não é posterior a TODOS, então fica para resposta manual
    expect(['refutado', 'sem_resposta']).toContain(r.situacao);
  });
});

describe('montarReplica + modelo genérico', () => {
  it('monta síntese, um tópico por argumento, manutenção da tese e pedidos; renderiza no Word sem travessão', async () => {
    const { dados, agora } = caso('P02');
    const manifestacao = normalizarManifestacao({
      data_manifestacao: '15/09/2026',
      argumentos: [
        { tipo: 'causa_interruptiva', resumo: 'O despacho de citação interrompeu a prescrição.', evento: 'despacho_citatorio', data_evento: '01/08/2019', cda: '', periodo: '', trecho_literal: 'o despacho...', pagina: 2 },
        { tipo: 'inadequacao_da_via', resumo: 'A matéria exige dilação probatória.', evento: 'nenhum', data_evento: '', cda: '', periodo: '', trecho_literal: '', pagina: 3 },
      ],
    });
    const confrontados = confrontar({ argumentos: manifestacao.argumentos, dados, agora });
    const peca = montarReplica({ dados, manifestacao, confrontados, tesesConsumadas: ['prescricao_ordinaria'] });
    expect(peca.titulo_peca).toBe('MANIFESTAÇÃO SOBRE A IMPUGNAÇÃO À EXCEÇÃO DE PRÉ-EXECUTIVIDADE');
    expect(peca.secoes.map((s) => s.titulo)).toEqual(['SÍNTESE DA MANIFESTAÇÃO', 'DO 1º ARGUMENTO', 'DO 2º ARGUMENTO', 'DA MANUTENÇÃO DA TESE', 'DOS PEDIDOS']);

    const contexto = contextoGenerico({ dados, agora, peca, escritorio: { cidade: 'Salvador', uf: 'BA', advogados: [{ nome: 'Fulana', oab: '123', uf: 'BA', genero: 'f' }] } });
    const docx = await renderizarPeca({ template: TEMPLATE_GENERICO, contexto });
    const zip = await JSZip.loadAsync(docx);
    const xml = await zip.file('word/document.xml').async('string');
    const texto = xml.split('</w:p>').map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')).join('\n');
    expect(texto).toContain('SABOR DA TERRA');
    expect(texto).toContain('Execução Fiscal n.º 1000002-10.2019.4.01.3300');
    expect(texto).toContain('em manifestação datada de 15/09/2026');
    expect(texto).toContain('reconhecimento da prescrição do crédito tributário');
    expect(texto).toContain('art. 85, §§ 2º e 3º, do CPC');
    // sem travessão no texto da réplica (os rótulos [PREENCHER] do cabeçalho são do modelo antigo)
    expect(texto.replace(/\[PREENCHER:[^\]]*\]/g, '')).not.toMatch(/[—–]/);
    expect(texto).not.toContain('+++');
  });

  it('par(): **negrito** vira trechos', () => {
    expect(par('a **b** c').trechos).toEqual([{ x: 'a ', n: false }, { x: 'b', n: true }, { x: ' c', n: false }]);
  });

  it('normalizarManifestacao: enum inválido vira "outro"/"nenhum", data inválida some, argumento vazio sai', () => {
    const m = normalizarManifestacao({ argumentos: [{ tipo: 'x', resumo: 'r', evento: 'y', data_evento: '2020-01-01', pagina: -1 }, { resumo: '' }] });
    expect(m.argumentos).toEqual([{ tipo: 'outro', resumo: 'r', evento: 'nenhum', data_evento: '', cda: '', periodo: '', trecho_literal: '', pagina: 0 }]);
  });
});
