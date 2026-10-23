import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn() }, from: vi.fn() } }));

import { resumoParaLu } from '../src/lib/peca.js';

const RESPOSTA = {
  status: 'ok',
  pecas: [
    {
      status: 'ok',
      template: 'EPE_prescricao_ordinaria',
      resumo: {
        modelo: 'Exceção de pré-executividade',
        tese: 'Prescrição ordinária',
        descricao: 'Texto curto.',
        data_referencia: '11/10/2026',
        campos_preencher: 3,
        figuras: 4,
        a_confirmar: 1,
        avisos: ['Aviso 1'],
        aviso_fixo: 'x',
        creditos: [{ qualquer: 'coisa' }],
      },
      arquivo: { nome: 'a.docx', base64: 'AAAA' },
      figuras: [{ numero: 1 }],
    },
    { status: 'indisponivel', tese: 'decadencia', mensagem: 'sem modelo' },
  ],
};

describe('resumoParaLu', () => {
  it('guarda só o que o Lu precisa, sem o arquivo nem o texto dos modelos', () => {
    const r = resumoParaLu(RESPOSTA, new Date(Date.UTC(2026, 9, 23, 17)));
    expect(r.gerada_em).toBe('2026-10-23T17:00:00.000Z');
    expect(r.pecas).toEqual([
      { modelo: 'Exceção de pré-executividade', tese: 'Prescrição ordinária', descricao: 'Texto curto.', data_referencia: '11/10/2026', campos_preencher: 3, figuras: 4, a_confirmar: 1, avisos: ['Aviso 1'] },
    ]);
    expect(JSON.stringify(r)).not.toContain('base64');
    expect(JSON.stringify(r)).not.toContain('aviso_fixo');
  });
  it('sem peça pronta devolve null', () => {
    expect(resumoParaLu({ status: 'ok', pecas: [{ status: 'indisponivel' }] })).toBeNull();
    expect(resumoParaLu({ status: 'bloqueado' })).toBeNull();
    expect(resumoParaLu(null)).toBeNull();
  });
});
