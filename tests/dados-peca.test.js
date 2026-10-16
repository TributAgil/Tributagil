import { describe, it, expect } from 'vitest';
import { normalizarDadosPeca } from '../api/_dados-peca.js';
import { dimensoesImagem, tamanhoLogoCm } from '../api/_imagem.js';

describe('normalizarDadosPeca', () => {
  it('entrada nula ou lixo vira estrutura completa e vazia (nunca lança)', () => {
    for (const lixo of [null, undefined, 'texto', 42, []]) {
      const d = normalizarDadosPeca(lixo);
      expect(d.inscricoes).toEqual([]);
      expect(d.processo_execucao.numero).toBe('');
      expect(d.processo_execucao.data_ajuizamento).toEqual({ data: '', fonte: '' });
    }
  });

  it('enum inválido vira neutro, nunca um palpite', () => {
    const d = normalizarDadosPeca({
      inscricoes: [{ numero_cda: 'X', periodos: [{ periodo: '2020', modalidade_lancamento: 'inventada', houve_pagamento_antecipado: 'talvez', imputacao_dolo_fraude_simulacao: 7 }] }],
    });
    const p = d.inscricoes[0].periodos[0];
    expect(p.modalidade_lancamento).toBe('');
    expect(p.houve_pagamento_antecipado).toBe('não consta');
    expect(p.imputacao_dolo_fraude_simulacao).toBe('não consta');
  });

  it('período fantasma (sem nome e sem nenhuma data) é descartado; o que tem nome ou data fica', () => {
    const d = normalizarDadosPeca({
      inscricoes: [{
        numero_cda: 'X',
        periodos: [
          { periodo: '', modalidade_lancamento: 'oficio', imputacao_dolo_fraude_simulacao: 'não consta' },
          { periodo: '', data_vencimento: { data: '30/06/2020', fonte: 'cda.pdf' } },
          { periodo: '2020' },
        ],
      }],
    });
    expect(d.inscricoes[0].periodos.map((p) => p.periodo)).toEqual(['', '2020']);
    expect(d.inscricoes[0].periodos[0].data_vencimento.data).toBe('30/06/2020');
    // CDA sem nenhum período (caso de intercorrente): continua existindo, só que sem períodos
    expect(normalizarDadosPeca({ inscricoes: [{ numero_cda: 'Y', periodos: [{ periodo: '' }] }] }).inscricoes[0].periodos).toEqual([]);
  });

  it('data fora de DD/MM/AAAA é descartada junto com a fonte', () => {
    const d = normalizarDadosPeca({ processo_execucao: { numero: '1', data_ajuizamento: { data: '2025-09-20', fonte: 'x.pdf' }, data_citacao: { data: '20/09/2025', fonte: 'y.pdf' } } });
    expect(d.processo_execucao.data_ajuizamento).toEqual({ data: '', fonte: '' });
    expect(d.processo_execucao.data_citacao).toEqual({ data: '20/09/2025', fonte: 'y.pdf' });
  });

  it('evento de tipo desconhecido sai; evento com data inválida FICA (com data vazia) para o motor bloquear', () => {
    const d = normalizarDadosPeca({ inscricoes: [{ eventos_interruptivos: [
      { tipo: 'parcelamento', data: '31/13/2020', fonte: 'a' },
      { tipo: 'outra_coisa', data: '01/01/2020', fonte: 'b' },
      { tipo: 'protesto', data: '03/07/2025', fonte: 'c' },
    ] }] });
    // 31/13/2020 casa com o formato (a validação de calendário é do motor) — o importante é não sumir
    expect(d.inscricoes[0].eventos_interruptivos.map((e) => e.tipo)).toEqual(['parcelamento', 'protesto']);
    const semData = normalizarDadosPeca({ inscricoes: [{ eventos_interruptivos: [{ tipo: 'pagamento', data: 'ontem', fonte: 'x' }] }] });
    expect(semData.inscricoes[0].eventos_interruptivos).toEqual([{ tipo: 'pagamento', data: '', fonte: 'x' }]);
  });
});

describe('dimensoesImagem / tamanhoLogoCm', () => {
  const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

  it('lê PNG', () => {
    expect(dimensoesImagem(PNG_1x1)).toEqual({ extension: '.png', width: 1, height: 1 });
  });

  it('lê JPEG (marcador SOF0)', () => {
    // SOI + APP0 (16 bytes) + SOF0 com 40x20
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14),
      Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x14, 0x00, 0x28, 0x03]), Buffer.alloc(9),
    ]);
    expect(dimensoesImagem(jpeg)).toEqual({ extension: '.jpg', width: 40, height: 20 });
  });

  it('formato desconhecido ou arquivo truncado: null', () => {
    expect(dimensoesImagem(Buffer.from('texto qualquer que não é imagem'))).toBeNull();
    expect(dimensoesImagem(Buffer.alloc(5))).toBeNull();
    expect(dimensoesImagem(null)).toBeNull();
  });

  it('logo: altura-alvo 2 cm; logo muito largo encolhe para 6 cm de largura', () => {
    expect(tamanhoLogoCm({ width: 200, height: 200 })).toEqual({ widthCm: 2, heightCm: 2 });
    expect(tamanhoLogoCm({ width: 1000, height: 100 })).toEqual({ widthCm: 6, heightCm: 0.6 });
  });
});

describe('ESQUEMA_DADOS_PECA — restrições do Gemini', () => {
  // O Gemini recusa o schema INTEIRO (HTTP 400, "enum[n]: cannot be empty") se algum enum tiver "".
  // Esse erro só aparece com o Gemini de verdade — os testes do endpoint o simulam —, então o guarda é aqui.
  it('nenhum enum do schema contém string vazia, e todo enum tem só strings não vazias', async () => {
    const { ESQUEMA_DADOS_PECA } = await import('../api/_schema-dados-peca.js');
    const achados = [];
    (function visitar(no, caminho) {
      if (Array.isArray(no)) return no.forEach((x, i) => visitar(x, `${caminho}[${i}]`));
      if (!no || typeof no !== 'object') return;
      if (Array.isArray(no.enum)) for (const v of no.enum) if (typeof v !== 'string' || v.trim() === '') achados.push(`${caminho}.enum`);
      for (const [k, v] of Object.entries(no)) visitar(v, `${caminho}.${k}`);
    })(ESQUEMA_DADOS_PECA, 'schema');
    expect(achados).toEqual([]);
  });

  it('"não consta" do schema volta a ser vazio no normalizador (esfera e tipo de declaração)', () => {
    const d = normalizarDadosPeca({
      ente_credor: { esfera: 'não consta', nome: '' },
      inscricoes: [{ numero_cda: 'X', periodos: [{ periodo: '2020', tipo_declaracao: 'não consta' }] }],
    });
    expect(d.ente_credor.esfera).toBe('');
    expect(d.inscricoes[0].periodos[0].tipo_declaracao).toBe('');
  });
});
