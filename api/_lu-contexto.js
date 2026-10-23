// api/_lu-contexto.js
//
// Monta o contexto que o Lu envia ao modelo: blocos numerados por tipo ([D#] documentos do caso, [P#] parecer,
// [A#] resumo da peça, [L#] legislação). O modelo cita por esses identificadores e api/_lu-citacoes.js confere.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

const MAX_BLOCO = 1500;
const corta = (s, n = MAX_BLOCO) => String(s ?? '').slice(0, n);

/**
 * @param {{ docs?: object[], legislacao?: object[], resultado?: object|null, pecaResumo?: object|null }} args
 * @returns {{ blocos: object[], texto: string, temFonteDoCaso: boolean }}
 */
export function montarContextoLu({ docs = [], legislacao = [], resultado = null, pecaResumo = null } = {}) {
  const blocos = [];
  const contagem = {};
  const add = (prefixo, tipo, dados) => {
    contagem[prefixo] = (contagem[prefixo] || 0) + 1;
    const bloco = { id: `${prefixo}${contagem[prefixo]}`, tipo, ...dados, texto: corta(dados.texto) };
    blocos.push(bloco);
    return bloco;
  };

  for (const d of docs) {
    add('D', 'documento', {
      rotulo: `${d.documento_nome || 'documento'}, pág. ${d.pagina ?? 's/n'}`,
      texto: d.conteudo,
      documento: d.documento_nome || 'documento',
      pagina: d.pagina ?? null,
      storage_path: d.storage_path || null,
    });
  }

  const r = resultado || {};
  for (const x of r.conclusoes || []) {
    add('P', 'parecer', {
      rotulo: `Parecer, conclusão ${x.id}`,
      texto: `${x.titulo} (${x.severidade}, confiança ${x.confianca}%): ${x.resumo} Fundamento: ${x.fundamento_legal}`,
    });
  }
  for (const f of r.fatos_importantes || []) {
    add('P', 'parecer', {
      rotulo: `Parecer, fato ${f.id}`,
      texto: `${f.data}: ${f.descricao} (documento: ${f.fonte || 'não indicado'}; relevância ${f.relevancia})`,
      documento: f.fonte || undefined,
    });
  }
  for (const x of r.raciocinio || []) {
    add('P', 'parecer', {
      rotulo: `Parecer, raciocínio ${x.id}`,
      texto: `Regra: ${x.premissa} Aplicação: ${x.aplicacao} Conclusão: ${x.conclusao_logica} (${x.referencia})`,
    });
  }
  (r.recomendacoes || []).forEach((t, i) => add('P', 'parecer', { rotulo: `Parecer, recomendação ${i + 1}`, texto: t }));
  if (r.alerta_dados_insuficientes) add('P', 'parecer', { rotulo: 'Parecer, alerta', texto: r.alerta_dados_insuficientes });

  const pecas = Array.isArray(pecaResumo?.pecas) ? pecaResumo.pecas : [];
  for (const p of pecas) {
    add('A', 'peca', {
      rotulo: `Resumo da peça, ${p.modelo}`,
      texto:
        `Modelo ${p.modelo}, tese ${p.tese}. ${p.descricao || ''} Data de referência: ${p.data_referencia || 'não informada'}. ` +
        `Campos a preencher: ${p.campos_preencher || 0}. Trechos a confirmar: ${p.a_confirmar || 0}. Figuras a anexar: ${p.figuras || 0}.` +
        `${(p.avisos || []).length ? ` Avisos: ${p.avisos.join(' ')}` : ''}`,
    });
  }

  for (const l of legislacao) {
    add('L', 'legislacao', {
      rotulo: `${l.norma} ${l.identificador}`,
      texto: l.texto_integral,
      norma: l.norma,
      identificador: l.identificador,
    });
  }

  const secao = (titulo, tipo) => {
    const itens = blocos.filter((b) => b.tipo === tipo);
    return itens.length ? `--- ${titulo} ---\n${itens.map((b) => `[${b.id}] ${b.rotulo}\n${b.texto}`).join('\n\n')}\n\n` : '';
  };
  const aviso = pecas.length === 0 ? 'AVISO: nenhuma peça foi gerada para esta consulta. Se perguntarem sobre a peça, diga isso.\n\n' : '';
  const texto = (
    secao('PARECER DO CASO', 'parecer') + secao('RESUMO DA PEÇA', 'peca') + aviso + secao('DOCUMENTOS DO CASO', 'documento') + secao('LEGISLAÇÃO E JURISPRUDÊNCIA', 'legislacao')
  ).trim();

  return { blocos, texto, temFonteDoCaso: blocos.some((b) => b.tipo !== 'legislacao') };
}

/** Fonte no formato que a tela mostra (numerada pela ordem de citação). */
export function fonteParaCliente(bloco, n) {
  const base = { n, tipo: bloco.tipo, rotulo: bloco.rotulo, trecho: String(bloco.texto || '').slice(0, 280) };
  if (bloco.tipo === 'documento') return { ...base, documento: bloco.documento, pagina: bloco.pagina, storage_path: bloco.storage_path };
  if (bloco.tipo === 'legislacao') return { ...base, norma: bloco.norma, identificador: bloco.identificador };
  if (bloco.documento) return { ...base, documento: bloco.documento };
  return base;
}
