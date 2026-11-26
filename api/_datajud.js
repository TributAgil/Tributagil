// api/_datajud.js
//
// Acompanhamento do processo pela API pública do DataJud (CNJ): só MOVIMENTAÇÕES (sem documentos), com atraso de
// alguns dias em relação ao tribunal. O sistema lê, classifica e AVISA; não muda o cálculo dos prazos sozinho (a
// conclusão sobre se um ato interrompeu o prazo é do advogado).
//
// API: POST https://api-publica.datajud.cnj.jus.br/api_publica_<tribunal>/_search, cabeçalho
// "Authorization: APIKey <chave pública>" (DATAJUD_API_KEY; o CNJ pode trocar a chave). A API fica sobrecarregada
// com frequência (429 ou demora): tudo aqui tem tempo-limite e devolve "indisponível" em vez de erro.
//
// Arquivo com prefixo "_": a Vercel não o expõe como endpoint.

const BASE = 'https://api-publica.datajud.cnj.jus.br';

// Justiça Estadual: código do tribunal (TR) no número CNJ -> sigla do TJ (Resolução CNJ nº 65/2008)
const TJ_POR_CODIGO = {
  '01': 'tjac', '02': 'tjal', '03': 'tjap', '04': 'tjam', '05': 'tjba', '06': 'tjce', '07': 'tjdft', '08': 'tjes',
  '09': 'tjgo', '10': 'tjma', '11': 'tjmt', '12': 'tjms', '13': 'tjmg', '14': 'tjpa', '15': 'tjpb', '16': 'tjpr',
  '17': 'tjpe', '18': 'tjpi', '19': 'tjrj', '20': 'tjrn', '21': 'tjrs', '22': 'tjro', '23': 'tjrr', '24': 'tjsc',
  '25': 'tjse', '26': 'tjsp', '27': 'tjto',
};

/**
 * O número CNJ com 20 dígitos (NNNNNNN-DD.AAAA.J.TR.OOOO), conferindo o dígito verificador (módulo 97, Resolução
 * CNJ nº 65/2008). Devolve null se não for um número CNJ válido.
 */
export function numeroCnj(texto) {
  const d = String(texto ?? '').replace(/\D/g, '');
  if (d.length !== 20) return null;
  const n = d.slice(0, 7);
  const dv = d.slice(7, 9);
  const resto = d.slice(9); // AAAA J TR OOOO
  const calculado = 98 - Number(BigInt(`${n}${resto}00`) % 97n);
  return String(calculado).padStart(2, '0') === dv ? d : null;
}

/** Formata 20 dígitos como NNNNNNN-DD.AAAA.J.TR.OOOO. */
export const formatarCnj = (d) => `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;

/** O índice do DataJud para o número: Justiça Federal (J=4) -> trf1..trf6; Estadual (J=8) -> tjXX. */
export function tribunalDoNumero(d) {
  if (!d) return null;
  const j = d[13];
  const tr = d.slice(14, 16);
  if (j === '4') {
    const n = Number(tr);
    return n >= 1 && n <= 6 ? `trf${n}` : null;
  }
  if (j === '8') return TJ_POR_CODIGO[tr] || null;
  return null;
}

/** Data de uma movimentação: ISO ("2023-07-21T19:07:13.000Z") ou compacta ("20230721190713"). */
export function dataDoMovimento(v) {
  const s = String(v ?? '').trim();
  const compacta = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/.exec(s);
  const d = compacta
    ? new Date(Date.UTC(+compacta[1], +compacta[2] - 1, +compacta[3], +(compacta[4] || 0), +(compacta[5] || 0), +(compacta[6] || 0)))
    : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Classificação pelo NOME da movimentação e dos complementos (a Tabela Processual Unificada varia por tribunal; o
// nome é mais estável que o código). A ordem importa: a tentativa frustrada vem antes da penhora e da citação.
export const CATEGORIAS = {
  tentativa_frustrada: { rotulo: 'Tentativa frustrada (penhora ou citação sem sucesso)', interrompe: false },
  constricao: { rotulo: 'Penhora, bloqueio ou outra constrição', interrompe: true },
  citacao: { rotulo: 'Citação', interrompe: true },
  parcelamento: { rotulo: 'Parcelamento', interrompe: true },
  suspensao_art40: { rotulo: 'Suspensão ou arquivamento provisório (art. 40 da LEF)', interrompe: false },
  desarquivamento: { rotulo: 'Desarquivamento', interrompe: false },
  extincao: { rotulo: 'Extinção, sentença ou baixa definitiva', interrompe: false },
  outro: { rotulo: 'Outra movimentação', interrompe: false },
};

// Códigos da Tabela Processual Unificada (TPU) cujo NOME sozinho é ambíguo ("Definitivo", "Provisório")
const POR_CODIGO = {
  245: 'suspensao_art40', // Arquivamento > Provisório
  246: 'extincao', // Arquivamento > Definitivo
  22: 'extincao', // Baixa Definitiva
  893: 'desarquivamento', // Desarquivamento
};

export function classificarMovimento(texto, codigo = null) {
  if (POR_CODIGO[codigo]) return POR_CODIGO[codigo];
  const t = semAcento(texto);
  if (/^provisorio\b/.test(t)) return 'suspensao_art40';
  if (/^definitivo\b/.test(t)) return 'extincao';
  const ato = /penhor|bloquei|arrest|constri|indisponibilidade|sisbajud|bacenjud|bacen jud|renajud|cita[cd]/.test(t);
  if (ato && /negativ|infrutif|nao encontrad|nao localizad|frustr|sem bens|inexistencia de bens|devolvid[oa] sem cumprimento/.test(t)) return 'tentativa_frustrada';
  if (/desarquiv/.test(t)) return 'desarquivamento';
  if (/penhor|bloquei|arrest|constri|indisponibilidade de bens|sisbajud|bacenjud|bacen jud|renajud|leilao|hasta publica|adjudica/.test(t)) return 'constricao';
  if (/cita[cd]/.test(t)) return 'citacao';
  if (/parcelament/.test(t)) return 'parcelamento';
  if (/suspens|sobrest|arquivamento provisorio|arquivad[oa] provisoriamente|art\.? ?40|sem baixa/.test(t)) return 'suspensao_art40';
  if (/extin|baixa definitiva|arquivamento definitivo|transitad|sentenca/.test(t)) return 'extincao';
  return 'outro';
}

const MAX_MOVIMENTOS = 80;

/**
 * Resume a resposta do DataJud: um processo pode vir em mais de um registro (graus diferentes); as movimentações são
 * juntadas, sem repetição, da mais nova para a mais antiga.
 * @returns {null | { classe: string, orgao: string, grau: string[], ultima_atualizacao: string|null,
 *   ultima_movimentacao: string|null, movimentos: Array<{ data: string, codigo: number|null, nome: string,
 *   complemento: string, categoria: string }> }}
 */
export function resumirResposta(json) {
  const fontes = (json?.hits?.hits || []).map((h) => h?._source).filter(Boolean);
  if (!fontes.length) return null;
  const vistos = new Set();
  const movimentos = [];
  for (const f of fontes) {
    for (const m of Array.isArray(f.movimentos) ? f.movimentos : []) {
      const data = dataDoMovimento(m?.dataHora);
      if (!data) continue;
      const nome = String(m?.nome || '').trim().slice(0, 200);
      const complemento = (Array.isArray(m?.complementosTabelados) ? m.complementosTabelados : [])
        .map((c) => String(c?.nome || '').trim())
        .filter(Boolean)
        .join('; ')
        .slice(0, 300);
      const chave = `${data}|${m?.codigo ?? ''}|${nome}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const codigo = Number.isFinite(Number(m?.codigo)) ? Number(m.codigo) : null;
      movimentos.push({ data, codigo, nome, complemento, categoria: classificarMovimento(`${nome} ${complemento}`, codigo) });
    }
  }
  movimentos.sort((a, b) => b.data.localeCompare(a.data));
  const atualizacoes = fontes.map((f) => dataDoMovimento(f.dataHoraUltimaAtualizacao)).filter(Boolean).sort();
  return {
    classe: String(fontes[0]?.classe?.nome || '').slice(0, 120),
    orgao: String(fontes[0]?.orgaoJulgador?.nome || '').slice(0, 160),
    grau: [...new Set(fontes.map((f) => f.grau).filter(Boolean))],
    ultima_atualizacao: atualizacoes[atualizacoes.length - 1] || null,
    ultima_movimentacao: movimentos[0]?.data || null,
    movimentos: movimentos.slice(0, MAX_MOVIMENTOS),
  };
}

/**
 * Consulta o processo. Nunca lança.
 * @returns {Promise<{ status: 'ok'|'nao_encontrado'|'indisponivel'|'erro', tribunal: string, dados?: object,
 *   detalhe?: string }>}
 */
// a API do CNJ chega a levar 40-50 s para responder; o endpoint tem 60 s (vercel.json)
export async function consultarDataJud({ numero, apiKey, timeoutMs = 50_000, fetchFn = fetch }) {
  const tribunal = tribunalDoNumero(numero);
  if (!tribunal) return { status: 'erro', tribunal: '', detalhe: 'Tribunal do número não suportado (só Justiça Federal e Estadual).' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const resp = await fetchFn(`${BASE}/api_publica_${tribunal}/_search`, {
      method: 'POST',
      headers: { Authorization: `APIKey ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: 10, query: { match: { numeroProcesso: numero } } }),
      signal: ctl.signal,
    });
    if (resp.status === 429 || resp.status >= 500) return { status: 'indisponivel', tribunal, detalhe: `HTTP ${resp.status}` };
    if (resp.status === 401 || resp.status === 403) return { status: 'erro', tribunal, detalhe: 'Chave do DataJud recusada (o CNJ pode ter trocado a chave pública).' };
    if (!resp.ok) return { status: 'erro', tribunal, detalhe: `HTTP ${resp.status}` };
    const dados = resumirResposta(await resp.json());
    return dados ? { status: 'ok', tribunal, dados } : { status: 'nao_encontrado', tribunal };
  } catch (err) {
    return { status: 'indisponivel', tribunal, detalhe: err?.name === 'AbortError' ? 'tempo esgotado' : String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}
