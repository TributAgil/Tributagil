import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { avaliarPeca, TEMPLATES } from '../api/_motor-peca.js';
import { montarContexto, contarPreencher, nomeArquivoPeca, dataPorExtenso } from '../api/_contexto-peca.js';
import { renderizarPeca, destacarMarcadores, acharMarcadores } from '../api/_render-peca.js';
import { dadosPrescricao, dadosDecadencia, escritorio, AGORA, parecerFavoravel } from './fixtures-peca.js';

// PNG 1x1 válido (logo de teste)
const LOGO = {
  data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
  extension: '.png',
  widthCm: 3,
  heightCm: 3,
};

// Trechos que só existem nos modelos ORIGINAIS (dados do caso real, nomes fixos): nenhum pode sobrar.
const LEGADO = ['FULANA', 'Fulana de Tal', 'Bianca', 'Ednalva', 'Líbia', 'Neta |', '17 de março', 'xxxxxx', 'xxx.xxx', '10580.608296', '50 1 23 023733-90',
  'CINTHYA', 'Advogado Aprendiz', '[NOME DO', '[NÚMERO]', '[DATA', '[PERÍODO', 'Escolha o que encaixa', 'NOME DO EXECUTADO', 'NOME DO DEVEDOR'];

// Texto visível: só o conteúdo dos <w:t>, um parágrafo por linha. O XML que o docx-templates
// devolve é indentado e pode ter vários <w:t> no mesmo run — nada de "tirar as tags e torcer".
function textoDoXml(xml) {
  const dec = (x) => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return xml
    .split('</w:p>')
    .map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => dec(m[1])).join(''))
    .join('\n');
}

const normaliza = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Cada parágrafo do ORIGINAL que começa com um dos prefixos dados precisa aparecer,
 * inteiro e idêntico (exceto espaços), no documento gerado — é o que garante que a
 * troca de marcadores não encostou no texto jurídico da advogada.
 */
async function expectParagrafosFixos(nomeOriginal, textoGerado, prefixos) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(process.cwd(), 'templates', 'pecas', 'originais', `${nomeOriginal}.docx`)));
  const original = textoDoXml(await zip.file('word/document.xml').async('string')).split('\n').map(normaliza);
  const gerado = normaliza(textoGerado);
  for (const prefixo of prefixos) {
    const achados = original.filter((p) => p.startsWith(prefixo));
    expect(achados.length, `prefixo não achado no original: ${prefixo}`).toBeGreaterThan(0);
    for (const paragrafo of achados) expect(gerado, `parágrafo alterado: ${prefixo}`).toContain(paragrafo);
  }
}

async function gerar({ dados, parecer, template, escritorioUsado = escritorio, logo = null, incluirBlocoDecretoLei = true }) {
  const avaliacao = avaliarPeca({ dados, conclusoesParecer: parecer, agora: AGORA });
  expect(avaliacao.status).toBe('ok');
  expect(avaliacao.template).toBe(template);
  const contexto = montarContexto({ dados, avaliacao, escritorio: escritorioUsado, agora: AGORA, incluirBlocoDecretoLei });
  const buffer = await renderizarPeca({ template, contexto, logo });
  const zip = await JSZip.loadAsync(buffer);
  const xml = async (nome) => zip.file(nome).async('string');
  const documento = await xml('word/document.xml');
  const texto = textoDoXml(documento);
  return { zip, xml, documento, texto, contexto, avaliacao };
}

const linhasDaTabela = (documento) => (documento.match(/<w:tr[ >]/g) || []).length;
const tabelas = (documento) => documento.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];

describe('acharMarcadores / destacarMarcadores', () => {
  it('respeita colchetes aninhados', () => {
    const t = 'antes [INSERIR FIGURA 1 – excerto, fonte: [PREENCHER: arquivo]] depois';
    const [[ini, fim]] = acharMarcadores(t);
    expect(t.slice(ini, fim)).toBe('[INSERIR FIGURA 1 – excerto, fonte: [PREENCHER: arquivo]]');
  });

  it('divide o run em 3, destaca só o marcador e preserva a formatação', () => {
    const run = '<w:r><w:rPr><w:b/><w:sz w:val="22"/><w:lang w:val="pt-BR"/></w:rPr><w:t xml:space="preserve">Doc. [PREENCHER: nº] fim</w:t></w:r>';
    const saida = destacarMarcadores(run);
    expect(saida.match(/<w:r>/g)).toHaveLength(3);
    // highlight entra ANTES de <w:lang> (ordem do schema) e só no run do marcador
    expect(saida).toContain('<w:sz w:val="22"/><w:highlight w:val="yellow"/><w:lang w:val="pt-BR"/>');
    expect(saida.match(/w:highlight/g)).toHaveLength(1);
    expect(saida).toContain('>Doc. <');
    expect(saida).toContain('> fim<');
  });

  it('formato real do docx-templates: XML indentado e vários <w:t> no mesmo run', () => {
    const run = `<w:r w:rsidR="00C538BE">
        <w:rPr>
          <w:rFonts w:ascii="Quicksand" w:hAnsi="Quicksand"/>
          <w:sz w:val="21"/>
          <w:lang w:eastAsia="pt-BR"/>
        </w:rPr>
        <w:t xml:space="preserve"> (Doc. </w:t>
        <w:t xml:space="preserve">[PREENCHER: nº do Doc. – mandato]</w:t>
        <w:t xml:space="preserve">),</w:t>
      </w:r>`;
    const saida = destacarMarcadores(run);
    const runs = saida.match(/<w:r>[\s\S]*?<\/w:r>/g);
    expect(runs).toHaveLength(3);
    expect(runs[0]).toContain(' (Doc. ');
    expect(runs[0]).not.toContain('highlight');
    expect(runs[1]).toContain('[PREENCHER: nº do Doc. – mandato]');
    // o highlight entra depois de w:sz e ANTES de w:lang (ordem do schema), mesmo com XML indentado
    expect(runs[1]).toMatch(/<w:sz w:val="21"\/>\s*<w:highlight w:val="yellow"\/>\s*<w:lang/);
    expect(runs[2]).toContain('),');
    expect(runs[2]).not.toContain('highlight');
    // a formatação (fonte/tamanho) foi preservada nos 3
    for (const r of runs) expect(r).toContain('w:ascii="Quicksand"');
  });

  it('run com filho não simples (ex.: desenho) é deixado como está', () => {
    const run = '<w:r><w:t>[PREENCHER: x]</w:t><w:drawing><wp:inline/></w:drawing></w:r>';
    expect(destacarMarcadores(run)).toBe(run);
  });

  it('escapa & < > ao reescrever o texto e não toca em run sem marcador', () => {
    const sem = '<w:r><w:t>nada aqui</w:t></w:r>';
    expect(destacarMarcadores(sem)).toBe(sem);
    const com = destacarMarcadores('<w:r><w:t>A &amp; B [PREENCHER: x &lt; y]</w:t></w:r>');
    expect(com).toContain('A &amp; B ');
    expect(com).toContain('[PREENCHER: x &lt; y]');
  });
});

describe('contexto', () => {
  it('nome de arquivo sem acento/pontuação', () => {
    expect(nomeArquivoPeca(TEMPLATES.EPE_PRESCRICAO, 'José d’Ávila & Filhos', AGORA)).toBe('EPE_Prescricao_Jose_d_Avila_Filhos_2026-10-11.docx');
    expect(nomeArquivoPeca(TEMPLATES.EPE_DECADENCIA, '', AGORA)).toBe('EPE_Decadencia_executado_2026-10-11.docx');
    expect(nomeArquivoPeca(TEMPLATES.REVISAO_PGFN_PRESCRICAO, 'Maria', AGORA)).toBe('Revisao_PGFN_Prescricao_Maria_2026-10-11.docx');
  });

  it('data por extenso e fecho com a cidade do cadastro', () => {
    expect(dataPorExtenso(AGORA)).toBe('11 de outubro de 2026');
    const dados = dadosPrescricao();
    const av = avaliarPeca({ dados, conclusoesParecer: parecerFavoravel('prescricao'), agora: AGORA });
    expect(montarContexto({ dados, avaliacao: av, escritorio, agora: AGORA }).fecho_local_data).toBe('Brumado/BA, 11 de outubro de 2026.');
  });

  it('sem cadastro de escritório: tudo vira [PREENCHER], nunca valor presumido', () => {
    const dados = dadosPrescricao({ executado: { nome: '', documento: '', nacionalidade: '', estado_civil: '', profissao: '', endereco: '' } });
    const av = avaliarPeca({ dados, conclusoesParecer: parecerFavoravel('prescricao'), agora: AGORA });
    const ctx = montarContexto({ dados, avaliacao: av, escritorio: {}, agora: AGORA });
    expect(ctx.advogados).toEqual([{ nome: '[PREENCHER: nome do(a) advogado(a)]', oab: '[PREENCHER: OAB/UF]' }]);
    expect(ctx.fecho_local_data).toMatch(/\[PREENCHER: cidade do escritório\]/);
    expect(ctx.executado_qualificacao).toMatch(/\[PREENCHER: nacionalidade\].*\[PREENCHER: estado civil\].*\[PREENCHER: profissão\]/);
    expect(contarPreencher(ctx)).toBeGreaterThan(8);
  });

  it('CNPJ é reconhecido pelos 14 dígitos', () => {
    const dados = dadosPrescricao({ executado: { nome: 'Empresa X', documento: '12.345.678/0001-90', nacionalidade: '', estado_civil: '', profissao: '', endereco: '' } });
    const av = avaliarPeca({ dados, conclusoesParecer: parecerFavoravel('prescricao'), agora: AGORA });
    expect(montarContexto({ dados, avaliacao: av, escritorio, agora: AGORA }).executado_qualificacao).toMatch(/inscrito\(a\) no CNPJ sob nº 12\.345\.678\/0001-90/);
  });
});

describe('renderização — EPE prescrição ordinária', () => {
  it('preenche com os dados, sem marcador de template nem dado do caso original', async () => {
    const r = await gerar({ dados: dadosPrescricao(), parecer: parecerFavoravel('prescricao'), template: TEMPLATES.EPE_PRESCRICAO });
    expect(r.texto).not.toContain('+++');
    for (const legado of LEGADO) expect(r.texto, `sobrou: ${legado}`).not.toContain(legado);
    expect(r.texto).toContain('AO JUÍZO DA 3ª VARA FEDERAL DE EXECUÇÃO FISCAL DE SALVADOR/BA.');
    expect(r.texto).toContain('Maria Exemplo da Silva, brasileira, solteira');
    expect(r.texto).toContain('Advogada Um | OAB BA 11.111');
    expect(r.texto).toContain('Advogada Dois | OAB BA 22.222');
    // "Documento assinado digitalmente" vem DEPOIS da lista de advogados
    expect(r.texto.indexOf('Documento assinado digitalmente')).toBeGreaterThan(r.texto.indexOf('Advogada Dois'));
  });

  it('tem o número certo de linhas: quadro (3), termos (2), consumação (2) e linha do tempo', async () => {
    const r = await gerar({ dados: dadosPrescricao(), parecer: parecerFavoravel('prescricao'), template: TEMPLATES.EPE_PRESCRICAO });
    const t = tabelas(r.documento);
    expect(t).toHaveLength(4);
    const linhas = t.map((x) => (x.match(/<w:tr[ >]/g) || []).length);
    expect(linhas[0]).toBe(1 + 3); // quadro sinóptico: cabeçalho + 3
    expect(linhas[1]).toBe(1 + 2); // período -> termo inicial
    expect(linhas[2]).toBe(1 + 2); // termo inicial -> consumação
    expect(linhas[3]).toBe(1 + r.contexto.linha_do_tempo.length);
    expect(r.contexto.linha_do_tempo.map((m) => m.data)).toEqual([...r.contexto.linha_do_tempo.map((m) => m.data)].sort((a, b) => a.split('/').reverse().join('').localeCompare(b.split('/').reverse().join(''))));
  });

  it('todo [PREENCHER] e todo [INSERIR FIGURA] saem destacados em amarelo', async () => {
    const dados = dadosPrescricao({ executado: { nome: 'Fulano de Tal Teste', documento: '', nacionalidade: '', estado_civil: '', profissao: '', endereco: '' } });
    const r = await gerar({ dados, parecer: parecerFavoravel('prescricao'), template: TEMPLATES.EPE_PRESCRICAO, escritorioUsado: {} });
    const runs = r.documento.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) || [];
    const destacados = runs.filter((x) => x.includes('<w:highlight w:val="yellow"/>'));
    const textoDe = (x) => textoDoXml(`<w:p>${x}</w:p>`);
    expect(destacados.length).toBeGreaterThan(5);
    // nenhum run destacado carrega texto fora de um marcador
    for (const run of destacados) expect(textoDe(run)).toMatch(/^\[(PREENCHER:|INSERIR FIGURA)/);
    // e nenhum marcador ficou sem destaque
    const semDestaque = runs.filter((x) => !x.includes('w:highlight') && /\[(PREENCHER:|INSERIR FIGURA)/.test(textoDe(x)));
    expect(semDestaque).toHaveLength(0);
  });

  it('figuras: um marcador por figura do modelo, numeradas em sequência, com a fonte do arquivo', async () => {
    const r = await gerar({ dados: dadosPrescricao(), parecer: parecerFavoravel('prescricao'), template: TEMPLATES.EPE_PRESCRICAO });
    const figs = [...r.texto.matchAll(/\[INSERIR FIGURA (\d+) – /g)].map((m) => Number(m[1]));
    expect(figs).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.texto).toContain('fonte: recibo_2018.pdf]');
    expect(r.texto).toMatch(/Figura 7 - Excerto/);
  });

  it('duas CDAs: o bloco por CDA se repete e as figuras continuam numeradas sem repetir', async () => {
    const dados = dadosPrescricao();
    const segunda = JSON.parse(JSON.stringify(dados.inscricoes[0]));
    segunda.numero_cda = '98 7 65 432109-87';
    dados.inscricoes.push(segunda);
    const r = await gerar({ dados, parecer: parecerFavoravel('prescricao'), template: TEMPLATES.EPE_PRESCRICAO });
    expect(r.texto.match(/Da prescrição da CDA nº/g)).toHaveLength(2);
    const figs = [...r.texto.matchAll(/\[INSERIR FIGURA (\d+) – /g)].map((m) => Number(m[1]));
    expect(figs).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(r.texto).toContain('CDA nº 12 3 45 678901-23 e 98 7 65 432109-87');
  });

  it('sem protesto: some o parágrafo do protesto e o pedido de cancelamento do protesto', async () => {
    const r = await gerar({ dados: dadosPrescricao({ protesto: false }), parecer: parecerFavoravel('prescricao'), template: TEMPLATES.EPE_PRESCRICAO });
    expect(r.texto).not.toContain('Nem mesmo o protesto');
    expect(r.texto).not.toContain('respectivo protesto');
  });

  it('com protesto: o parágrafo cita a data do protesto e a consumação anterior', async () => {
    const r = await gerar({ dados: dadosPrescricao(), parecer: parecerFavoravel('prescricao'), template: TEMPLATES.EPE_PRESCRICAO });
    expect(r.texto).toContain('Nem mesmo o protesto realizado no dia 03/07/2025');
    expect(r.texto).toContain('desde 30/06/2025');
    expect(r.texto).toContain('respectivo protesto');
  });

  it('bloco Decreto 20.910/32 + Lei 9.873/99 liga e desliga sem mexer no resto', async () => {
    const com = await gerar({ dados: dadosPrescricao(), parecer: parecerFavoravel('prescricao'), template: TEMPLATES.EPE_PRESCRICAO });
    const sem = await gerar({ dados: dadosPrescricao(), parecer: parecerFavoravel('prescricao'), template: TEMPLATES.EPE_PRESCRICAO, incluirBlocoDecretoLei: false });
    expect(com.texto).toContain('Decreto 20.910/32');
    expect(com.texto).toContain('Decreto 9.873/99');
    expect(sem.texto).not.toContain('Decreto 20.910/32');
    expect(sem.texto).not.toContain('9.873/99');
    expect(sem.texto).toContain('Súmula 436');
  });

  it('o texto jurídico fixo permanece idêntico ao do modelo original', async () => {
    const r = await gerar({ dados: dadosPrescricao(), parecer: parecerFavoravel('prescricao'), template: TEMPLATES.EPE_PRESCRICAO });
    await expectParagrafosFixos('EPE_prescricao_ordinaria', r.texto, [
      'A exceção de pré-executividade consubstancia',
      'Súmula 393',
      'Art. 803 do CPC',
      'Destarte, considerando que as alegações',
      'A prescrição tributária, ou prescrição do crédito tributário',
      'Súmula 436',
      'Em decorrência direta desse entendimento',
      'EXECUÇÃO FISCAL. PRESCRIÇÃO. TERMO A QUO',
      'Assim sendo, é incontestável a jurisprudência',
      'Art. 1º (Decreto 20.910/32)',
      'Finalmente, requer a condenação da UNIÃO',
    ]);
  });
});

describe('renderização — EPE decadência', () => {
  it('preenche, corrige o "]" solto e a instrução "Escolha o que encaixa", e usa o artigo da regra aplicada', async () => {
    const r = await gerar({ dados: dadosDecadencia(), parecer: parecerFavoravel('decadencia'), template: TEMPLATES.EPE_DECADENCIA });
    expect(r.texto).not.toContain('+++');
    for (const legado of LEGADO) expect(r.texto, `sobrou: ${legado}`).not.toContain(legado);
    expect(r.texto).not.toContain('no caso em apreço.]');
    expect(r.texto).toContain('o prazo decadencial teve início em 01/01/2006 (art. 173, I, do CTN), consumando-se em 01/01/2011.');
    expect(r.texto).toContain('tendo o contribuinte NÃO REALIZADO o pagamento antecipado');
    expect(r.texto).toContain('em face da executada Maria Exemplo da Silva');
  });

  it('com pagamento antecipado usa o art. 150 §4º; tabela com 4 linhas por período + linha do tempo', async () => {
    const r = await gerar({ dados: dadosDecadencia({ pagamento: 'sim' }), parecer: parecerFavoravel('decadencia'), template: TEMPLATES.EPE_DECADENCIA });
    expect(r.texto).toContain('o prazo decadencial teve início em 30/06/2005 (art. 150, § 4º, do CTN), consumando-se em 30/06/2010.');
    expect(r.texto).toContain('tendo o contribuinte REALIZADO o pagamento antecipado');
    const t = tabelas(r.documento).map((x) => (x.match(/<w:tr[ >]/g) || []).length);
    // quadro sinóptico fixo do modelo (1+3) • marco (1+4) • linha do tempo
    expect(t[0]).toBe(4);
    expect(t[1]).toBe(1 + 4);
    expect(t[2]).toBe(1 + r.contexto.linha_do_tempo.length);
  });

  it('o texto jurídico fixo permanece idêntico ao do modelo original', async () => {
    const r = await gerar({ dados: dadosDecadencia(), parecer: parecerFavoravel('decadencia'), template: TEMPLATES.EPE_DECADENCIA });
    await expectParagrafosFixos('EPE_decadencia', r.texto, [
      'Com o escopo de conferir celeridade',
      'A exceção de pré-executividade consubstancia',
      'A decadência tributária consiste',
      'Art. 156 do CTN',
      'Art. 150, § 4º do CTN',
      'Art. 173, I do CTN',
      'Súmula 555 do STJ',
      'Diante do exposto, não tendo o Fisco',
    ]);
    // o quadro sinóptico fixo (Tese | Fundamento) segue intacto
    expect(r.texto).toContain('Decadência do direito de constituir o crédito tributário');
  });

  it('dois períodos: o bloco por período e a tabela de marcos se repetem', async () => {
    const dados = dadosDecadencia();
    const outro = JSON.parse(JSON.stringify(dados.inscricoes[0].periodos[0]));
    outro.periodo = '2006';
    outro.data_fato_gerador = { data: '30/06/2006', fonte: 'auto_infracao.pdf' };
    dados.inscricoes[0].periodos.push(outro);
    const r = await gerar({ dados, parecer: parecerFavoravel('decadencia'), template: TEMPLATES.EPE_DECADENCIA });
    expect(r.texto.match(/Inicialmente, registra-se que o crédito constante da CDA/g)).toHaveLength(2);
    const t = tabelas(r.documento).map((x) => (x.match(/<w:tr[ >]/g) || []).length);
    expect(t.filter((n) => n === 5)).toHaveLength(2);
  });
});

describe('renderização — Revisão de Débito Fiscal (PGFN)', () => {
  it('linguagem administrativa: sem Executada/Exequente/ao executado/execução proposta', async () => {
    const dados = dadosPrescricao({ ajuizada: false });
    const r = await gerar({ dados, parecer: parecerFavoravel('prescricao'), template: TEMPLATES.REVISAO_PGFN_PRESCRICAO });
    expect(r.texto).not.toContain('+++');
    for (const legado of LEGADO) expect(r.texto, `sobrou: ${legado}`).not.toContain(legado);
    expect(r.texto).toContain('AO ILUSTRÍSSIMO SENHOR PROCURADOR-CHEFE DA FAZENDA NACIONAL DA SEÇÃO DE SALVADOR/BA');
    expect(r.texto).toContain('foi entregue pela Devedora e recepcionada pela Fazenda Nacional');
    expect(r.texto).not.toContain('Executada');
    expect(r.texto).not.toContain('Exequente');
    expect(r.texto).not.toContain('ao executado');
    expect(r.texto).not.toContain('dessa execução');
    expect(r.texto).toContain('ao devedor.');
    // frase truncada do modelo agora está completa
    expect(r.texto).toContain('ao promover a presente cobrança, baseada em crédito que claramente não desfruta');
    expect(r.texto).not.toMatch(/a presente c\s*$/m);
    expect(r.texto).toContain('até o presente (11/10/2026)');
  });

  it('o texto jurídico fixo permanece idêntico ao do modelo original', async () => {
    const r = await gerar({ dados: dadosPrescricao({ ajuizada: false }), parecer: parecerFavoravel('prescricao'), template: TEMPLATES.REVISAO_PGFN_PRESCRICAO });
    await expectParagrafosFixos('Revisao_PGFN_prescricao_ordinaria', r.texto, [
      'Como é cediço, a Constituição Federal',
      'Súmula 473 do STF',
      'A prescrição tributária, ou prescrição do crédito tributário',
      'Súmula 436',
      'Em decorrência direta desse entendimento',
      'Art. 1º (Decreto 20.910/32)',
      'Art. 1º (Decreto 9.873/99)',
    ]);
  });

  it('não tem quadro sinóptico; tabelas de prazo + linha do tempo', async () => {
    const r = await gerar({ dados: dadosPrescricao({ ajuizada: false }), parecer: parecerFavoravel('prescricao'), template: TEMPLATES.REVISAO_PGFN_PRESCRICAO });
    const t = tabelas(r.documento).map((x) => (x.match(/<w:tr[ >]/g) || []).length);
    expect(t).toEqual([3, 3, 1 + r.contexto.linha_do_tempo.length]);
    expect(linhasDaTabela(r.documento)).toBe(t.reduce((a, b) => a + b, 0));
  });
});

describe('timbrado (cabeçalho e rodapé)', () => {
  it('sem logo o cabeçalho fica limpo; com logo a imagem do escritório entra', async () => {
    const sem = await gerar({ dados: dadosPrescricao(), parecer: parecerFavoravel('prescricao'), template: TEMPLATES.EPE_PRESCRICAO });
    for (const h of ['word/header1.xml', 'word/header2.xml']) {
      const xml = await sem.xml(h);
      expect(xml).not.toContain('<w:drawing');
      expect(xml).not.toContain('+++');
    }
    const com = await gerar({ dados: dadosPrescricao(), parecer: parecerFavoravel('prescricao'), template: TEMPLATES.EPE_PRESCRICAO, logo: LOGO });
    const algumComImagem = (await Promise.all(['word/header1.xml', 'word/header2.xml'].map((h) => com.xml(h)))).some((x) => x.includes('<w:drawing'));
    expect(algumComImagem).toBe(true);
    expect(Object.keys(com.zip.files).some((n) => /^word\/media\/.+\.png$/.test(n))).toBe(true);
  });

  it('rodapé usa e-mail, site e endereço do cadastro; sem cadastro fica vazio (sem marcador sobrando)', async () => {
    const com = await gerar({ dados: dadosPrescricao(), parecer: parecerFavoravel('prescricao'), template: TEMPLATES.EPE_PRESCRICAO });
    const rodape = (await com.xml('word/footer1.xml')).replace(/<[^>]+>/g, '');
    expect(rodape).toContain('contato@exemplo.adv.br');
    expect(rodape).toContain('www.exemplo.adv.br');
    expect(rodape).toContain('Rua Exemplo, 100');
    expect(rodape).not.toContain('escritorio.adv.br');

    const sem = await gerar({ dados: dadosPrescricao(), parecer: parecerFavoravel('prescricao'), template: TEMPLATES.EPE_PRESCRICAO, escritorioUsado: {} });
    const rodapeVazio = (await sem.xml('word/footer1.xml')).replace(/<[^>]+>/g, '');
    expect(rodapeVazio).not.toContain('+++');
    expect(rodapeVazio).not.toContain('advogado@escrit');
  });
});

describe('os arquivos de template em si', () => {
  it('não carregam print de documento do caso original nem dados pessoais nas propriedades', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    for (const nome of Object.values(TEMPLATES)) {
      const zip = await JSZip.loadAsync(fs.readFileSync(path.join(process.cwd(), 'templates', 'pecas', `${nome}.docx`)));
      const midias = Object.entries(zip.files).filter(([n]) => /^word\/media\//.test(n));
      for (const [n, arq] of midias) {
        const bytes = (await arq.async('uint8array')).length;
        expect(bytes, `${nome}: ${n} parece um print de documento (${bytes} bytes)`).toBeLessThan(5000);
      }
      expect(Object.keys(zip.files).some((n) => n.startsWith('word/diagrams/'))).toBe(false);
      const core = await zip.file('docProps/core.xml').async('string');
      expect(core).not.toMatch(/Líbia|Libia|Martins/);
    }
  });
});
