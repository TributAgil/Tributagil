// api/_feriados.js
//
// Calendário forense para os prazos das peças processuais (embargos, agravo): fins de semana, feriados nacionais, os
// dias sem expediente da Justiça Federal (Lei nº 5.010/1966, art. 62) e a suspensão dos prazos de 20/12 a 20/01
// (art. 220 do CPC). Só prazos PROCESSUAIS: prescrição e decadência são prazos materiais e não passam por aqui.
//
// Critério CONSERVADOR: só entra o que é certo por lei federal. Feriado estadual, municipal ou ponto facultativo do
// tribunal (Carnaval e Corpus Christi na Justiça Estadual, por exemplo) NÃO é descontado: se o sistema pulasse um dia
// que na verdade teve expediente, o prazo calculado sairia DEPOIS do real e o advogado perderia o prazo. O que não é
// descontado vai para o [CONFIRMAR] da peça.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

const MS_DIA = 24 * 60 * 60 * 1000;
const iso = (d) => d.toISOString().slice(0, 10);
const somar = (d, n) => new Date(d.getTime() + n * MS_DIA);

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano), em UTC. */
export function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

// Lei nº 662/1949, Lei nº 6.802/1980 e Lei nº 14.759/2023 (Consciência Negra)
const NACIONAIS = [
  ['01-01', 'Confraternização Universal'],
  ['04-21', 'Tiradentes'],
  ['05-01', 'Dia do Trabalho'],
  ['09-07', 'Independência'],
  ['10-12', 'Nossa Senhora Aparecida'],
  ['11-02', 'Finados'],
  ['11-15', 'Proclamação da República'],
  ['11-20', 'Dia Nacional de Zumbi e da Consciência Negra'],
  ['12-25', 'Natal'],
];

// Lei nº 5.010/1966, art. 62 (Justiça Federal), além dos nacionais; o recesso de 20/12 a 06/01 fica dentro da
// suspensão do art. 220 do CPC
const FEDERAIS_FIXOS = [
  ['08-11', 'Dia da Justiça (Lei nº 5.010/1966)'],
  ['11-01', 'Todos os Santos (Lei nº 5.010/1966)'],
  ['12-08', 'Dia da Justiça Federal (Lei nº 5.010/1966)'],
];

const cache = new Map();

/**
 * Feriados do ano para a justiça indicada. @param {'federal'|'estadual'} justica
 * @returns {Map<string, string>} 'AAAA-MM-DD' -> nome
 */
export function feriadosDoAno(ano, justica = 'estadual') {
  const chave = `${ano}|${justica}`;
  if (cache.has(chave)) return cache.get(chave);
  const mapa = new Map();
  for (const [md, nome] of NACIONAIS) mapa.set(`${ano}-${md}`, nome);
  const p = pascoa(ano);
  // Sexta-feira da Paixão: feriado em todo o país (Lei nº 9.093/1995, religioso, e na Justiça Federal pela Lei nº 5.010/1966)
  mapa.set(iso(somar(p, -2)), 'Sexta-feira da Paixão');
  if (justica === 'federal') {
    for (const [md, nome] of FEDERAIS_FIXOS) mapa.set(`${ano}-${md}`, nome);
    mapa.set(iso(somar(p, -48)), 'Segunda-feira de Carnaval (Lei nº 5.010/1966)');
    mapa.set(iso(somar(p, -47)), 'Terça-feira de Carnaval (Lei nº 5.010/1966)');
    mapa.set(iso(somar(p, -4)), 'Quarta-feira Santa (Lei nº 5.010/1966)');
    mapa.set(iso(somar(p, -3)), 'Quinta-feira Santa (Lei nº 5.010/1966)');
  }
  cache.set(chave, mapa);
  return mapa;
}

export const nomeDoFeriado = (d, justica) => feriadosDoAno(d.getUTCFullYear(), justica).get(iso(d)) || '';

/** Fim de semana ou feriado (dia sem expediente forense). */
export const semExpediente = (d, justica) => d.getUTCDay() === 0 || d.getUTCDay() === 6 || Boolean(nomeDoFeriado(d, justica));

/** Suspensão dos prazos processuais de 20/12 a 20/01, inclusive (art. 220 do CPC). */
export function emSuspensao(d) {
  const m = d.getUTCMonth() + 1;
  const dia = d.getUTCDate();
  return (m === 12 && dia >= 20) || (m === 1 && dia <= 20);
}

/**
 * Prazo em dias ÚTEIS a partir da intimação: exclui o dia do começo (art. 224 do CPC) e não conta fim de semana,
 * feriado nem os dias da suspensão do art. 220.
 * @returns {{ final: Date, feriados: string[], suspensao: boolean }}
 */
export function prazoEmDiasUteis(inicio, n, justica = 'estadual') {
  let d = inicio;
  let contados = 0;
  const feriados = [];
  let suspensao = false;
  while (contados < n) {
    d = somar(d, 1);
    if (emSuspensao(d)) {
      suspensao = true;
      continue;
    }
    const nome = nomeDoFeriado(d, justica);
    if (nome && d.getUTCDay() !== 0 && d.getUTCDay() !== 6) feriados.push(`${nome} (${iso(d).split('-').reverse().join('/')})`);
    if (!semExpediente(d, justica)) contados += 1;
  }
  return { final: d, feriados, suspensao };
}

/**
 * Prazo em dias CORRIDOS: os dias da suspensão (art. 220) não correm; se o último dia cair em dia sem expediente,
 * prorroga para o primeiro dia útil (art. 224, § 1º, do CPC).
 * @returns {{ final: Date, feriados: string[], suspensao: boolean }}
 */
export function prazoEmDiasCorridos(inicio, n, justica = 'estadual') {
  let d = inicio;
  let contados = 0;
  let suspensao = false;
  while (contados < n) {
    d = somar(d, 1);
    if (emSuspensao(d)) suspensao = true;
    else contados += 1;
  }
  const feriados = [];
  while (semExpediente(d, justica) || emSuspensao(d)) {
    const nome = nomeDoFeriado(d, justica);
    if (nome && d.getUTCDay() !== 0 && d.getUTCDay() !== 6) feriados.push(`${nome} (${iso(d).split('-').reverse().join('/')})`);
    d = somar(d, 1);
  }
  return { final: d, feriados, suspensao };
}
