// Cada caso fictício (scripts/casos-ficticios/cenarios.py -> cenarios.json) foi DESENHADO para provocar um
// resultado do motor. Este teste confere que o motor chega a ele. Se falhar, ou o motor mudou de regra ou o
// caso foi desenhado errado: nos dois casos vale olhar antes de seguir.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { avaliarCaso } from '../scripts/casos-ficticios/montar-dados.mjs';

const casos = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts', 'casos-ficticios', 'cenarios.json'), 'utf8'));

describe('casos fictícios: o motor chega ao resultado para o qual cada caso foi desenhado', () => {
  it('há casos para os três tipos de tese e para as peças combinadas', () => {
    const ids = casos.map((c) => c.id);
    expect(ids.filter((i) => i.startsWith('P')).length).toBeGreaterThanOrEqual(9);
    expect(ids.filter((i) => i.startsWith('D')).length).toBeGreaterThanOrEqual(14);
    expect(ids.filter((i) => i.startsWith('I')).length).toBeGreaterThanOrEqual(9);
    expect(ids).toContain('C01');
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const c of casos) {
    it(`${c.id}: ${c.titulo}`, () => {
      const { pecas } = avaliarCaso(c);
      const obtido = Object.fromEntries(pecas.map((p) => [p.tese, p.status]));
      expect(obtido, JSON.stringify(pecas.map((p) => ({ tese: p.tese, status: p.status, bloqueios: p.bloqueios, mensagem: p.mensagem })))).toEqual(c.esperado);
      for (const [tese, template] of Object.entries(c.template || {})) {
        expect(pecas.find((p) => p.tese === tese)?.template).toBe(template);
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------------
// Camada 2 (sem rede): gera o Word de CADA peça possível de CADA caso e confere o conteúdo.
// ---------------------------------------------------------------------------------------------------
import JSZip from 'jszip';
import { montarContexto } from '../api/_contexto-peca.js';
import { renderizarPeca, contarMarcadores } from '../api/_render-peca.js';
import { escritorio } from './fixtures-peca.js';
import { executarCaso } from '../scripts/casos-ficticios/rodar-com-gemini.mjs';
import { dadosDoCaso } from '../scripts/casos-ficticios/montar-dados.mjs';
import { compararExtracao } from '../scripts/casos-ficticios/comparar.mjs';

const textoDoDocx = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  const dec = (x) => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return xml.split('</w:p>').map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => dec(m[1])).join('')).join('\n');
};
const parseBR = (s) => { const [d, m, a] = s.split('/').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const fmt = (d) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

describe('casos fictícios: o Word de cada peça possível sai completo e coerente com o caso', () => {
  for (const c of casos) {
    const { dados, pecas } = avaliarCaso(c);
    for (const p of pecas.filter((x) => x.status === 'ok')) {
      it(`${c.id} / ${p.tese} -> ${p.template}`, async () => {
        const contexto = montarContexto({ dados, avaliacao: p, escritorio, agora: parseBR(c.agora) });
        const buffer = await renderizarPeca({ template: p.template, contexto });
        const texto = await textoDoDocx(buffer);

        expect(texto).not.toContain('+++');
        expect(texto).not.toMatch(/undefined|\[object|NaN/);
        expect(texto).not.toMatch(/Fulana de Tal|xxxxxx|NOME DO (DEVEDOR|EXECUTADO)/);
        expect(texto).toContain(c.parte.nome);
        // as EPEs de decadência e de intercorrente dizem "já qualificado(a) nos autos" (sem qualificação completa)
        const qualifica = !['EPE_decadencia', 'EPE_prescricao_intercorrente'].includes(p.template);
        if (c.parte.tipo === 'PJ' && qualifica) expect(texto).toContain('pessoa jurídica de direito privado, inscrita no CNPJ');
        for (const cda of c.cdas) {
          const cobre = p.tese === 'prescricao_intercorrente' ? p.intercorrente.cdasCobertas.includes(cda.numero) : [...p.creditos, ...p.omitidos].some((x) => x.cda === cda.numero);
          if (cobre && p.tese !== 'prescricao_ordinaria' || p.creditos.some((x) => x.cda === cda.numero)) expect(texto).toContain(cda.numero);
        }
        if (p.tese === 'prescricao_ordinaria') for (const x of p.creditos) expect(texto).toContain(fmt(x.consumacao));
        if (p.tese === 'decadencia') {
          for (const x of p.creditos) { expect(texto).toContain(fmt(x.termoFinal)); expect(texto).toContain(fmt(x.notificacao)); }
          if (p.template === 'Revisao_PGFN_decadencia') {
            // pedidos próprios da Revisão (a EPE de decadência mantém o pedido do modelo original)
            expect(texto.includes('CADIN')).toBe(c.ente === 'União');
            expect(texto.includes(p.decadenciaParcial ? 'a retificação da inscrição' : 'o cancelamento integral da inscrição')).toBe(true);
          }
        }
        if (p.tese === 'prescricao_intercorrente') {
          const i = p.intercorrente;
          for (const dta of [i.dataIntimacao, i.dataFimSuspensao, i.dataPrazoFinal]) expect(texto).toContain(dta);
          expect(texto.includes('Registre-se, por oportuno')).toBe(i.ciclosInterrompidos.length > 0);
          expect(texto).not.toMatch(/honor[aá]rio/i);
          const protestos = c.cdas.some((x) => x.eventos.some((e) => e.tipo === 'protesto'));
          expect(texto.includes('cancelamento do(s) protesto(s)')).toBe(protestos);
        }
        const m = await contarMarcadores(buffer);
        expect(m.confirmar).toBe(c.id === 'D05' ? 1 : 0);
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------------
// Camada 3 (sem rede): o executor com o Gemini de verdade funciona — testado com extratores falsos.
// ---------------------------------------------------------------------------------------------------
describe('executor dos casos com o Gemini (testado sem rede)', () => {
  const PDF = Buffer.from('%PDF-1.4 teste');

  it('extração PERFEITA: nenhuma divergência de leitura e o motor chega ao gabarito, nos 34 casos', async () => {
    for (const c of casos) {
      const r = await executarCaso(c, async () => dadosDoCaso(c), PDF);
      expect(r.divergencias, c.id).toEqual([]);
      expect(r.motorOk, c.id).toBe(true);
    }
  });

  it('extração com ERROS: o comparador acusa omissão, invenção e valor diferente', () => {
    const c = casos.find((x) => x.id === 'D06');
    const certo = dadosDoCaso(c);
    const errado = JSON.parse(JSON.stringify(certo));
    const p = errado.inscricoes[0].periodos[0];
    p.data_vencimento = { data: '', fonte: '' }; // omitiu
    p.data_notificacao_lancamento = { data: '01/01/2030', fonte: 'x' }; // diferente
    p.imputacao_dolo_fraude_simulacao = 'não'; // diferente
    errado.inscricoes[0].eventos_interruptivos = [{ tipo: 'protesto', data: '05/05/2020', fonte: 'x' }]; // inventou
    const tipos = compararExtracao(certo, errado).map((d) => `${d.tipo}:${d.campo}`);
    expect(tipos).toEqual(expect.arrayContaining(['omitiu:vencimento', 'diferente:notificação do lançamento', 'diferente:dolo/fraude/simulação', 'inventou:ocorrência (extrato)']));
  });

  it('um erro de leitura que muda a conclusão do motor é detectado (D07: a IA "acha" um vencimento que o documento não tem)', async () => {
    const c = casos.find((x) => x.id === 'D07');
    const r = await executarCaso(c, async () => {
      const d = dadosDoCaso(c);
      d.inscricoes[0].periodos[0].data_vencimento = { data: '31/07/2016', fonte: 'IA inventou' };
      return d;
    }, PDF);
    expect(r.divergencias.some((d) => d.tipo === 'inventou' && d.campo === 'vencimento')).toBe(true);
    expect(r.motorOk).toBe(false); // o motor deixaria de bloquear: exatamente o risco que o teste existe para pegar
  });

  it('os 34 PDFs existem e têm conteúdo', () => {
    for (const c of casos) {
      const f = path.join(process.cwd(), 'exemplos', 'casos-ficticios', `${c.id}.pdf`);
      expect(fs.existsSync(f), f).toBe(true);
      expect(fs.statSync(f).size).toBeGreaterThan(1500);
    }
  });
});
