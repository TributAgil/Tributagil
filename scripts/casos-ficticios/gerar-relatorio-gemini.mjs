// Relatório VISUAL (HTML) da rodada com o Gemini de verdade: uma linha por caso, em etapas, com o que a IA leu,
// o que o motor concluiu com isso e os tokens gastos. Lê o cache de rodar-com-gemini.mjs (nada de rede).
//   node scripts/casos-ficticios/gerar-relatorio-gemini.mjs [pasta-de-saida]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const pasta = path.join(aqui, '..', '..', 'exemplos', 'casos-ficticios');
const saida = process.argv[2] || pasta;
const casos = JSON.parse(fs.readFileSync(path.join(aqui, 'cenarios.json'), 'utf8'));
const arqCache = path.join(pasta, 'resultado-gemini.cache.json');
const cache = fs.existsSync(arqCache) ? JSON.parse(fs.readFileSync(arqCache, 'utf8')) : {};

// As etapas: a primeira é a amostra (um de cada tipo); as outras completam os 34.
const ETAPAS = [
  { nome: 'Etapa 1: amostra (um de cada tipo)', ids: ['P01', 'P03', 'D01', 'D05', 'D10', 'I01', 'I04', 'C01'] },
  { nome: 'Etapa 2: prescrição ordinária', ids: ['P02', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09'] },
  { nome: 'Etapa 3: decadência', ids: ['D02', 'D03', 'D04', 'D06', 'D07', 'D08', 'D09', 'D11', 'D12', 'D13', 'D14'] },
  { nome: 'Etapa 4: prescrição intercorrente', ids: ['I02', 'I03', 'I05', 'I06', 'I07', 'I08', 'I09'] },
  { nome: 'Etapa 5: duas peças no mesmo caso', ids: ['C02'] },
];
const NOME = { prescricao_ordinaria: 'Prescrição ordinária', decadencia: 'Decadência', prescricao_intercorrente: 'Prescrição intercorrente' };
const STATUS = { ok: 'gera peça', bloqueada: 'bloqueia', indisponivel: 'indisponível', sem_tese: 'sem tese' };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const resumo = (o) => {
  const e = Object.entries(o || {});
  return e.length ? e.map(([t, s]) => `${NOME[t] || t}: ${STATUS[s] || s}`).join('<br>') : 'nenhuma peça';
};

function situacao(c) {
  const l = cache[c.id];
  if (!l) return { chave: 'pendente', rotulo: 'Ainda não rodou', cor: ['#eceff1', '#455a64'] };
  if (l.divergencias.length === 0 && l.motorOk) return { chave: 'ok', rotulo: 'Passou', cor: ['#e6f4ea', '#137333'] };
  if (!l.motorOk) return { chave: 'motor', rotulo: 'Resultado diferente do esperado', cor: ['#fce8e6', '#b3261e'] };
  return { chave: 'leitura', rotulo: 'Leu com divergência', cor: ['#fef7e0', '#b06000'] };
}

const total = casos.length;
const feitos = casos.filter((c) => cache[c.id]);
const conta = { ok: 0, leitura: 0, motor: 0, pendente: 0 };
for (const c of casos) conta[situacao(c).chave]++;
const tokens = feitos.map((c) => cache[c.id].tokens).filter(Boolean);
const somaTok = tokens.reduce((a, b) => a + b, 0);
const mediaTok = tokens.length ? Math.round(somaTok / tokens.length) : 0;
// custo só da leitura dos documentos (a chamada que este relatório mede); preço de lista do gemini-3.5-flash:
// US$ 1,50 por milhão de tokens de entrada e US$ 9,00 de saída. O total de tokens não separa entrada de saída,
// então mostramos a faixa entre os dois extremos.
const usd = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let corpo = '';
for (const et of ETAPAS) {
  const lista = et.ids.map((id) => casos.find((c) => c.id === id)).filter(Boolean);
  const rodados = lista.filter((c) => cache[c.id]).length;
  corpo += `<tr class="etapa"><td colspan="6">${esc(et.nome)} <span>${rodados} de ${lista.length} rodados</span></td></tr>`;
  for (const c of lista) {
    const l = cache[c.id];
    const s = situacao(c);
    let leitura = '<span class="mudo">não rodou</span>';
    if (l) {
      leitura = l.divergencias.length
        ? l.divergencias.map((d) => `<div><b>${esc(d.onde)}</b>, ${esc(d.campo)}: ${esc(d.tipo)}.${d.esperado || d.obtido ? ` Esperado <code>${esc(d.esperado) || '(vazio)'}</code>, a IA leu <code>${esc(d.obtido) || '(vazio)'}</code>.` : ''}</div>`).join('')
        : 'Tudo certo, nenhum campo divergente.';
    }
    const motor = l ? (l.motorOk ? 'Igual ao esperado' : `<b>Obtido:</b><br>${resumo(l.obtido)}`) : '<span class="mudo">não rodou</span>';
    corpo += `<tr><td class="id">${c.id}</td><td>${esc(c.titulo)}</td>` +
      `<td>${resumo(c.esperado)}</td><td>${leitura}</td><td>${motor}</td>` +
      `<td style="background:${s.cor[0]};color:${s.cor[1]}"><b>${s.rotulo}</b>${l?.tokens ? `<div class="tok">${l.tokens.toLocaleString('pt-BR')} tokens</div>` : ''}</td></tr>`;
  }
}

const hoje = new Date().toLocaleDateString('pt-BR');
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resultado dos casos com o Gemini</title>
<style>
body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:16px;color:#1f2937;background:#fff}
h1{font-size:20px;margin:0 0 4px} p{margin:2px 0 10px;color:#4b5563;font-size:13px}
.cartoes{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.cartao{border-radius:8px;padding:8px 14px;min-width:120px} .cartao b{display:block;font-size:22px} .cartao span{font-size:12px}
table{border-collapse:collapse;width:100%;font-size:13px} th,td{border:1px solid #d1d5db;padding:6px 8px;vertical-align:top;text-align:left}
th{background:#111827;color:#fff;position:sticky;top:0} tr.etapa td{background:#f3f4f6;font-weight:700;font-size:14px}
tr.etapa span{font-weight:400;color:#6b7280;font-size:12px;margin-left:8px} td.id{font-weight:700;white-space:nowrap}
.mudo{color:#9ca3af} .tok{font-weight:400;font-size:11px;margin-top:2px} code{background:#f3f4f6;padding:0 3px;border-radius:3px}
.nota{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;margin:8px 0;font-size:13px}
</style></head><body>
<h1>Resultado dos casos fictícios com o Gemini de verdade</h1>
<p>Atualizado em ${hoje}. Modelo de produção: <b>gemini-3.5-flash</b>. A IA lê o PDF do caso e devolve os fatos; o motor calcula com o que foi lido; comparamos com o gabarito.</p>
<div class="cartoes">
<div class="cartao" style="background:#e6f4ea;color:#137333"><b>${conta.ok}</b><span>passaram</span></div>
<div class="cartao" style="background:#fef7e0;color:#b06000"><b>${conta.leitura}</b><span>leram com divergência</span></div>
<div class="cartao" style="background:#fce8e6;color:#b3261e"><b>${conta.motor}</b><span>resultado diferente</span></div>
<div class="cartao" style="background:#eceff1;color:#455a64"><b>${conta.pendente}</b><span>ainda não rodaram</span></div>
<div class="cartao" style="background:#e8f0fe;color:#1a56b8"><b>${feitos.length}/${total}</b><span>rodados${mediaTok ? `, média de ${mediaTok.toLocaleString('pt-BR')} tokens` : ''}</span></div>
</div>
${somaTok ? `<div class="nota"><b>Gasto desta leitura:</b> ${somaTok.toLocaleString('pt-BR')} tokens em ${tokens.length} casos (média de ${mediaTok.toLocaleString('pt-BR')} por caso), o que dá <b>de US$ ${usd(somaTok * 1.5e-6)} a US$ ${usd(somaTok * 9e-6)}</b> no preço de lista. São PDFs fictícios de poucas páginas; documentos reais maiores custam mais. Não inclui a análise e o parecer.</div>` : ''}
<div class="nota"><b>Outras verificações já feitas, sem o Gemini:</b> o motor acerta os 34 casos do gabarito; os 19 Word possíveis passam na validação estrutural; os testes automáticos do sistema passam (242).</div>
<table><thead><tr><th>Caso</th><th>Cenário</th><th>Esperado</th><th>O que a IA leu</th><th>O que o motor concluiu</th><th>Situação</th></tr></thead><tbody>${corpo}</tbody></table>
</body></html>`;
const arq = path.join(saida, 'RESULTADO-GEMINI.html');
fs.writeFileSync(arq, html);
console.log(`ok: ${arq} (${feitos.length}/${total} rodados; ${conta.ok} passaram)`);
