// Tabela-resumo dos casos fictícios: cenário e resposta do sistema lado a lado (HTML colorido + Markdown).
//   node scripts/casos-ficticios/gerar-tabela.mjs [pasta-de-saida]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avaliarCaso } from './montar-dados.mjs';
import { formatarDataBR } from '../../api/_motor-peca.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const casos = JSON.parse(fs.readFileSync(path.join(aqui, 'cenarios.json'), 'utf8'));
const saida = process.argv[2] || path.join(aqui, '..', '..', 'exemplos', 'casos-ficticios');

const NOME = { prescricao_ordinaria: 'Prescrição ordinária', decadencia: 'Decadência', prescricao_intercorrente: 'Prescrição intercorrente' };
const MODELO = {
  EPE_prescricao_ordinaria: 'EPE de prescrição ordinária',
  EPE_decadencia: 'EPE de decadência',
  EPE_prescricao_intercorrente: 'EPE de prescrição intercorrente',
  Revisao_PGFN_prescricao_ordinaria: 'Revisão PGFN de prescrição ordinária',
  Revisao_PGFN_decadencia: 'Revisão de débito fiscal (decadência)',
};
const f = (d) => (d instanceof Date ? formatarDataBR(d) : d || '');
const GRUPO = { P: 'Prescrição ordinária', D: 'Decadência', I: 'Intercorrente', C: 'Duas peças' };

function resposta(c) {
  const { pecas } = avaliarCaso(c);
  if (!pecas.length) return { cor: 'cinza', rotulo: 'Nenhuma peça', porque: c.descricao.replace(/ O parecer deve ser DESFAVORÁVEL e não há peça\.?/, ''), parecer: 'Desfavorável (nenhuma tese)' };
  const partes = [];
  const porques = [];
  for (const p of pecas) {
    if (p.status === 'ok') {
      partes.push(`Gera: ${MODELO[p.template]}`);
      if (p.tese === 'prescricao_ordinaria') {
        const l = p.creditos.map((x) => `${x.periodo}: ${f(x.termoInicial)} a ${f(x.consumacao)}`);
        const fora = p.omitidos.map((x) => `${x.periodo} fica de fora (consuma em ${f(x.consumacao)})`);
        porques.push(`Prescritos (termo a consumação): ${l.join('; ')}${fora.length ? `. ${fora.join('; ')}` : ''}.`);
      } else if (p.tese === 'decadencia') {
        const r = (x) => (x.regra === 'art_150_par_4' ? '150 §4º' : '173 I');
        const l = [...p.creditos, ...p.omitidos].map((x) => `${x.periodo}: art. ${r(x)}, termo ${f(x.termoFinal)}, notificação ${f(x.notificacao)} (${x.decaido ? 'decaído' : 'dentro do prazo'})`);
        porques.push(`${l.join('; ')}. Pedido de ${p.decadenciaParcial ? 'retificação' : 'cancelamento integral'}${p.creditos.some((x) => x.confirmarDolo) ? '; frase com [CONFIRMAR]' : ''}.`);
      } else if (p.intercorrente) {
        const i = p.intercorrente;
        porques.push(`Ciência ${i.dataIntimacao}, fim da suspensão ${i.dataFimSuspensao}, consumação ${i.dataPrazoFinal}${i.ciclosInterrompidos.length ? `; ciclo anterior interrompido (${i.ciclosInterrompidos[0].eventoExtenso})` : ''}${p.avisos.length ? '; avisa que cobre só parte das CDAs' : ''}.`);
      }
    } else {
      partes.push(`Bloqueia (${NOME[p.tese]})`);
      porques.push((p.bloqueios[0] || p.mensagem).replace(/^[^:]+ \/ [^:]+: /, ''));
    }
  }
  const algumOk = pecas.some((p) => p.status === 'ok');
  const cor = pecas.length > 1 ? 'azul' : algumOk ? 'verde' : 'amarelo';
  return { cor, rotulo: partes.join(' + '), porque: porques.join(' | '), parecer: c.parecer_favoravel.map((t) => NOME[t]).join(' e ') };
}

const linhas = casos.map((c) => ({ id: c.id, grupo: GRUPO[c.id[0]], titulo: c.titulo, credor: c.ente + (c.execucao ? ', com execução' : ', sem execução'), ...resposta(c) }));

// ---- Markdown
const md = ['# Os 34 casos fictícios e a resposta esperada do sistema', '', '| Caso | Cenário | Parecer deve ser favorável a | Resposta do sistema | Por quê |', '|---|---|---|---|---|'];
for (const l of linhas) md.push(`| ${l.id} | ${l.titulo} | ${l.parecer} | ${l.rotulo} | ${l.porque.replace(/\|/g, '/')} |`);
fs.writeFileSync(path.join(saida, 'TABELA.md'), md.join('\n') + '\n');
const csv = (s) => `"${String(s).replace(/"/g, '""')}"`;
const linhasCsv = [['Caso', 'Grupo', 'Cenário', 'Credor', 'Parecer deve ser favorável a', 'Resposta do sistema', 'Por quê'].map(csv).join(',')];
for (const l of linhas) linhasCsv.push([l.id, l.grupo, l.titulo, l.credor, l.parecer, l.rotulo, l.porque].map(csv).join(','));
fs.writeFileSync(path.join(saida, 'TABELA.csv'), '\ufeff' + linhasCsv.join('\n') + '\n');

// ---- HTML
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cores = { verde: ['#e6f4ea', '#137333', 'Gera peça'], amarelo: ['#fef7e0', '#b06000', 'Bloqueia'], cinza: ['#eceff1', '#455a64', 'Nenhuma peça'], azul: ['#e8f0fe', '#1a56b8', 'Duas peças'] };
let corpo = '';
let grupoAtual = '';
for (const l of linhas) {
  if (l.grupo !== grupoAtual) {
    grupoAtual = l.grupo;
    corpo += `<tr class="grupo"><td colspan="5">${esc(grupoAtual)}</td></tr>`;
  }
  const [bg, fg, tag] = cores[l.cor];
  corpo += `<tr><td class="id">${l.id}</td><td>${esc(l.titulo)}<div class="peq">${esc(l.credor)}</div></td><td>${esc(l.parecer)}</td>` +
    `<td style="background:${bg};color:${fg}"><b>${tag}</b><br>${esc(l.rotulo)}</td><td class="peq2">${esc(l.porque)}</td></tr>`;
}
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Casos fictícios: resposta esperada</title>
<style>
body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:16px;color:#1f2937;background:#fff}
h1{font-size:20px;margin:0 0 4px} p{margin:2px 0 12px;color:#4b5563;font-size:13px}
table{border-collapse:collapse;width:100%;font-size:13px} th,td{border:1px solid #d1d5db;padding:6px 8px;vertical-align:top;text-align:left}
th{background:#111827;color:#fff;position:sticky;top:0} tr.grupo td{background:#f3f4f6;font-weight:700;font-size:14px}
td.id{font-weight:700;white-space:nowrap} .peq{color:#6b7280;font-size:11px;margin-top:2px} .peq2{font-size:12px}
.leg span{display:inline-block;padding:2px 8px;margin-right:6px;border-radius:4px;font-size:12px}
</style></head><body>
<h1>Os 34 casos fictícios e a resposta esperada do sistema</h1>
<p>Cada caso é um PDF (ex.: <b>P01.pdf</b>). "Hoje" = 12/10/2026. Resultados calculados pelo mesmo motor do sistema.</p>
<p class="leg"><span style="background:#e6f4ea;color:#137333">Gera peça</span><span style="background:#e8f0fe;color:#1a56b8">Duas peças</span><span style="background:#fef7e0;color:#b06000">Bloqueia (análise manual)</span><span style="background:#eceff1;color:#455a64">Nenhuma peça</span></p>
<table><thead><tr><th>Caso</th><th>Cenário</th><th>Parecer deve ser favorável a</th><th>Resposta do sistema</th><th>Por quê</th></tr></thead><tbody>${corpo}</tbody></table>
</body></html>`;
fs.writeFileSync(path.join(saida, 'TABELA.html'), html);
console.log('ok:', linhas.length, 'linhas');
console.log(md.slice(2).join('\n'));
