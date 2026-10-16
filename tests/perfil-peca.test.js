import { describe, it, expect } from 'vitest';
import {
  normalizarPerfil, mesclarPerfis, perfilDoEscritorio, perfilDoCaso, aplicarClienteAoExecutado, perfilEfetivo,
} from '../api/_perfil-peca.js';

describe('normalizarPerfil', () => {
  it('lixo vira estrutura completa e vazia (nunca lança)', () => {
    for (const lixo of [null, undefined, 'x', 42, [], { cliente: 'x' }, { cliente: [] }]) {
      const p = normalizarPerfil(lixo);
      expect(p.doc_mandato).toBe('');
      expect(p.cliente).toEqual({ nome: '', documento: '', nacionalidade: '', estado_civil: '', profissao: '', endereco: '' });
    }
  });

  it('limpa controle/espaços, corta o tamanho e ignora campo desconhecido e valor que não é texto', () => {
    const p = normalizarPerfil({ doc_mandato: '  03\n\t', cliente: { nome: 'A\u0000B   C', profissao: 'x'.repeat(500), endereco: 7, extra: 'hack' }, outro: 1 });
    expect(p.doc_mandato).toBe('03');
    expect(p.cliente.nome).toBe('A B C');
    expect(p.cliente.profissao).toHaveLength(300);
    expect(p.cliente.endereco).toBe('');
    expect(p.cliente.extra).toBeUndefined();
    expect(p.outro).toBeUndefined();
  });
});

describe('mesclarPerfis — precedência e campo vazio nunca apaga', () => {
  it('a última camada com valor vence; em branco preserva o anterior', () => {
    const m = mesclarPerfis(
      { doc_mandato: '01' },
      { cliente: { nome: 'Maria', profissao: 'servidora', estado_civil: 'solteira' } },
      { doc_mandato: '', cliente: { profissao: 'professora', estado_civil: '   ' } },
    );
    expect(m.doc_mandato).toBe('01');
    expect(m.cliente.nome).toBe('Maria');
    expect(m.cliente.profissao).toBe('professora');
    expect(m.cliente.estado_civil).toBe('solteira');
  });
});

describe('separação escritório × caso', () => {
  it('o perfil do escritório guarda só o Doc. do mandato; o do caso, só o cliente', () => {
    const p = { doc_mandato: '05', cliente: { nome: 'Maria' } };
    expect(perfilDoEscritorio(p)).toEqual({ doc_mandato: '05' });
    expect(Object.keys(perfilDoCaso(p))).toEqual(['cliente']);
    expect(perfilDoCaso(p).cliente.nome).toBe('Maria');
  });
});

describe('aplicarClienteAoExecutado / perfilEfetivo', () => {
  it('valor informado vence o lido pela IA; campo não informado mantém o lido; não muta o original', () => {
    const lido = { nome: 'MARIA SILVA', documento: '000.000.000-00', nacionalidade: '', profissao: 'servidora' };
    const novo = aplicarClienteAoExecutado(lido, { nacionalidade: 'brasileira', profissao: '' });
    expect(novo).toEqual({ nome: 'MARIA SILVA', documento: '000.000.000-00', nacionalidade: 'brasileira', profissao: 'servidora' });
    expect(lido.nacionalidade).toBe('');
  });

  it('o perfil efetivo (o que será gravado) reúne o Doc. e a qualificação que entrou na peça', () => {
    const ex = aplicarClienteAoExecutado({ nome: 'Maria', documento: '1' }, { estado_civil: 'casada' });
    expect(perfilEfetivo({ perfil: { doc_mandato: '07' }, executado: ex })).toEqual({
      doc_mandato: '07',
      cliente: { nome: 'Maria', documento: '1', nacionalidade: '', estado_civil: 'casada', profissao: '', endereco: '' },
    });
  });
});
