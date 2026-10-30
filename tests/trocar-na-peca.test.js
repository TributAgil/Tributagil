import { describe, it, expect } from 'vitest';
import { substituirNosTrechos, ocorrencias } from '../src/lib/edicaoTexto.js';
import { caractereDoObjeto, textoDosTrechos } from '../src/lib/docxEdicao.js';

const T = (texto, f = {}) => ({ texto, negrito: false, italico: false, sublinhado: false, ...f });

describe('trocar em toda a peça (sem IA)', () => {
  it('troca todas as ocorrências do parágrafo e conta', () => {
    const r = substituirNosTrechos([T('A CDA 123 e a CDA 123.')], 'CDA 123', 'CDA 456');
    expect(textoDosTrechos(r.trechos)).toBe('A CDA 456 e a CDA 456.');
    expect(r.trocas).toBe(2);
  });

  it('o texto trocado herda o negrito de onde estava; o resto não muda', () => {
    const r = substituirNosTrechos([T('Executada: '), T('MARIA SILVA', { negrito: true }), T(', brasileira.')], 'MARIA SILVA', 'MARIA SOUZA');
    expect(r.trechos).toEqual([T('Executada: '), T('MARIA SOUZA', { negrito: true }), T(', brasileira.')]);
  });

  it('acha mesmo atravessando uma mudança de formatação', () => {
    const r = substituirNosTrechos([T('nº '), T('12', { negrito: true }), T('34')], '1234', '9999');
    expect(textoDosTrechos(r.trechos)).toBe('nº 9999');
    expect(r.trechos[1]).toMatchObject({ texto: '9999', negrito: true });
  });

  it('maiúsculas: por padrão não diferencia; com a opção, diferencia', () => {
    expect(substituirNosTrechos([T('União e UNIÃO')], 'união', 'Fazenda').trocas).toBe(2);
    expect(substituirNosTrechos([T('União e UNIÃO')], 'União', 'Fazenda', { diferenciarMaiusculas: true }).trocas).toBe(1);
  });

  it('nota de rodapé (etiqueta) nunca some nem casa com a busca', () => {
    const nota = caractereDoObjeto(0);
    const r = substituirNosTrechos([T(`tribunal${nota}. O tribunal`)], 'tribunal', 'juízo');
    expect(textoDosTrechos(r.trechos)).toBe(`juízo${nota}. O juízo`);
  });

  it('troca vazia apaga; busca vazia não faz nada; sem ocorrência devolve igual', () => {
    expect(textoDosTrechos(substituirNosTrechos([T('a [x] b')], ' [x]', '').trechos)).toBe('a b');
    expect(substituirNosTrechos([T('abc')], '', 'z').trocas).toBe(0);
    expect(substituirNosTrechos([T('abc')], 'zz', 'y').trocas).toBe(0);
    expect(ocorrencias('aaaa', 'aa')).toEqual([[0, 2], [2, 4]]);
  });
});
