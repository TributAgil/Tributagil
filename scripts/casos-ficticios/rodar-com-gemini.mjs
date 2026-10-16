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
  const args = process.argv.slice(2);
  const refazer = args.includes('--refazer');
  const filtro = args.filter((x) => !x.startsWith('--')).map((x) => x.toUpperCase());
  const alvo = filtro.length ? casos.filter((c) => filtro.includes(c.id)) : casos;

  // Cache: o que já foi lido com sucesso não é lido de novo (o plano gratuito do Gemini só dá ~20 chamadas por dia).
  // Rode de novo no dia seguinte e ele continua de onde parou. `--refazer` ignora o cache.
  const arqCache = path.join(pasta, 'resultado-gemini.cache.json');
  const cache = !refazer && fs.existsSync(arqCache) ? JSON.parse(fs.readFileSync(arqCache, 'utf8')) : {};

  let cotaEsgotada = false;
  for (const c of alvo) {
    if (cache[c.id]) {
      console.log(`${c.id}  (já lido, usando o resultado guardado)`);
      continue;
    }
    if (cotaEsgotada) continue;
    const pdf = fs.readFileSync(path.join(pasta, `${c.id}.pdf`));
    const ctx = {};
    try {
      const r = await executarCaso(c, (partes) => extrairDados({ apiKey, partes, ctx }), pdf);
      cache[c.id] = { divergencias: r.divergencias, motorOk: r.motorOk, obtido: r.obtido, tokens: ctx.tokens ?? null };
      fs.writeFileSync(arqCache, JSON.stringify(cache, null, 1));
      const ok = r.divergencias.length === 0 && r.motorOk;
      console.log(`${c.id}  ${ok ? 'OK ' : 'DIVERGE'}  leitura: ${r.divergencias.length} divergencia(s)  motor: ${r.motorOk ? 'igual ao gabarito' : `esperado ${JSON.stringify(c.esperado)} obtido ${JSON.stringify(r.obtido)}`}  tokens: ${ctx.tokens ?? '?'}`);
    } catch (err) {
      console.log(`${c.id}  ERRO: ${err.message}`);
      if (err.cotaEsgotada) {
        cotaEsgotada = true; // para de chamar: o resto só gastaria cota à toa
        console.log('Cota diária do Gemini esgotada. Parei aqui; rode de novo mais tarde (continua de onde parou).');
      }
    }
  }

  const feitos = alvo.filter((c) => cache[c.id]);
  const pendentes = alvo.filter((c) => !cache[c.id]);
  const ok = feitos.filter((c) => cache[c.id].divergencias.length === 0 && cache[c.id].motorOk).length;
  const md = [`# Resultado com o Gemini de verdade (${new Date().toISOString().slice(0, 10)})`, '',
    `${feitos.length} de ${alvo.length} casos lidos; ${ok} sem nenhuma divergência.${pendentes.length ? ` Faltam ${pendentes.length}: ${pendentes.map((c) => c.id).join(', ')}.` : ''}`, '',
    '| Caso | Leitura dos fatos | Motor com o que foi lido | Tokens |', '|---|---|---|---|'];
  for (const c of alvo) {
    const l = cache[c.id];
    if (!l) { md.push(`| ${c.id} | não lido ainda | | |`); continue; }
    md.push(`| ${c.id} | ${l.divergencias.length ? `${l.divergencias.length} divergência(s)` : 'tudo certo'} | ${l.motorOk ? 'igual ao gabarito' : `DIFERENTE: esperado ${JSON.stringify(c.esperado)}, obtido ${JSON.stringify(l.obtido)}`} | ${l.tokens ?? ''} |`);
  }
  const com = feitos.filter((c) => cache[c.id].divergencias.length);
  if (com.length) {
    md.push('', '## Divergências de leitura (o que a IA leu diferente do documento)', '');
    for (const c of com) {
      md.push(`### ${c.id}: ${c.titulo}`, '');
      for (const d of cache[c.id].divergencias) md.push(`- **${d.onde}**, ${d.campo}: ${d.tipo}. Esperado \`${d.esperado}\`, a IA leu \`${d.obtido}\`.`);
      md.push('');
    }
  }
  fs.writeFileSync(path.join(pasta, 'RESULTADO-GEMINI.md'), md.join('\n'));
  console.log(`\n${feitos.length}/${alvo.length} lidos, ${ok} sem divergência. Relatório: exemplos/casos-ficticios/RESULTADO-GEMINI.md`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) principal();
