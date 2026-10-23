// Mede, com o Gemini de VERDADE, a localização das figuras nos casos fictícios. A verdade de campo vem do próprio PDF
// (PyMuPDF acha a posição exata de cada data/número). Para cada figura mede: página certa; caixa que CONTÉM o dado;
// caixa de tamanho razoável (não a página inteira); e se a conferência em código (dado_confere) concorda com a verdade.
//   node scripts/casos-ficticios/medir-localizacao-figuras.mjs [IDs...]     (padrão: P01 P03 D02 I01)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { avaliarCaso } from './montar-dados.mjs';
import { montarContexto } from '../../api/_contexto-peca.js';
import { renderizarPeca, figurasDoDocx } from '../../api/_render-peca.js';
import { localizarFiguras } from '../../api/_localizacao-figuras.js';
import { escritorio } from '../../tests/fixtures-peca.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const pasta = path.join(aqui, '..', '..', 'exemplos', 'casos-ficticios');
const casos = JSON.parse(fs.readFileSync(path.join(aqui, 'cenarios.json'), 'utf8'));
const ids = process.argv.slice(2).map((x) => x.toUpperCase());
const alvo = (ids.length ? ids : ['P01', 'P03', 'D02', 'I01']).map((id) => casos.find((c) => c.id === id)).filter(Boolean);
const parseBR = (s) => { const [d, m, a] = s.split('/').map(Number); return new Date(Date.UTC(a, m - 1, d)); };

const arq = path.join(aqui, '..', '..', '.env.local');
const apiKey = process.env.GEMINI_API_KEY || /^\s*GEMINI_API_KEY\s*=\s*["']?([^"'\r\n#]+?)["']?\s*$/m.exec(fs.readFileSync(arq, 'utf8'))?.[1]?.trim();
if (!apiKey) { console.error('Sem GEMINI_API_KEY.'); process.exit(2); }

const DATA_RE = /\d{2}\/\d{2}\/\d{4}/g;
/** valores a procurar no PDF para uma figura: as datas e os números de processo que ela precisa mostrar */
const valoresDe = (f) => [...new Set(f.evidenciar.flatMap((e) => (String(e.valor).match(DATA_RE) || (/\d{6,}/.test(String(e.valor).replace(/\D/g, '')) ? [String(e.valor)] : []))))];
const area = (c) => Math.max(0, c[2] - c[0]) * Math.max(0, c[3] - c[1]);
const contem = (grande, pequena) => {
  const y0 = Math.max(grande[0], pequena[0]), x0 = Math.max(grande[1], pequena[1]), y1 = Math.min(grande[2], pequena[2]), x1 = Math.min(grande[3], pequena[3]);
  return area(pequena) > 0 && (Math.max(0, y1 - y0) * Math.max(0, x1 - x0)) / area(pequena) >= 0.9;
};

const linhas = [];
let tokens = 0;
for (const c of alvo) {
  const { dados, pecas } = avaliarCaso(c);
  const pdfCaminho = path.join(pasta, `${c.id}.pdf`);
  const pdf = fs.readFileSync(pdfCaminho);
  for (const p of pecas.filter((x) => x.status === 'ok')) {
    const contexto = montarContexto({ dados, avaliacao: p, escritorio, agora: parseBR(c.agora) });
    const figuras = await figurasDoDocx(await renderizarPeca({ template: p.template, contexto }), contexto.figuras_meta);
    // o PDF do caso tem o nome do caso; é o documento de origem de todas as figuras
    const comFonte = figuras.map((f) => ({ ...f, documento_fonte: f.documento_fonte && /\.pdf$/i.test(f.documento_fonte) ? `${c.id}.pdf` : f.documento_fonte }));
    const ctx = {};
    const achados = await localizarFiguras({ apiKey, documentos: [{ nome: `${c.id}.pdf`, storage_path: '', mime_type: 'application/pdf', base64: pdf.toString('base64') }], figuras: comFonte, ctx });
    tokens += ctx.tokens || 0;
    const todosValores = [...new Set(comFonte.flatMap(valoresDe))];
    const py = spawnSync('python', [path.join(aqui, 'verdade_figuras.py')], { input: JSON.stringify({ pdf: pdfCaminho, valores: todosValores }), encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    const verdade = py.status === 0 ? JSON.parse(py.stdout) : (console.error(py.stderr), {});
    for (const f of comFonte) {
      const a = achados.find((x) => x.numero === f.numero);
      const valores = valoresDe(f);
      const ocorrencias = valores.flatMap((v) => verdade[v] || []);
      if (valores.length === 0 || ocorrencias.length === 0) { linhas.push({ caso: c.id, tese: p.tese, numero: f.numero, chave: f.chave, verificavel: false, achou: a.encontrado }); continue; }
      if (process.env.DETALHE) console.log(`   [${c.id} fig ${f.numero}] modelo: pág ${a.pagina} caixa ${JSON.stringify(a.caixa)} | verdade: ${JSON.stringify(ocorrencias.map((o) => `p${o.pagina} ${JSON.stringify(o.caixa)}`))} | trecho: ${a.trecho_visto.slice(0, 60)}`);
      const paginaCerta = a.encontrado && ocorrencias.some((o) => o.pagina === a.pagina);
      const caixaContem = paginaCerta && a.caixa && ocorrencias.filter((o) => o.pagina === a.pagina).some((o) => contem(a.caixa, o.caixa));
      linhas.push({
        caso: c.id, tese: p.tese, numero: f.numero, chave: f.chave, verificavel: true, achou: a.encontrado,
        paginaCerta, caixaContem: Boolean(caixaContem), caixaRazoavel: Boolean(a.caixa) && area(a.caixa) <= 400000, conferiu: a.dado_confere === true,
      });
    }
  }
}

const v = linhas.filter((l) => l.verificavel);
const pct = (n) => (v.length ? `${n}/${v.length} (${Math.round((100 * n) / v.length)}%)` : '-');
for (const l of linhas) {
  console.log(`${l.caso} fig ${l.numero} ${l.chave.padEnd(24)} ${l.verificavel ? `pagina ${l.paginaCerta ? 'OK ' : 'ERRADA'} | caixa contém dado ${l.caixaContem ? 'OK ' : 'NÃO'} | razoável ${l.caixaRazoavel ? 'OK' : 'NÃO'} | conferiu ${l.conferiu ? 'sim' : 'não'}` : `(não verificável em código) achou=${l.achou}`}`);
}
console.log(`\nVerificáveis: ${v.length} de ${linhas.length} figuras. Página certa: ${pct(v.filter((l) => l.paginaCerta).length)}. Caixa contém o dado: ${pct(v.filter((l) => l.caixaContem).length)}. Caixa razoável: ${pct(v.filter((l) => l.caixaRazoavel).length)}. Conferência em código: ${pct(v.filter((l) => l.conferiu).length)}. Tokens: ${tokens}.`);
