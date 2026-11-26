// src/lib/relatorioCliente.js
//
// "Relatório para o cliente": o parecer traduzido para quem não é advogado. Lógica PURA (sem React nem Supabase, para
// testar em Node): monta o conteúdo a partir do parecer (conclusões), dos marcos de prazo da carteira (quando já
// calculados), dos valores informados pelo escritório e da estimativa de honorários de sucumbência pelo art. 85, § 3º,
// do CPC; e devolve o HTML do relatório com o timbre do escritório (o mesmo HTML serve para a pré-visualização, para
// imprimir/salvar em PDF e para o Word).
//
// O que o sistema não sabe (valor atualizado do débito, quanto dele foi atingido) é o escritório que informa: o
// relatório nunca inventa valor.

export const SALARIO_MINIMO_PADRAO = 1621; // Decreto nº 12.797/2025, vigente desde 01/01/2026

// art. 85, § 3º, do CPC: faixas em salários mínimos sobre o proveito econômico, aplicadas em escada (§ 5º)
export const FAIXAS_ART85 = [
  { inciso: 'I', ateSM: 200, min: 0.1, max: 0.2 },
  { inciso: 'II', ateSM: 2000, min: 0.08, max: 0.1 },
  { inciso: 'III', ateSM: 20000, min: 0.05, max: 0.08 },
  { inciso: 'IV', ateSM: 100000, min: 0.03, max: 0.05 },
  { inciso: 'V', ateSM: Infinity, min: 0.01, max: 0.03 },
];

const centavos = (n) => Math.round(n * 100) / 100;

/**
 * Lê um valor em reais escrito à brasileira ("R$ 847.320,00", "847320", "1.234,5"). Devolve null se não houver número.
 */
export function lerValorBR(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? centavos(v) : null;
  const m = /\d[\d.]*(?:,\d+)?/.exec(String(v ?? ''));
  if (!m) return null;
  let s = m[0];
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? centavos(n) : null;
}

export const formatarBRL = (n) =>
  Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ') : '';

const formatarPct = (x) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/**
 * Honorários de sucumbência contra a Fazenda Pública (art. 85, § 3º, do CPC), em escada (§ 5º): cada parte do proveito
 * econômico entra na sua faixa. @returns {null | { base, salarioMinimo, faixas: Array<{ inciso, valor, min, max,
 * pctMin, pctMax }>, min, max }}
 */
export function honorariosArt85(base, salarioMinimo = SALARIO_MINIMO_PADRAO) {
  if (!(base > 0) || !(salarioMinimo > 0)) return null;
  const faixas = [];
  let anterior = 0;
  for (const f of FAIXAS_ART85) {
    if (base <= anterior) break;
    const teto = f.ateSM * salarioMinimo;
    const valor = centavos(Math.min(base, teto) - anterior);
    faixas.push({ inciso: f.inciso, valor, pctMin: f.min, pctMax: f.max, min: centavos(valor * f.min), max: centavos(valor * f.max) });
    anterior = teto;
  }
  return {
    base,
    salarioMinimo,
    faixas,
    min: centavos(faixas.reduce((s, f) => s + f.min, 0)),
    max: centavos(faixas.reduce((s, f) => s + f.max, 0)),
  };
}

// ---- Linguagem simples ----------------------------------------------------------------------------------------------
export const EXPLICACOES = {
  prescricao: {
    titulo: 'Prescrição: a cobrança chegou tarde',
    texto:
      'Depois que a dívida é formalizada, a Fazenda tem 5 anos para cobrá-la na Justiça (art. 174 do Código Tributário Nacional). Pelos documentos analisados, esse prazo terminou antes de a cobrança ser feita. Quando isso acontece, a dívida deixa de poder ser cobrada.',
  },
  decadencia: {
    titulo: 'Decadência: o Fisco perdeu o prazo para lançar o tributo',
    texto:
      'O Fisco tem 5 anos para formalizar (lançar) um tributo (arts. 150, § 4º, e 173 do Código Tributário Nacional). Pelos documentos analisados, o lançamento foi feito depois desse prazo. Por isso, o valor não pode ser exigido.',
  },
  prescricao_intercorrente: {
    titulo: 'Prescrição intercorrente: o processo ficou parado tempo demais',
    texto:
      'Quando a Fazenda não encontra o devedor ou bens para penhora, o processo fica suspenso por 1 ano e, depois, corre um prazo de 5 anos (art. 40 da Lei nº 6.830/1980). Pelos documentos analisados, esse prazo terminou sem que a Fazenda conseguisse penhorar bens ou citar o devedor. A dívida pode ser extinta.',
  },
};

const TESE_DO_MARCO = { prescricao_ordinaria: 'prescricao', decadencia: 'decadencia', prescricao_intercorrente: 'prescricao_intercorrente' };
const SITUACAO_DO_MARCO = { prescricao_ordinaria: 'prescrita', decadencia: 'decaída', prescricao_intercorrente: 'prescrita (intercorrente)' };

const AUSENTE = new Set(['', '—', '-', 'não identificado', 'nao identificado', 'n/a', 'null', 'undefined']);
const preenchido = (v) => typeof v === 'string' && !AUSENTE.has(v.trim().toLowerCase());
const dataIsoParaBR = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
};
const rotuloCredito = (m) => [m.cda && `CDA nº ${m.cda}`, m.periodo && `período ${m.periodo}`].filter(Boolean).join(', ') || 'Cobrança';
const listaE = (itens) => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`);
const minuscula = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/** Valores iniciais do formulário (o valor da causa do parecer, quando legível, vira o valor total sugerido). */
export function valoresIniciais(resultado, hoje = new Date()) {
  const total = lerValorBR(resultado?.metadata?.valor_causa);
  const ajuizada = preenchido(resultado?.metadata?.processo);
  return {
    total: total != null ? formatarBRL(total) : '',
    atingido: '',
    data_valores: hoje.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    salario_minimo: formatarBRL(SALARIO_MINIMO_PADRAO),
    incluir_honorarios: ajuizada,
    observacoes: '',
  };
}

/**
 * Conteúdo do relatório (sem HTML).
 * @param {{ resultado: object, escritorio?: object|null, marcos?: object[], valores?: object, hoje?: Date }} args
 *   `marcos`: os da carteira deste caso (consumado/acompanhar), quando já calculados
 */
export function montarRelatorio({ resultado, escritorio = null, marcos = [], valores = {}, hoje = new Date() }) {
  const meta = resultado?.metadata || {};
  const conclusoes = Array.isArray(resultado?.conclusoes) ? resultado.conclusoes : [];
  const ajuizada = preenchido(meta.processo);

  // achados: uma explicação por tipo favorável (o parecer pode trazer mais de um item do mesmo tipo)
  const tipos = [...new Set(conclusoes.filter((c) => c?.severidade === 'favoravel' && EXPLICACOES[c?.tipo]).map((c) => c.tipo))];
  const consumados = marcos.filter((m) => m?.tipo === 'consumado');
  const achados = tipos.map((tipo) => ({
    tipo,
    ...EXPLICACOES[tipo],
    creditos: consumados
      .filter((m) => TESE_DO_MARCO[m.tese] === tipo)
      .map((m) => `${rotuloCredito(m)}: ${SITUACAO_DO_MARCO[m.tese]} desde ${dataIsoParaBR(m.data)}`),
  }));
  const atencao = conclusoes.filter((c) => c?.severidade === 'atencao' && preenchido(c?.titulo)).map((c) => c.titulo.trim());
  const acompanhar = marcos
    .filter((m) => m?.tipo === 'acompanhar')
    .map((m) => `${rotuloCredito(m)}: pode ficar ${SITUACAO_DO_MARCO[m.tese] || 'prescrita'} em ${dataIsoParaBR(m.data)}, ${m.condicao || 'desde que nada interrompa o prazo'}.`);

  const nomes = achados.map((a) => minuscula(a.titulo.split(':')[0]));
  const exequente = preenchido(meta.parte_autora) ? meta.parte_autora.trim() : 'a Fazenda Pública';
  const resumo = achados.length
    ? `Analisamos os documentos da cobrança feita por ${exequente}. Encontramos ${achados.length === 1 ? 'um fundamento' : 'fundamentos'} a seu favor: ${listaE(nomes)}. Isso significa que ${achados.length === 1 ? 'esse ponto pode' : 'esses pontos podem'} extinguir a cobrança, total ou parcialmente.`
    : `Analisamos os documentos da cobrança feita por ${exequente}. Nos documentos disponíveis, não encontramos prescrição ou decadência que extinga a dívida. Isso não encerra o caso: abaixo estão os pontos que ainda vamos conferir e os próximos passos.`;

  // valores (informados pelo escritório)
  const total = lerValorBR(valores.total);
  let atingido = lerValorBR(valores.atingido);
  if (atingido != null && total != null && atingido > total) atingido = total;
  const valoresRel = {
    data: String(valores.data_valores || '').trim(),
    total,
    atingido,
    pct: total && atingido != null ? atingido / total : null,
    restante: total != null && atingido != null ? centavos(total - atingido) : null,
  };

  // honorários: só com execução (na via administrativa não há condenação) e com valor atingido informado
  const sm = lerValorBR(valores.salario_minimo) || SALARIO_MINIMO_PADRAO;
  const honorarios = valores.incluir_honorarios && ajuizada && achados.length && atingido > 0 ? honorariosArt85(atingido, sm) : null;

  // o que falta o escritório informar (aparece só no formulário, nunca no relatório do cliente)
  const pendencias = [];
  if (total == null) pendencias.push('Informe o valor total atualizado do débito (extrato da Procuradoria ou da Secretaria da Fazenda).');
  if (achados.length && atingido == null) pendencias.push('Informe quanto desse valor é atingido pela prescrição ou decadência (use "Toda a dívida" se for o total).');
  if (valores.incluir_honorarios && !ajuizada) pendencias.push('Sem execução fiscal ajuizada não há condenação em honorários (a via é administrativa): a estimativa não entra no relatório.');

  const passos = [];
  if (achados.length && ajuizada) {
    passos.push(`Apresentar ao juiz da execução uma petição (exceção de pré-executividade) pedindo o reconhecimento da ${listaE(nomes)} e o encerramento da cobrança. Essa defesa não exige penhora nem depósito.`);
    passos.push('A Fazenda será ouvida e, depois, o juiz decide. Vamos acompanhar o processo e avisar você de cada andamento.');
  } else if (achados.length) {
    passos.push(`Apresentar à Fazenda um pedido administrativo de revisão da dívida, pedindo o seu cancelamento por ${listaE(nomes)}.`);
    passos.push('Se a Fazenda ajuizar a cobrança na Justiça antes de decidir o pedido, a mesma defesa pode ser apresentada ao juiz.');
  } else {
    passos.push('Conferir os documentos que ainda faltam (processo administrativo, extratos e andamentos) para confirmar se há outra defesa possível.');
  }
  if (valoresRel.restante > 0 || !achados.length) passos.push('Para o valor que continua devido, avaliar alternativas como parcelamento ou transação tributária, que podem reduzir multa e juros.');
  if (acompanhar.length) passos.push('Acompanhar as datas indicadas em "Prazos que estamos acompanhando": se nada interromper, outras cobranças podem prescrever.');

  const adv = Array.isArray(escritorio?.advogados) ? escritorio.advogados.filter((a) => a?.nome) : [];
  return {
    titulo: 'Relatório da análise do seu caso',
    data: hoje.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    cliente: preenchido(meta.parte_reu) ? meta.parte_reu.trim() : '',
    exequente: preenchido(meta.parte_autora) ? meta.parte_autora.trim() : '',
    processo: ajuizada ? meta.processo.trim() : '',
    local: preenchido(meta.local) ? meta.local.trim() : '',
    ajuizada,
    resumo,
    achados,
    atencao,
    acompanhar,
    valores: valoresRel,
    honorarios,
    passos,
    pendencias,
    observacoes: String(valores.observacoes || '').trim(),
    escritorio: {
      nome: String(escritorio?.nome || '').trim(),
      endereco: String(escritorio?.endereco || '').trim(),
      cidade: [escritorio?.cidade, escritorio?.uf].filter(Boolean).join('/'),
      email: String(escritorio?.email || '').trim(),
      site: String(escritorio?.site || '').trim(),
      advogados: adv.map((a) => `${a.nome}${a.oab ? ` | OAB${a.uf ? ` ${a.uf}` : ''} ${a.oab}` : ''}`),
    },
    aviso:
      'Este relatório resume, em linguagem simples, a análise técnica feita pelo escritório com base nos documentos disponíveis. O resultado final depende da decisão do juiz ou da Fazenda e pode mudar se surgirem documentos novos (por exemplo, um parcelamento, uma penhora ou uma citação que não constavam). Os valores são estimativas.',
  };
}

// ---- HTML (pré-visualização, impressão/PDF e Word) ------------------------------------------------------------------
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** HTML completo do relatório. `logo`: URL (data: ou https) do logo do escritório, opcional. */
export function relatorioHtml(r, { logo = '' } = {}) {
  const e = r.escritorio;
  const contato = [e.endereco, e.cidade, e.email, e.site].filter(Boolean).map(esc).join(' · ');
  const logoOk = /^(data:image\/(png|jpeg);base64,|https:\/\/)/.test(logo) ? logo : '';
  const v = r.valores;

  const linhasValores = [
    v.total != null && ['Valor total cobrado', formatarBRL(v.total)],
    v.atingido != null && ['Valor atingido pela prescrição ou decadência', `${formatarBRL(v.atingido)}${v.pct != null ? ` (${formatarPct(v.pct)})` : ''}`],
    v.restante != null && ['Valor que continuaria devido', formatarBRL(v.restante)],
  ].filter(Boolean);

  const h = r.honorarios;
  const secHonorarios = h
    ? `<h2>Honorários que a Fazenda pode ser condenada a pagar</h2>
  <p>Se a defesa for aceita, a Fazenda Pública costuma ser condenada a pagar honorários de sucumbência ao advogado, calculados sobre o valor extinto (art. 85, § 3º, do Código de Processo Civil). <strong>Esse valor é pago pela Fazenda, não por você</strong>, e não se confunde com os honorários contratados com o escritório.</p>
  <p>Sobre ${esc(formatarBRL(h.base))}, com o salário mínimo de ${esc(formatarBRL(h.salarioMinimo))}, a tabela legal leva a uma estimativa entre <strong>${esc(formatarBRL(h.min))}</strong> e <strong>${esc(formatarBRL(h.max))}</strong>. O percentual exato é fixado pelo juiz.</p>
  <table>
    <tr><th>Faixa (art. 85, § 3º)</th><th>Parte do valor</th><th>Percentual</th><th>Estimativa</th></tr>
    ${h.faixas
      .map((f) => `<tr><td>Inciso ${f.inciso}</td><td>${esc(formatarBRL(f.valor))}</td><td>${esc(formatarPct(f.pctMin))} a ${esc(formatarPct(f.pctMax))}</td><td>${esc(formatarBRL(f.min))} a ${esc(formatarBRL(f.max))}</td></tr>`)
      .join('\n    ')}
  </table>`
    : '';

  return `<!doctype html>
<html lang="pt-BR" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<title>${esc(r.titulo)}${r.cliente ? ` | ${esc(r.cliente)}` : ''}</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1c1c1c; font-size: 12pt; line-height: 1.55; margin: 0; padding: 24px; background: #fff; }
  .timbre { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #b8962e; padding-bottom: 12px; margin-bottom: 20px; }
  .timbre img { max-height: 64px; max-width: 180px; }
  .timbre .nome { font-size: 15pt; font-weight: bold; letter-spacing: .02em; }
  .timbre .contato { font-size: 9.5pt; color: #555; }
  h1 { font-size: 17pt; margin: 0 0 4px; }
  .sub { color: #555; font-size: 10.5pt; margin: 0 0 18px; }
  h2 { font-size: 13pt; margin: 22px 0 6px; color: #7a5f12; }
  h3 { font-size: 12pt; margin: 14px 0 4px; }
  p { margin: 0 0 8px; }
  ul { margin: 4px 0 8px 20px; padding: 0; }
  li { margin: 0 0 4px; }
  table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: 11pt; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f4efe2; }
  .destaque { background: #faf6ea; border-left: 3px solid #b8962e; padding: 10px 12px; margin: 8px 0 12px; }
  .aviso { margin-top: 26px; font-size: 9.5pt; color: #555; border-top: 1px solid #ddd; padding-top: 10px; }
  .assinatura { margin-top: 28px; }
  table, tr, .destaque { page-break-inside: avoid; }
  h2, h3 { page-break-after: avoid; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="timbre">
    ${logoOk ? `<img src="${esc(logoOk)}" alt="">` : ''}
    <div>
      <div class="nome">${esc(e.nome || 'Escritório')}</div>
      ${contato ? `<div class="contato">${contato}</div>` : ''}
    </div>
  </div>

  <h1>${esc(r.titulo)}</h1>
  <p class="sub">${[r.cliente && `Cliente: ${esc(r.cliente)}`, r.processo && `Processo nº ${esc(r.processo)}`, `Data: ${esc(r.data)}`].filter(Boolean).join(' · ')}</p>

  <h2>Em resumo</h2>
  <div class="destaque"><p>${esc(r.resumo)}</p></div>

  ${r.achados.length ? `<h2>O que encontramos a seu favor</h2>
  ${r.achados
    .map((a) => `<h3>${esc(a.titulo)}</h3>
  <p>${esc(a.texto)}</p>${a.creditos.length ? `\n  <ul>${a.creditos.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}`)
    .join('\n  ')}` : ''}

  ${linhasValores.length ? `<h2>Valores${v.data ? ` (referência: ${esc(v.data)})` : ''}</h2>
  <table>${linhasValores.map(([k, x]) => `<tr><th>${esc(k)}</th><td>${esc(x)}</td></tr>`).join('')}</table>` : ''}

  ${secHonorarios}

  ${r.acompanhar.length ? `<h2>Prazos que estamos acompanhando</h2>
  <ul>${r.acompanhar.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}

  ${r.atencao.length ? `<h2>Pontos que ainda vamos conferir</h2>
  <ul>${r.atencao.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}

  <h2>Próximos passos</h2>
  <ul>${r.passos.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>

  ${r.observacoes ? `<h2>Observações do escritório</h2>\n  <p style="white-space:pre-wrap">${esc(r.observacoes)}</p>` : ''}

  ${e.advogados.length ? `<div class="assinatura">${e.cidade ? `<p>${esc(e.cidade)}, ${esc(r.data)}.</p>` : ''}${e.advogados.map((a) => `<p>${esc(a)}</p>`).join('')}</div>` : ''}

  <p class="aviso">${esc(r.aviso)}</p>
</body>
</html>`;
}

/** Texto puro (para copiar e colar num e-mail ou mensagem). */
export function relatorioTexto(r) {
  const v = r.valores;
  const blocos = [
    [r.escritorio.nome, r.titulo, [r.cliente && `Cliente: ${r.cliente}`, r.processo && `Processo nº ${r.processo}`, `Data: ${r.data}`].filter(Boolean).join(' · ')].filter(Boolean).join('\n'),
    `EM RESUMO\n${r.resumo}`,
    r.achados.length && `O QUE ENCONTRAMOS A SEU FAVOR\n${r.achados.map((a) => [a.titulo, a.texto, ...a.creditos.map((c) => `- ${c}`)].join('\n')).join('\n\n')}`,
    (v.total != null || v.atingido != null) &&
      `VALORES${v.data ? ` (referência: ${v.data})` : ''}\n${[
        v.total != null && `Valor total cobrado: ${formatarBRL(v.total)}`,
        v.atingido != null && `Valor atingido: ${formatarBRL(v.atingido)}${v.pct != null ? ` (${formatarPct(v.pct)})` : ''}`,
        v.restante != null && `Valor que continuaria devido: ${formatarBRL(v.restante)}`,
      ].filter(Boolean).join('\n')}`,
    r.honorarios &&
      `HONORÁRIOS QUE A FAZENDA PODE SER CONDENADA A PAGAR\nEstimativa entre ${formatarBRL(r.honorarios.min)} e ${formatarBRL(r.honorarios.max)} (art. 85, § 3º, do CPC), pagos pela Fazenda, não por você. O percentual exato é fixado pelo juiz.`,
    r.acompanhar.length && `PRAZOS QUE ESTAMOS ACOMPANHANDO\n${r.acompanhar.map((x) => `- ${x}`).join('\n')}`,
    r.atencao.length && `PONTOS QUE AINDA VAMOS CONFERIR\n${r.atencao.map((x) => `- ${x}`).join('\n')}`,
    `PRÓXIMOS PASSOS\n${r.passos.map((x) => `- ${x}`).join('\n')}`,
    r.observacoes && `OBSERVAÇÕES DO ESCRITÓRIO\n${r.observacoes}`,
    r.escritorio.advogados.length && r.escritorio.advogados.join('\n'),
    r.aviso,
  ];
  return blocos.filter(Boolean).join('\n\n');
}
