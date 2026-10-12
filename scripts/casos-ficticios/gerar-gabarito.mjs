// Gera o GABARITO.md dos casos fictícios com o MESMO motor do sistema (nada de conta à mão).
//   node scripts/casos-ficticios/gerar-gabarito.mjs [pasta-de-saida]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avaliarCaso } from './montar-dados.mjs';
import { formatarDataBR } from '../../api/_motor-peca.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const casos = JSON.parse(fs.readFileSync(path.join(aqui, 'cenarios.json'), 'utf8'));
const saida = process.argv[2] || path.join(aqui, '..', '..', 'exemplos', 'casos-ficticios');
fs.mkdirSync(saida, { recursive: true });

const NOME = { prescricao_ordinaria: 'Prescrição ordinária', decadencia: 'Decadência', prescricao_intercorrente: 'Prescrição intercorrente' };
const MODELO = {
  EPE_prescricao_ordinaria: 'EPE de prescrição ordinária',
  EPE_decadencia: 'EPE de decadência',
  EPE_prescricao_intercorrente: 'EPE de prescrição intercorrente',
  Revisao_PGFN_prescricao_ordinaria: 'Revisão PGFN de prescrição ordinária',
  Revisao_PGFN_decadencia: 'Revisão de débito fiscal (decadência)',
};
const f = (d) => (d instanceof Date ? formatarDataBR(d) : d || '');

function linhasDaPeca(p) {
  const l = [];
  if (p.tese === 'prescricao_ordinaria') {
    for (const c of p.creditos) l.push(`CDA ${c.cda}, período ${c.periodo}: termo inicial ${f(c.termoInicial)}, consumação ${f(c.consumacao)}, **prescrito**`);
    for (const c of p.omitidos) l.push(`CDA ${c.cda}, período ${c.periodo}: termo inicial ${f(c.termoInicial)}, consumação ${f(c.consumacao)}, ainda dentro do prazo (fica de fora)`);
  } else if (p.tese === 'decadencia') {
    const regra = (c) => (c.regra === 'art_150_par_4' ? 'art. 150, § 4º' : 'art. 173, I');
    for (const c of [...p.creditos, ...p.omitidos]) {
      l.push(`CDA ${c.cda}, período ${c.periodo}: ${regra(c)}, marco ${f(c.marcoInicial)}, termo final ${f(c.termoFinal)}, notificação ${f(c.notificacao)}, **${c.decaido ? 'decaído' : 'dentro do prazo'}**${c.confirmarDolo ? ' (frase com [CONFIRMAR])' : ''}${c.doloImputado ? ' (dolo imputado)' : ''}`);
    }
    l.push(p.decadenciaParcial ? 'Pedido de **retificação** da inscrição (decadência parcial)' : 'Pedido de **cancelamento integral** da inscrição');
  } else if (p.intercorrente) {
    const i = p.intercorrente;
    l.push(`Ciência em ${i.dataIntimacao}, fim da suspensão em ${i.dataFimSuspensao}, consumação em ${i.dataPrazoFinal}; objeto: ${i.objetoNaoLocalizado}`);
    if (i.ciclosInterrompidos.length) l.push(`Ciclo anterior interrompido: ciência ${i.ciclosInterrompidos[0].dataIntimacao}, interrompido em ${i.ciclosInterrompidos[0].dataInterrupcao} (${i.ciclosInterrompidos[0].eventoExtenso})`);
    l.push(`CDAs cobertas: ${i.cdasCobertas.join(', ')}`);
  }
  return l;
}

const md = [];
md.push('# Casos fictícios de teste: gabarito', '');
md.push('Tudo é inventado (partes, CPF/CNPJ, números de CDA e de processo, datas). Cada PDF tem a tarja "DOCUMENTO FICTICIO PARA TESTE".');
md.push('Os resultados abaixo vêm do **mesmo motor do sistema** (`api/_motor-peca.js`, `api/_motor-prazos.js`), com "hoje" = **12/10/2026**.');
md.push('Casos sem execução (Revisão) dependem da data em que você gera a peça: depois de 12/10/2026 as datas só avançam.', '');
md.push('## Como usar', '');
md.push('1. Suba **um PDF por análise** (cada caso é um processo). 2. Veja o parecer: ele deve concordar com a coluna "Parecer deve ser".');
md.push('3. Clique em "Gerar peça" e compare o que aparece no modal com o gabarito do caso. Se o parecer discordar do motor, o sistema mostra a **divergência**: é um achado, não um erro do teste.', '');
md.push('## Resumo', '', '| Caso | Situação | Parecer deve ser favorável a | Resultado esperado |', '|---|---|---|---|');
const detalhes = [];
for (const c of casos) {
  const { pecas } = avaliarCaso(c);
  const fav = c.parecer_favoravel.length ? c.parecer_favoravel.map((t) => NOME[t]).join(' e ') : 'nenhuma tese (desfavorável)';
  const res = pecas.length
    ? pecas.map((p) => (p.status === 'ok' ? `**${MODELO[p.template]}**` : `bloqueada (${NOME[p.tese]})`)).join(' + ')
    : 'nenhuma peça';
  md.push(`| ${c.id} | ${c.titulo} | ${fav} | ${res} |`);

  const d = [`### ${c.id}: ${c.titulo}`, '', c.descricao, '', `- Arquivo: \`${c.id}.pdf\``, `- Credor: ${c.ente}${c.execucao ? ` · execução ${c.execucao.numero} ajuizada em ${c.execucao.ajuizamento}` : ' · sem execução ajuizada'}`, `- Parte: ${c.parte.nome}`];
  if (!pecas.length) d.push('- **Resultado:** nenhuma peça. O modal deve dizer *"Os documentos não indicam prescrição, decadência ou prescrição intercorrente consumada."*');
  for (const p of pecas) {
    d.push(`- **${NOME[p.tese]}:** ${p.status === 'ok' ? `gera a **${MODELO[p.template]}**` : '**bloqueada**'}`);
    for (const l of linhasDaPeca(p)) d.push(`  - ${l}`);
    for (const b of p.bloqueios.slice(0, 3)) d.push(`  - motivo: ${b}`);
    for (const a of p.avisos) d.push(`  - aviso: ${a}`);
  }
  detalhes.push(d.join('\n'));
}
md.push('', '## Detalhe de cada caso', '', detalhes.join('\n\n'), '');
fs.writeFileSync(path.join(saida, 'GABARITO.md'), md.join('\n'));
console.log('gabarito:', path.join(saida, 'GABARITO.md'));
