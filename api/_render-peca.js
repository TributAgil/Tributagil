// api/_render-peca.js
//
// Renderiza um template .docx (templates/pecas/*.docx, com marcadores do
// docx-templates) a partir do contexto de api/_contexto-peca.js e destaca em
// AMARELO os trechos que o advogado precisa preencher: "[PREENCHER: ...]" e
// "[INSERIR FIGURA n – ...]". O texto dos templates é propriedade intelectual
// do escritório: esta função só roda no servidor e os arquivos NUNCA ficam em
// public/ (ver vercel.json: includeFiles só para api/gerar-peca.js).
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

import fs from 'node:fs';
import path from 'node:path';
import { createReport } from 'docx-templates';
import JSZip from 'jszip';

export const MARCADOR_INICIO = /\[(?:PREENCHER:|INSERIR FIGURA|CONFIRMAR)/g;

export function dirTemplates() {
  return path.join(process.cwd(), 'templates', 'pecas');
}

/**
 * Acha os trechos "[PREENCHER: ...]" / "[INSERIR FIGURA ...]" respeitando colchetes
 * aninhados (um marcador de figura pode conter "[PREENCHER: nome do arquivo]").
 * @returns {Array<[number, number]>} intervalos [início, fim) em `texto`
 */
export function acharMarcadores(texto) {
  const faixas = [];
  MARCADOR_INICIO.lastIndex = 0;
  let m;
  while ((m = MARCADOR_INICIO.exec(texto)) !== null) {
    let profundidade = 0;
    let fim = -1;
    for (let i = m.index; i < texto.length; i++) {
      if (texto[i] === '[') profundidade++;
      else if (texto[i] === ']') {
        profundidade--;
        if (profundidade === 0) {
          fim = i + 1;
          break;
        }
      }
    }
    if (fim === -1) fim = texto.length;
    faixas.push([m.index, fim]);
    MARCADOR_INICIO.lastIndex = fim;
  }
  return faixas;
}

// Posição correta do <w:highlight> dentro de <w:rPr> (o schema do Word é sensível à ordem).
const DEPOIS_DO_HIGHLIGHT = /<w:(u|effect|bdr|shd|fitText|vertAlign|rtl|cs|em|lang|eastAsianLayout|specVanish|oMath)[ />]/;

function comDestaque(rPr) {
  const destaque = '<w:highlight w:val="yellow"/>';
  if (!rPr) return `<w:rPr>${destaque}</w:rPr>`;
  if (rPr.includes('w:highlight')) return rPr;
  if (/^<w:rPr\s*\/>$/.test(rPr)) return `<w:rPr>${destaque}</w:rPr>`;
  const m = DEPOIS_DO_HIGHLIGHT.exec(rPr);
  if (m) return rPr.slice(0, m.index) + destaque + rPr.slice(m.index);
  return rPr.replace('</w:rPr>', `${destaque}</w:rPr>`);
}

const escXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const desescXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const TEM_MARCADOR = /\[(?:PREENCHER:|INSERIR FIGURA|CONFIRMAR)/;
// Filhos "simples" de um run: <w:t>, <w:tab/>, <w:br/>. Qualquer outra coisa (desenho, campo...)
// faz o run ser deixado como está — melhor não destacar do que corromper o arquivo.
const FILHO_SIMPLES = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t(?:\s[^>]*)?\/>|<w:(?:tab|br)(?:\s[^>]*)?\/>/g;

/**
 * Divide cada run que contém um marcador em runs separados (antes / marcador
 * destacado / depois), preservando a formatação (rPr) do run original.
 *
 * O docx-templates devolve XML indentado e pode agrupar VÁRIOS <w:t> num só
 * run (ex.: " (Doc. " + "[PREENCHER: ...]" + "),"), por isso o run é lido
 * filho a filho, e não como "um run = um texto".
 */
export function destacarMarcadores(xml) {
  const RUN = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
  return xml.replace(RUN, (run, interior) => {
    if (!TEM_MARCADOR.test(interior)) return run;

    const rPrMatch = /^\s*(<w:rPr(?:\s*\/>|[\s>][\s\S]*?<\/w:rPr>))/.exec(interior);
    const rPr = rPrMatch ? rPrMatch[1] : '';
    const resto = rPrMatch ? interior.slice(rPrMatch[0].length) : interior;

    // o resto do run só pode ter filhos simples (ignorando a indentação entre eles)
    FILHO_SIMPLES.lastIndex = 0;
    const filhos = [];
    let fim = 0;
    let m;
    while ((m = FILHO_SIMPLES.exec(resto)) !== null) {
      if (resto.slice(fim, m.index).trim() !== '') return run;
      filhos.push({ xml: m[0], texto: m[1] !== undefined ? desescXml(m[1]) : null });
      fim = FILHO_SIMPLES.lastIndex;
    }
    if (resto.slice(fim).trim() !== '') return run;

    const runDe = (conteudo, destacado) =>
      conteudo === '' ? '' : `<w:r>${destacado ? comDestaque(rPr) : rPr}${conteudo}</w:r>`;
    const t = (texto) => (texto === '' ? '' : `<w:t xml:space="preserve">${escXml(texto)}</w:t>`);

    let saida = '';
    let atual = ''; // filhos "normais" acumulados no run corrente
    for (const f of filhos) {
      const faixas = f.texto !== null ? acharMarcadores(f.texto) : [];
      if (faixas.length === 0) {
        atual += f.xml;
        continue;
      }
      let cursor = 0;
      for (const [ini, fimMarcador] of faixas) {
        atual += t(f.texto.slice(cursor, ini));
        saida += runDe(atual, false);
        atual = '';
        saida += runDe(t(f.texto.slice(ini, fimMarcador)), true);
        cursor = fimMarcador;
      }
      atual += t(f.texto.slice(cursor));
    }
    return saida + runDe(atual, false);
  });
}

/**
 * Conta, no .docx JÁ RENDERIZADO, quantos trechos o advogado precisa tratar à mão. É a contagem
 * que o resumo mostra: sai do documento final (e não do contexto), então não conta duas vezes um
 * campo usado em dois lugares nem deixa de contar um que o template não usou.
 * @returns {Promise<{ preencher: number, figuras: number, confirmar: number }>}
 */
async function textoDoDocx(docx) {
  const zip = await JSZip.loadAsync(docx);
  let texto = '';
  for (const nome of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d+|footer\d+)\.xml$/.test(nome)) continue;
    const xml = await zip.file(nome).async('string');
    texto += xml
      .split('</w:p>')
      .map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => desescXml(m[1])).join(''))
      .join('\n');
  }
  return texto;
}

/**
 * Lista as figuras que RESTARAM no .docx já renderizado, na ordem do documento, juntando cada número com os
 * metadados de api/_contexto-peca.js (`contexto.figuras_meta`). Sai do documento final, e não do contexto, pelo mesmo
 * motivo de contarMarcadores: só entra o que o template de fato usou. Número sem metadado vira item "desconhecida".
 * @param {Buffer} docx
 * @param {Array<{numero: number}>} [meta]
 */
export async function figurasDoDocx(docx, meta = []) {
  const texto = await textoDoDocx(docx);
  const numeros = [...new Set([...texto.matchAll(/\[INSERIR FIGURA (\d+)/g)].map((m) => Number(m[1])))];
  const porNumero = new Map(meta.map((f) => [f.numero, f]));
  return numeros.map(
    (n) => porNumero.get(n) || { numero: n, chave: 'desconhecida', legenda: `Figura ${n}`, descricao: '', documento_fonte: '', cda: '', periodo: '', evidenciar: [] },
  );
}

export async function contarMarcadores(docx) {
  const texto = await textoDoDocx(docx);
  // marcadores aninhados ("[INSERIR FIGURA … [PREENCHER: x]]") contam como UM
  const faixas = acharMarcadores(texto);
  const tipo = (i) => texto.slice(faixas[i][0], faixas[i][0] + 12);
  return {
    preencher: faixas.filter((_, i) => tipo(i).startsWith('[PREENCHER')).length,
    figuras: faixas.filter((_, i) => tipo(i).startsWith('[INSERIR FIG')).length,
    confirmar: faixas.filter((_, i) => tipo(i).startsWith('[CONFIRMAR')).length,
  };
}

/**
 * @param {object} args
 * @param {string} args.template  nome do template sem extensão (ver TEMPLATES em _motor-peca.js)
 * @param {object} args.contexto  saída de montarContexto()
 * @param {{data: Buffer, extension: string, widthCm: number, heightCm: number}|null} [args.logo]
 * @returns {Promise<Buffer>} o .docx pronto
 */
export async function renderizarPeca({ template, contexto, logo = null }) {
  if (!/^[A-Za-z0-9_]+$/.test(template)) throw new Error('Nome de template inválido.');
  const arquivo = fs.readFileSync(path.join(dirTemplates(), `${template}.docx`));

  const bruto = await createReport({
    template: arquivo,
    data: { ...contexto, tem_logo: Boolean(logo) },
    // Variável ausente no contexto é erro do sistema, não "texto vazio": falha alto.
    rejectNullish: true,
    additionalJsContext: {
      logo: () => ({ width: logo.widthCm, height: logo.heightCm, data: logo.data, extension: logo.extension }),
    },
  });

  const zip = await JSZip.loadAsync(bruto);
  for (const nome of Object.keys(zip.files)) {
    if (/^word\/(document|header\d+|footer\d+)\.xml$/.test(nome)) {
      const xml = await zip.file(nome).async('string');
      zip.file(nome, destacarMarcadores(xml));
    }
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
