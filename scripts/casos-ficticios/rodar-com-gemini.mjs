// Roda os casos fictícios de PONTA A PONTA com o Gemini de verdade (a mesma extração de produção,
// api/_extracao-peca.js), e confere duas coisas por caso:
//   1) os FATOS que a IA leu do PDF batem com os que o caso contém? (datas, modalidade, pagamento, dolo...)
//   2) o MOTOR, com os fatos lidos, chega ao resultado esperado do gabarito?
//
//   GEMINI_API_KEY=sua-chave node scripts/casos-ficticios/rodar-com-gemini.mjs            # todos os 34
//   GEMINI_API_KEY=sua-chave node scripts/casos-ficticios/rodar-com-gemini.mjs P01 D05 I04 # só alguns
//
// No PowerShell:  $env:GEMINI_API_KEY="sua-chave"; node scripts/casos-ficticios/rodar-com-gemini.mjs
// Gasta uma chamada do Gemini por caso (PDFs pequenos: poucos centavos no total). Grava RESULTADO-GEMINI.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extrairDados } from '../../api/_extracao-peca.js';
import { normalizarDadosPeca } from '../../api/_dados-peca.js';
import { avaliarPecas } from '../../api/_motor-peca.js';
import { dadosDoCaso, avaliarCaso } from './montar-dados.mjs';
import { compararExtracao } from './comparar.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const pasta = path.join(aqui, '..', '..', 'exemplos', 'casos-ficticios');

const parseBR = (s) => {
  const [d, m, a] = s.split('/').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

/**
 * @param {object} caso   caso de cenarios.json
 * @param {(partes: object[]) => Promise<object>} extrator  recebe as partes do Gemini e devolve o JSON bruto
 *        (em produção: extrairDados; nos testes: um extrator falso, sem rede)
 * @param {Buffer} pdf
 */
export async function executarCaso(caso, extrator, pdf) {
  const partes = [{ text: `--- Documento anexado: ${caso.id}.pdf ---` }, { inline_data: { mime_type: 'application/pdf', data: pdf.toString('base64') } }];
  const bruto = await extrator(partes);
  const lido = normalizarDadosPeca(bruto);
  const esperadoDados = dadosDoCaso(caso);
  const divergencias = compararExtracao(esperadoDados, lido);

  const conclusoes = (caso.parecer_favoravel || []).map((tipo) => ({ tipo: tipo === 'prescricao_ordinaria' ? 'prescricao' : tipo, severidade: 'favoravel', confianca: 90 }));
  const { pecas } = avaliarPecas({ dados: lido, conclusoesParecer: conclusoes, agora: parseBR(caso.agora) });
  const obtido = Object.fromEntries(pecas.map((p) => [p.tese, p.status]));
  const templates = Object.fromEntries(pecas.filter((p) => p.template).map((p) => [p.tese, p.template]));
  const motorOk =
    JSON.stringify(Object.entries(obtido).sort()) === JSON.stringify(Object.entries(caso.esperado).sort()) &&
    Object.entries(caso.template || {}).every(([t, x]) => templates[t] === x);
  return { divergencias, motorOk, obtido, templates, pecas, referencia: avaliarCaso(caso).pecas };
}

/** Lê GEMINI_API_KEY de .env.local ou .env (na raiz) se não estiver no ambiente. Esses arquivos são ignorados pelo Git. */
function chaveDoArquivo() {
  for (const nome of ['.env.local', '.env']) {
    const arq = path.join(aqui, '..', '..', nome);
    if (!fs.existsSync(arq)) continue;
    const m = /^\s*GEMINI_API_KEY\s*=\s*["']?([^"'\r\n#]+?)["']?\s*$/m.exec(fs.readFileSync(arq, 'utf8'));
    if (m && m[1]) return m[1].trim();
  }
  return '';
}

async function principal() {
  const apiKey = process.env.GEMINI_API_KEY || chaveDoArquivo();
  if (!apiKey) {
    console.error('Defina GEMINI_API_KEY (a mesma da Vercel): no ambiente ($env:GEMINI_API_KEY="...") ou numa linha GEMINI_API_KEY=... do arquivo .env.local na raiz do projeto.');
    process.exit(2);
  }
  const casos = JSON.parse(fs.readFileSync(path.join(aqui, 'cenarios.json'), 'utf8'));
  const filtro = process.argv.slice(2).map((x) => x.toUpperCase());
  const alvo = filtro.length ? casos.filter((c) => filtro.includes(c.id)) : casos;

  const linhas = [];
  for (const c of alvo) {
    const pdf = fs.readFileSync(path.join(pasta, `${c.id}.pdf`));
    const ctx = {};
    let r;
    try {
      r = await executarCaso(c, (partes) => extrairDados({ apiKey, partes, ctx }), pdf);
    } catch (err) {
      console.log(`${c.id}  ERRO: ${err.message}`);
      linhas.push({ c, erro: err.message });
      continue;
    }
    const ok = r.divergencias.length === 0 && r.motorOk;
    console.log(`${c.id}  ${ok ? 'OK ' : 'DIVERGE'}  leitura: ${r.divergencias.length} divergencia(s)  motor: ${r.motorOk ? 'igual ao gabarito' : `esperado ${JSON.stringify(c.esperado)} obtido ${JSON.stringify(r.obtido)}`}  tokens: ${ctx.tokens ?? '?'}`);
    linhas.push({ c, r, tokens: ctx.tokens });
  }

  const ok = linhas.filter((l) => l.r && l.r.divergencias.length === 0 && l.r.motorOk).length;
  const md = [`# Resultado com o Gemini de verdade (${new Date().toISOString().slice(0, 10)})`, '', `${ok} de ${linhas.length} casos sem nenhuma divergência.`, '', '| Caso | Leitura dos fatos | Motor com o que foi lido | Tokens |', '|---|---|---|---|'];
  for (const l of linhas) {
    if (l.erro) { md.push(`| ${l.c.id} | ERRO | ${l.erro} | |`); continue; }
    md.push(`| ${l.c.id} | ${l.r.divergencias.length ? `${l.r.divergencias.length} divergência(s)` : 'tudo certo'} | ${l.r.motorOk ? 'igual ao gabarito' : `DIFERENTE: esperado ${JSON.stringify(l.c.esperado)}, obtido ${JSON.stringify(l.r.obtido)}`} | ${l.tokens ?? ''} |`);
  }
  const com = linhas.filter((l) => l.r && l.r.divergencias.length);
  if (com.length) {
    md.push('', '## Divergências de leitura (o que a IA leu diferente do documento)', '');
    for (const l of com) {
      md.push(`### ${l.c.id}: ${l.c.titulo}`, '');
      for (const d of l.r.divergencias) md.push(`- **${d.onde}**, ${d.campo}: ${d.tipo}. Esperado \`${d.esperado}\`, a IA leu \`${d.obtido}\`.`);
      md.push('');
    }
  }
  fs.writeFileSync(path.join(pasta, 'RESULTADO-GEMINI.md'), md.join('\n'));
  console.log(`\n${ok}/${linhas.length} casos sem divergência. Relatório: exemplos/casos-ficticios/RESULTADO-GEMINI.md`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) principal();
