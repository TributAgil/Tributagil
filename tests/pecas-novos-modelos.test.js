// Renderização dos dois modelos NOVOS (Revisão PGFN — decadência; EPE — prescrição intercorrente),
// o texto jurídico fixo que veio do prompt da advogada e a tratativa de gênero do procurador.
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { avaliarPeca, TEMPLATES } from '../api/_motor-peca.js';
import { montarContexto } from '../api/_contexto-peca.js';
import { renderizarPeca, contarMarcadores } from '../api/_render-peca.js';
import {
  dadosDecadencia, dadosIntercorrente, periodoDecadencia, intimacao, evento, dt, escritorio, AGORA, parecerFavoravel,
} from './fixtures-peca.js';

const LEGADO = ['FULANA', 'Fulana de Tal', 'Bianca', 'Ednalva', 'Líbia', 'Neta |', '17 de março', 'xxxxxx', 'xxx.xxx', '10580.608296',
  'CINTHYA', 'Advogado Aprendiz', '[NOME DO', '[NÚMERO]', '[DATA', '[PERÍODO', 'NOME DO EXECUTADO', 'NOME DO DEVEDOR'];

function textoDoXml(xml) {
  const dec = (x) => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return xml
    .split('</w:p>')
    .map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => dec(m[1])).join(''))
    .join('\n');
}
const normaliza = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const tabelas = (documento) => documento.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
const linhas = (tbl) => (tbl.match(/<w:tr[ >]/g) || []).length;

async function expectParagrafosFixos(nomeOriginal, textoGerado, prefixos) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(process.cwd(), 'templates', 'pecas', 'originais', `${nomeOriginal}.docx`)));
  const original = textoDoXml(await zip.file('word/document.xml').async('string')).split('\n').map(normaliza);
  const gerado = normaliza(textoGerado);
  for (const prefixo of prefixos) {
    const achados = original.filter((p) => p.startsWith(prefixo));
    expect(achados.length, `prefixo não achado no original ${nomeOriginal}: ${prefixo}`).toBeGreaterThan(0);
    for (const paragrafo of achados) expect(gerado, `parágrafo alterado: ${prefixo}`).toContain(paragrafo);
  }
}

async function gerar({ dados, tese, template, escritorioUsado = escritorio }) {
  const parecer = parecerFavoravel(tese === 'decadencia' ? 'decadencia' : 'prescricao_intercorrente');
  const avaliacao = avaliarPeca({ dados, tese, conclusoesParecer: parecer, agora: AGORA });
  expect(avaliacao.status, JSON.stringify(avaliacao.bloqueios)).toBe('ok');
  expect(avaliacao.template).toBe(template);
  const contexto = montarContexto({ dados, avaliacao, escritorio: escritorioUsado, agora: AGORA });
  const buffer = await renderizarPeca({ template, contexto });
  const zip = await JSZip.loadAsync(buffer);
  const documento = await zip.file('word/document.xml').async('string');
  return { buffer, zip, documento, texto: textoDoXml(documento), contexto, avaliacao };
}

const revisao = (opcoes = {}, escritorioUsado) =>
  gerar({ dados: dadosDecadencia({ ajuizada: false, ...opcoes }), tese: 'decadencia', template: TEMPLATES.REVISAO_PGFN_DECADENCIA, escritorioUsado });
const epe = (dados, escritorioUsado) =>
  gerar({ dados: dados || dadosIntercorrente(), tese: 'prescricao_intercorrente', template: TEMPLATES.EPE_INTERCORRENTE, escritorioUsado });

const parcial = () =>
  dadosDecadencia({
    ajuizada: false,
    periodos: [
      periodoDecadencia(),
      periodoDecadencia({
        periodo: '2006',
        data_fato_gerador: dt('30/06/2006', 'auto_infracao.pdf'),
        data_vencimento: dt('31/07/2006', 'auto_infracao.pdf'),
        data_notificacao_lancamento: dt('01/03/2010', 'auto_infracao.pdf'), // dentro do prazo (termo 01/01/2012)
      }),
    ],
  });

describe('Revisão PGFN — decadência: renderização', () => {
  it('preenche sem marcador de template, sem dado dos modelos originais e com a assinatura VISÍVEL', async () => {
    const r = await revisao();
    expect(r.texto).not.toContain('+++');
    for (const legado of LEGADO) expect(r.texto, `sobrou: ${legado}`).not.toContain(legado);
    expect(r.texto).toContain('AO ILUSTRÍSSIMO SENHOR PROCURADOR-CHEFE DA FAZENDA NACIONAL DA SEÇÃO DE SALVADOR/BA');
    expect(r.texto).toContain('Maria Exemplo da Silva, brasileira, solteira');
    expect(r.texto).toContain('Advogada Um | OAB BA 11.111');
    expect(r.texto.indexOf('Documento assinado digitalmente')).toBeGreaterThan(r.texto.indexOf('Advogada Dois'));
    // nos modelos originais os nomes estavam em BRANCO (invisíveis): aqui nenhum run de assinatura pode ficar branco
    const paragrafos = r.documento.split('</w:p>').filter((p) => /Advogada (Um|Dois)/.test(textoDoXml(p)));
    expect(paragrafos).toHaveLength(2);
    for (const p of paragrafos) expect(p).not.toMatch(/w:color w:val="(FFFFFF|ffffff|auto)"/);
  });

  it('art. 173, I sem pagamento antecipado: cita a regra, o marco e a notificação em NEGRITO', async () => {
    const r = await revisao();
    expect(r.texto).toContain('o fato gerador ocorreu em 30/06/2005, não tendo havido pagamento antecipado da exação, razão pela qual o prazo decadencial rege-se pelo art. 173, I, do CTN e pela Súmula 555/STJ, iniciando-se em 01/01/2006');
    expect(r.texto).toContain('o direito de a Fazenda Pública constituir o crédito extinguiu-se em 01/01/2011');
    expect(r.texto).toContain('o lançamento somente foi notificado ao contribuinte em 22/08/2013, conforme auto_infracao.pdf, ou seja, quando já consumada a decadência.');
    expect(r.texto).not.toContain('iniciando-se na data do próprio fato gerador');
    expect(r.documento).toMatch(/<w:b\/>[\s\S]{0,200}22\/08\/2013/);
  });

  it('art. 150, § 4º (com pagamento antecipado): marco no próprio fato gerador, sem texto do art. 173', async () => {
    const r = await revisao({ pagamento: 'sim' });
    expect(r.texto).toContain('tendo o contribuinte realizado o pagamento antecipado da exação, conforme');
    expect(r.texto).toContain('iniciando-se na data do próprio fato gerador');
    expect(r.texto).not.toContain('não tendo havido pagamento antecipado da exação, razão');
    expect(r.texto).toContain('extinguiu-se em 30/06/2010');
    expect(r.texto).toContain('Registre-se que não consta do lançamento qualquer imputação de dolo, fraude ou simulação');
  });

  it('dolo imputado: o texto do art. 173, I traz a menção ao dolo (e nunca duplica o trecho)', async () => {
    const dados = dadosDecadencia({ ajuizada: false, pagamento: 'sim', periodos: [periodoDecadencia({ houve_pagamento_antecipado: 'sim', fonte_pagamento_antecipado: 'extrato.pdf', imputacao_dolo_fraude_simulacao: 'sim' })] });
    const r = await gerar({ dados, tese: 'decadencia', template: TEMPLATES.REVISAO_PGFN_DECADENCIA });
    expect(r.texto).toContain('não tendo havido pagamento antecipado da exação — ou tendo sido imputada ao contribuinte a prática de dolo, fraude ou simulação —, razão pela qual o prazo decadencial rege-se pelo art. 173, I');
    expect(r.texto.match(/rege-se pelo art\. 173, I/g)).toHaveLength(1);
    expect(r.texto).not.toContain('Registre-se que não consta do lançamento');
  });

  it('dolo "não consta" com art. 150, § 4º: a frase sai com [CONFIRMAR] destacado em amarelo', async () => {
    const dados = dadosDecadencia({ ajuizada: false, periodos: [periodoDecadencia({ houve_pagamento_antecipado: 'sim', fonte_pagamento_antecipado: 'extrato.pdf', imputacao_dolo_fraude_simulacao: 'não consta' })] });
    const r = await gerar({ dados, tese: 'decadencia', template: TEMPLATES.REVISAO_PGFN_DECADENCIA });
    expect(r.texto).toContain('[CONFIRMAR: Registre-se que não consta do lançamento qualquer imputação de dolo, fraude ou simulação');
    expect((await contarMarcadores(r.buffer)).confirmar).toBe(1);
    const runs = r.documento.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) || [];
    const destacado = runs.filter((x) => x.includes('<w:highlight w:val="yellow"/>') && textoDoXml(`<w:p>${x}</w:p>`).startsWith('[CONFIRMAR'));
    expect(destacado).toHaveLength(1);
  });

  it('União × Estado: a base legal federal só aparece quando o credor é a União (e o pedido de CADIN junto)', async () => {
    const uniao = await revisao({ ente: 'União' });
    expect(uniao.texto.match(/artigos 20-B e 20-C da Lei nº 10\.522\/2002/g)).toHaveLength(2); // qualificação + cabimento
    expect(uniao.texto).toContain('Portaria PGFN nº 33/2018');
    expect(uniao.texto).toContain('baixa de eventuais registros no CADIN');
    expect(uniao.texto).toContain('artigo 5º, XXXIV, da Constituição Federal, nos artigos 20-B');

    const estado = await revisao({ ente: 'Estado' });
    expect(estado.texto).not.toContain('10.522');
    expect(estado.texto).not.toContain('Portaria PGFN');
    expect(estado.texto).not.toContain('CADIN');
    expect(estado.texto).toContain('artigo 5º, XXXIV, da Constituição Federal, e no artigo 205 do CTN');
    // o resto do cabimento (compartilhado) permanece
    expect(estado.texto).toContain('Súmula 473 do STF');
  });

  it('total × parcial: cancelamento integral × retificação, e só o período decaído entra nos pedidos', async () => {
    const total = await revisao();
    expect(total.contexto.decadencia_total).toBe(true);
    expect(total.texto).toContain('o cancelamento integral da inscrição em dívida ativa nº 70 6 14 000111-22');
    expect(total.texto).not.toContain('a retificação da inscrição');

    const dados = parcial();
    const r = await gerar({ dados, tese: 'decadencia', template: TEMPLATES.REVISAO_PGFN_DECADENCIA });
    expect(r.contexto.decadencia_parcial).toBe(true);
    expect(r.texto).toContain('a retificação da inscrição em dívida ativa nº 70 6 14 000111-22, com a exclusão dos valores relativos aos períodos alcançados pela decadência');
    expect(r.texto).not.toContain('cancelamento integral');
    expect(r.texto).toContain('relativo ao(s) período(s) de apuração 2005,');
    // a tabela de marcos traz os DOIS períodos (o dentro do prazo aparece como "Dentro do prazo")
    const t = tabelas(r.documento).map(linhas);
    expect(t[1]).toBe(1 + 2);
    expect(r.texto).toContain('Dentro do prazo');
    expect(r.texto).toContain('Decadência consumada');
    expect(r.avaliacao.avisos.join(' ')).toMatch(/dentro do prazo decadencial/);
  });

  it('pedidos em sequência: as letras são renumeradas conforme os condicionais ativos', async () => {
    const letras = async (opcoes) => {
      const r = await revisao(opcoes);
      const pedidos = r.texto.slice(r.texto.indexOf('Pelas razões expostas, requer:'));
      return [...pedidos.matchAll(/^([a-e])\) (.{12})/gm)].map((m) => `${m[1]}:${m[2].trim()}`);
    };
    // União + protesto: a b c(protesto) d(CADIN) e(certidão)
    expect((await letras({ ente: 'União', protesto: true })).map((x) => x.slice(0, 1)).join('')).toBe('abcde');
    expect(await letras({ ente: 'União', protesto: true })).toEqual(['a:o reconhecim', 'b:o cancelamen', 'c:o cancelamen', 'd:a baixa de e', 'e:a emissão de']);
    // União sem protesto: a b c(CADIN) d(certidão)
    expect((await letras({ ente: 'União' })).map((x) => x.split(':')[1])).toEqual(['o reconhecim', 'o cancelamen', 'a baixa de e', 'a emissão de']);
    // Estado + protesto: a b c(protesto) d(certidão)
    expect((await letras({ ente: 'Estado', protesto: true })).map((x) => x.split(':')[1])).toEqual(['o reconhecim', 'o cancelamen', 'o cancelamen', 'a emissão de']);
    // Estado sem protesto: a b c(certidão)
    const so = await letras({ ente: 'Estado' });
    expect(so.map((x) => x.slice(0, 1)).join('')).toBe('abc');
    expect(so[2]).toMatch(/emissão de/);
  });

  it('com protesto cita a CDA protestada; sem protesto o pedido some', async () => {
    const com = await revisao({ protesto: true });
    expect(com.texto).toContain('o cancelamento do protesto da CDA nº 70 6 14 000111-22, sem a cobrança de quaisquer emolumentos ao devedor');
    const sem = await revisao({ protesto: false });
    expect(sem.texto).not.toContain('cancelamento do protesto');
  });

  it('CDAs sem protesto numa peça com duas CDAs: só a protestada entra no pedido', async () => {
    const dados = dadosDecadencia({ ajuizada: false, protesto: true });
    const outra = JSON.parse(JSON.stringify(dados.inscricoes[0]));
    outra.numero_cda = '99 9 99 999999-99';
    outra.eventos_interruptivos = [];
    dados.inscricoes.push(outra);
    const r = await gerar({ dados, tese: 'decadencia', template: TEMPLATES.REVISAO_PGFN_DECADENCIA });
    expect(r.texto).toContain('o cancelamento do protesto da CDA nº 70 6 14 000111-22, sem');
    expect(r.texto.match(/DA DECADÊNCIA DO CRÉDITO INSCRITO NA CDA nº/g)).toHaveLength(2);
  });

  it('sem [PREENCHER] sobrando além do que falta no caso: só nº do Doc. do mandato e a figura', async () => {
    const r = await revisao();
    const c = await contarMarcadores(r.buffer);
    expect(c).toEqual({ preencher: 1, figuras: 1, confirmar: 0 });
  });

  it('texto jurídico fixo idêntico ao dos modelos originais (cabimento da Revisão e conceito de decadência da EPE)', async () => {
    const r = await revisao();
    await expectParagrafosFixos('Revisao_PGFN_prescricao_ordinaria', r.texto, [
      'Como é cediço, a Constituição Federal',
      'Ademais, com o direito de petição',
      'Tais institutos constituem',
      'Não bastasse, com o teor da Súmula',
      'Súmula 473 do STF',
    ]);
    await expectParagrafosFixos('EPE_decadencia', r.texto, [
      'A decadência tributária consiste',
      'O instituto encontra previsão expressa',
      'Art. 156 do CTN',
      'Art. 150, § 4º do CTN',
      'Art. 173, I do CTN',
      'Assim, para os tributos sujeitos a lançamento por homologação',
      'Súmula 555 do STJ',
    ]);
  });

  it('textos novos do prompt: Tema 163/STJ, quadro sinóptico de 3 linhas e linha do tempo', async () => {
    const r = await revisao();
    expect(r.texto).toContain('Recurso Especial Repetitivo nº 973.733/SC (Tema 163)');
    expect(r.texto).toContain('injustificada a aplicação cumulativa dos prazos dos arts. 150, § 4º, e 173 do CTN.');
    expect(r.texto).toContain('Destaca-se, ainda, que o prazo decadencial, diferentemente do prescricional, não se sujeita a interrupção ou suspensão');
    const t = tabelas(r.documento).map(linhas);
    expect(t[0]).toBe(1 + 3);
    expect(t).toHaveLength(3);
    expect(t[2]).toBe(1 + r.contexto.linha_do_tempo.length);
  });
});

describe('EPE — prescrição intercorrente: renderização', () => {
  it('preenche, sem marcador de template e sem dado dos modelos originais', async () => {
    const r = await epe();
    expect(r.texto).not.toContain('+++');
    for (const legado of LEGADO) expect(r.texto, `sobrou: ${legado}`).not.toContain(legado);
    expect(r.texto).toContain('AO JUÍZO DA 3ª VARA FEDERAL DE EXECUÇÃO FISCAL DA SEÇÃO JUDICIÁRIA DE SALVADOR/BA.');
    expect(r.texto).toContain('Execução Fiscal n.º 5555555-10.2015.4.01.3300');
    expect(r.texto).toContain('Advogada Um | OAB BA 11.111');
  });

  it('datas do motor: ciência 10/03/2017, fim da suspensão 10/03/2018, consumação 10/03/2023, em negrito e coerentes', async () => {
    const r = await epe();
    expect(r.texto).toContain('execução fiscal ajuizada em 15/05/2015 pela União (Fazenda Nacional) em desfavor de Maria Exemplo da Silva');
    expect(r.texto).toContain('tomou ciência, em 10/03/2017, da não localização do devedor e de bens penhoráveis, conforme certidao_oficial.pdf');
    expect(r.texto).toContain('encerrado em 10/03/2018');
    expect(r.texto).toContain('que se consumou em 10/03/2023');
    const t = tabelas(r.documento).map(linhas);
    expect(t).toEqual([1 + 4, 1 + 4, 1 + r.contexto.linha_do_tempo.length]);
    expect(r.texto).toContain('11/10/2026'); // data da petição na tabela de marcos
  });

  it('NÃO existe pedido de honorários de sucumbência (Tema 1.229/STJ)', async () => {
    const r = await epe();
    expect(r.texto).not.toMatch(/honor[aá]rio/i);
    expect(r.texto).not.toMatch(/sucumb/i);
    expect(r.texto).not.toMatch(/condena/i);
    const pedidos = r.texto.slice(r.texto.indexOf('Isto posto, requer a V.Exa.:'));
    expect([...pedidos.matchAll(/^([a-e])\) /gm)].map((m) => m[1]).join('')).toBe('abcd'); // a) b) c) + liberação (sem protesto)
  });

  it('o objeto da não localização acompanha a extração; "não consta" vira [PREENCHER]', async () => {
    const so = (obj) => dadosIntercorrente({ eventos: [intimacao('10/03/2017', obj)] });
    expect((await epe(so('devedor'))).texto).toContain('da não localização do devedor, conforme');
    expect((await epe(so('bens'))).texto).toContain('da não localização de bens penhoráveis, conforme');
    expect((await epe(so('devedor_e_bens'))).texto).toContain('da não localização do devedor e de bens penhoráveis, conforme');
    const sem = await epe(so('não consta'));
    expect(sem.texto).toContain('da não localização [PREENCHER:');
    expect((await contarMarcadores(sem.buffer)).preencher).toBeGreaterThan(1);
  });

  it('protesto: o pedido de cancelamento entra como d) e a liberação passa a e); sem protesto a liberação é d)', async () => {
    const sem = await epe();
    expect(sem.texto).not.toContain('cancelamento do(s) protesto(s)');
    expect(sem.texto).toContain('d) a liberação de eventuais restrições e constrições existentes nos autos.');

    const com = await epe(dadosIntercorrente({ protesto: true }));
    expect(com.texto).toContain('d) o cancelamento do(s) protesto(s) da(s) CDA(s) nº 44 1 15 000999-00, sem a cobrança de quaisquer emolumentos ao executado;');
    expect(com.texto).toContain('e) a liberação de eventuais restrições e constrições existentes nos autos.');
  });

  it('um ciclo só: sem o parágrafo do episódio anterior; dois ciclos: o parágrafo cita a interrupção por citação', async () => {
    const um = await epe();
    expect(um.texto).not.toContain('Registre-se, por oportuno');

    const dados = dadosIntercorrente({
      eventos: [
        intimacao('10/03/2010'),
        evento('citacao', '15/05/2011'),
        intimacao('10/03/2017'),
      ],
    });
    const dois = await epe(dados);
    expect(dois.avaliacao.intercorrente.ciclosInterrompidos).toHaveLength(1);
    expect(dois.texto).toContain('episódio anterior de não localização, com ciência da Fazenda em 10/03/2010, teve a contagem interrompida em 15/05/2011 por citação do executado');
    expect(dois.texto).toContain('episódio subsequente, iniciado em 10/03/2017, que não sofreu qualquer interrupção');
    // a linha do tempo mostra o ciclo ativo
    expect(dois.texto).toContain('que se consumou em 10/03/2023');
  });

  it('tratamento do procurador: advogado homem, advogada, plural e misto', async () => {
    const com = (advogados) => epe(undefined, { ...escritorio, advogados });
    const f = { nome: 'Ana', oab: '1', uf: 'BA', genero: 'f' };
    const m = { nome: 'Beto', oab: '2', uf: 'BA', genero: 'm' };
    expect((await com([f])).texto).toContain('por intermédio de sua advogada que esta subscreve, constituída mediante instrumento de mandato');
    expect((await com([m])).texto).toContain('por intermédio de seu advogado que esta subscreve, constituído mediante instrumento de mandato');
    expect((await com([f, f])).texto).toContain('por intermédio de suas advogadas que esta subscrevem, constituídas mediante');
    expect((await com([f, m])).texto).toContain('por intermédio de seus advogados que esta subscrevem, constituídos mediante');
  });

  it('o tratamento vale para os 3 templates antigos também', async () => {
    const { dadosPrescricao } = await import('./fixtures-peca.js');
    const homem = { ...escritorio, advogados: [{ nome: 'Beto', oab: '2', uf: 'BA', genero: 'm' }] };
    const casos = [
      [dadosPrescricao(), 'prescricao_ordinaria', TEMPLATES.EPE_PRESCRICAO, 'prescricao'],
      [dadosPrescricao({ ajuizada: false }), 'prescricao_ordinaria', TEMPLATES.REVISAO_PGFN_PRESCRICAO, 'prescricao'],
      [dadosDecadencia(), 'decadencia', TEMPLATES.EPE_DECADENCIA, 'decadencia'],
    ];
    for (const [dados, tese, template, tipo] of casos) {
      const avaliacao = avaliarPeca({ dados, tese, conclusoesParecer: parecerFavoravel(tipo), agora: AGORA });
      const contexto = montarContexto({ dados, avaliacao, escritorio: homem, agora: AGORA });
      const texto = textoDoXml(await JSZip.loadAsync(await renderizarPeca({ template, contexto })).then((z) => z.file('word/document.xml').async('string')));
      expect(texto, template).toContain('por intermédio de seu advogado que esta subscreve, constituído');
      expect(texto, template).not.toContain('sua advogada');
    }
  });

  it('sem gênero no cadastro o tratamento NÃO é presumido: vira [PREENCHER] destacado', async () => {
    const r = await epe(undefined, { ...escritorio, advogados: [{ nome: 'Ana', oab: '1', uf: 'BA' }] });
    expect(r.texto).toContain('[PREENCHER: gênero do(a) advogado(a)');
    expect(r.texto).not.toContain('sua advogada');
  });

  it('texto jurídico fixo idêntico ao do modelo original (cabimento da EPE)', async () => {
    const r = await epe();
    await expectParagrafosFixos('EPE_decadencia', r.texto, [
      'Com o escopo de conferir celeridade',
      'A exceção de pré-executividade consubstancia',
      'Trata-se de saudável construção',
      'Com efeito, de tão pacificada',
      'Súmula 393',
      'Ademais, o artigo 803, do CPC/2015',
      'Art. 803 do CPC',
    ]);
    // o último parágrafo do cabimento termina em "prescrição" (e não "decadência")
    expect(r.texto).toContain('posto que fulminada pela prescrição.');
    expect(r.texto).not.toContain('fulminada pela decadência');
  });

  it('textos novos do prompt: art. 40 da LEF, Súmula 314, REsp 1.340.553/RS e Tema 390/STF', async () => {
    const r = await epe();
    for (const trecho of [
      'Art. 40 - O Juiz suspenderá o curso da execução',
      '§ 4º Se da decisão que ordenar o arquivamento tiver decorrido o prazo prescricional',
      'Súmula 314 - Em execução fiscal, não localizados bens penhoráveis',
      'Recurso Especial Repetitivo nº 1.340.553/RS (Temas 566 a 571)',
      'Tema 390/STF - É constitucional o art. 40 da Lei nº 6.830/1980',
      'o prazo total é de 6 (seis) anos contados da ciência da Fazenda Pública',
      'o reconhecimento da prescrição intercorrente do crédito tributário consubstanciado na(s) CDA(s) nº 44 1 15 000999-00',
      'art. 924, V, do CPC',
    ]) expect(r.texto, trecho).toContain(trecho);
    // quadro sinóptico com 4 linhas de tese
    expect(r.texto).toContain('Matéria de ordem pública, cognoscível de ofício');
  });

  it('só [PREENCHER] do Doc. do mandato e a figura da ciência quando o caso está completo', async () => {
    const r = await epe();
    expect(await contarMarcadores(r.buffer)).toEqual({ preencher: 1, figuras: 1, confirmar: 0 });
  });
});
