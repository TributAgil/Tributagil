// api/_bloqueios-peca.js
//
// Versão OBJETIVA dos motivos pelos quais uma peça não pôde ser gerada. O motor (api/_motor-peca.js)
// emite um bloqueio POR PERÍODO ("CDA / período: motivo"), o que vira 16 linhas iguais num processo com
// 16 períodos. Aqui os motivos idênticos são agrupados numa frase só ("… em 16 períodos de 6 CDAs"),
// com uma orientação do que fazer. O detalhe por período continua disponível (não é jogado fora).
//
// Puro (sem rede) e só de apresentação: não decide nada — quem bloqueia é o motor.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

// "<CDA> / <período>: <motivo>"  (rotuloPeriodo do motor usa " / " entre CDA e período)
const POR_PERIODO = /^(.+?) \/ (.+?): (.+)$/;

const semPonto = (s) => s.replace(/[.\s]+$/, '');
const maiuscula = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/**
 * Agrupa bloqueios idênticos por período.
 * @param {string[]} bloqueios mensagens do motor
 * @returns {string[]} frases curtas (ordem de primeira aparição); mensagens que não são "por período" passam como estão
 */
export function agruparBloqueios(bloqueios) {
  const grupos = new Map(); // motivo -> { cdas:Set, periodos:Set, original }
  const saida = []; // preserva a ordem; item = string pronta | { chave }
  for (const b of Array.isArray(bloqueios) ? bloqueios : []) {
    const m = POR_PERIODO.exec(String(b));
    if (!m) {
      saida.push(String(b));
      continue;
    }
    const [, cda, periodo, motivo] = m;
    if (!grupos.has(motivo)) {
      grupos.set(motivo, { cdas: new Set(), periodos: new Set(), n: 0, original: String(b) });
      saida.push({ chave: motivo });
    }
    const g = grupos.get(motivo);
    g.cdas.add(cda);
    g.periodos.add(`${cda} / ${periodo}`);
    g.n++;
  }
  return saida.map((item) => {
    if (typeof item === 'string') return item;
    const g = grupos.get(item.chave);
    if (g.n === 1) return g.original;
    return `${maiuscula(semPonto(item.chave))} — ${plural(g.periodos.size, 'período', 'períodos')} em ${plural(g.cdas.size, 'CDA', 'CDAs')}.`;
  });
}

/** O que fazer, em uma frase, conforme o tipo de bloqueio (vazio se não há orientação objetiva). */
export function orientacaoBloqueios(bloqueios) {
  const texto = (Array.isArray(bloqueios) ? bloqueios : []).join(' ');
  if (/faltam dados|não consta|não identificad|Vencimento não identificado/i.test(texto)) {
    return 'Anexe os documentos que mostram essas datas (extrato do débito, recibo de entrega da declaração, auto de infração ou notificação do lançamento) e refaça a análise.';
  }
  if (/análise manual/i.test(texto)) return 'Há evento ou situação que pode alterar o prazo: o advogado precisa avaliar o caso à mão.';
  return '';
}

/** Uma linha: "<tese> — não gerada: <motivo principal>". */
export function resumoCurtoPeca({ tese_nome: tese, status, bloqueios = [], divergencias = [], mensagem = '' }) {
  const nome = tese || 'Peça';
  if (status === 'indisponivel') return `${nome} — sem modelo disponível para este cenário.`;
  if (status === 'sem_tese') return `${nome} — não identificada nos documentos.`;
  if (divergencias.length > 0) return `${nome} — não gerada: o cálculo diverge do parecer salvo.`;
  const texto = bloqueios.join(' ');
  if (/faltam dados|Vencimento não identificado|data .*(inválida|não consta)|não consta/i.test(texto)) {
    return `${nome} — não gerada: faltam dados nos documentos.`;
  }
  if (/declaração do contribuinte/i.test(texto)) return `${nome} — não se aplica: crédito constituído por declaração do contribuinte.`;
  if (/vício formal|análise manual/i.test(texto)) return `${nome} — não gerada: o caso exige análise manual.`;
  return `${nome} — não gerada.${mensagem ? ` ${mensagem}` : ''}`;
}
