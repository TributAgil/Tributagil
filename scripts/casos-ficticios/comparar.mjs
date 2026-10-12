// Compara os FATOS que o Gemini extraiu de um PDF fictício com os fatos que o caso foi desenhado para conter
// (dadosDoCaso). Cada divergência é classificada: omitiu (o documento tem, a IA não achou), inventou (o
// documento não tem, a IA preencheu) ou diferente (valor errado).

const dtv = (x) => (typeof x === 'string' ? x : x?.data || '').trim();
const txt = (x) => String(x ?? '').trim();

function comparaCampo(lista, onde, campo, esperado, obtido) {
  const e = txt(esperado);
  const o = txt(obtido);
  if (e === o) return;
  if (e && !o) lista.push({ onde, campo, tipo: 'omitiu', esperado: e, obtido: '' });
  else if (!e && o) lista.push({ onde, campo, tipo: 'inventou', esperado: '', obtido: o });
  else lista.push({ onde, campo, tipo: 'diferente', esperado: e, obtido: o });
}

export function compararExtracao(esperado, obtido) {
  const d = [];
  comparaCampo(d, 'caso', 'esfera do credor', esperado.ente_credor?.esfera, obtido.ente_credor?.esfera);

  const pe = esperado.processo_execucao || {};
  const po = obtido.processo_execucao || {};
  comparaCampo(d, 'execução', 'número do processo', pe.numero, po.numero);
  comparaCampo(d, 'execução', 'data do ajuizamento', dtv(pe.data_ajuizamento), dtv(po.data_ajuizamento));

  const porNumero = (arr) => new Map((arr || []).map((i) => [txt(i.numero_cda), i]));
  const ie = porNumero(esperado.inscricoes);
  const io = porNumero(obtido.inscricoes);
  for (const n of ie.keys()) if (!io.has(n)) d.push({ onde: `CDA ${n}`, campo: 'inscrição', tipo: 'omitiu', esperado: n, obtido: '' });
  for (const n of io.keys()) if (!ie.has(n)) d.push({ onde: `CDA ${n}`, campo: 'inscrição', tipo: 'inventou', esperado: '', obtido: n });

  for (const [n, e] of ie) {
    const o = io.get(n);
    if (!o) continue;
    const pOb = new Map((o.periodos || []).map((p) => [txt(p.periodo), p]));
    for (const pe2 of e.periodos || []) {
      const onde = `CDA ${n}, período ${pe2.periodo}`;
      const po2 = pOb.get(txt(pe2.periodo));
      if (!po2) {
        d.push({ onde, campo: 'período', tipo: 'omitiu', esperado: pe2.periodo, obtido: '' });
        continue;
      }
      comparaCampo(d, onde, 'modalidade do lançamento', pe2.modalidade_lancamento, po2.modalidade_lancamento);
      for (const [k, rotulo] of [
        ['data_vencimento', 'vencimento'], ['data_entrega_declaracao', 'entrega da declaração'], ['data_fato_gerador', 'fato gerador'],
        ['data_notificacao_lancamento', 'notificação do lançamento'], ['data_decisao_anulatoria', 'decisão anulatória'],
      ]) comparaCampo(d, onde, rotulo, dtv(pe2[k]), dtv(po2[k]));
      for (const [k, rotulo] of [
        ['houve_pagamento_antecipado', 'pagamento antecipado'], ['imputacao_dolo_fraude_simulacao', 'dolo/fraude/simulação'],
        ['lancamento_anterior_anulado_vicio_formal', 'vício formal anterior'],
      ]) comparaCampo(d, onde, rotulo, pe2[k], po2[k]);
    }
    for (const p of o.periodos || []) {
      if (!(e.periodos || []).some((x) => txt(x.periodo) === txt(p.periodo))) d.push({ onde: `CDA ${n}`, campo: `período ${p.periodo}`, tipo: 'inventou', esperado: '', obtido: p.periodo });
    }
    const chave = (ev) => `${txt(ev.tipo).toLowerCase()} em ${txt(ev.data)}`;
    const eve = new Set((e.eventos_interruptivos || []).map(chave));
    const evo = new Set((o.eventos_interruptivos || []).map(chave));
    for (const k of eve) if (!evo.has(k)) d.push({ onde: `CDA ${n}`, campo: 'ocorrência (extrato)', tipo: 'omitiu', esperado: k, obtido: '' });
    for (const k of evo) if (!eve.has(k)) d.push({ onde: `CDA ${n}`, campo: 'ocorrência (extrato)', tipo: 'inventou', esperado: '', obtido: k });
  }

  const chaveEx = (ev) => `${txt(ev.categoria)} em ${txt(ev.data)}${ev.categoria === 'intimacao_nao_localizacao_bens' ? ` (${txt(ev.objeto_nao_localizado)})` : ''}${txt(ev.inscricao) ? ` [CDA ${txt(ev.inscricao)}]` : ''}`;
  const xe = new Set((esperado.eventos_execucao || []).map(chaveEx));
  const xo = new Set((obtido.eventos_execucao || []).map(chaveEx));
  for (const k of xe) if (!xo.has(k)) d.push({ onde: 'execução', campo: 'andamento', tipo: 'omitiu', esperado: k, obtido: '' });
  for (const k of xo) if (!xe.has(k)) d.push({ onde: 'execução', campo: 'andamento', tipo: 'inventou', esperado: '', obtido: k });
  return d;
}
