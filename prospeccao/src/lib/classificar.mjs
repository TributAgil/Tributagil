// Pontua o quanto um lead tem cara de "tributário" e de "empresarial", a
// partir do nome, das categorias da fonte e do texto do site.
import { semAcento } from './normalizar.mjs'

// [expressão, peso]. Pesos maiores = sinal mais específico de tributário.
const TERMOS_TRIBUTARIO = [
  [/tributari[oa]s?|tributarist[ao]s?/, 5],
  [/direito fiscal|advocacia fiscal|contencioso fiscal|assessoria fiscal/, 4],
  [/planejamento tributario|recuperacao de (creditos?|tributos)|creditos? tributari|compensacao tributaria|restituicao de tributos/, 4],
  [/execucao fiscal|execucoes fiscais|auto de infracao|autos de infracao|divida ativa|transacao tributaria|parcelamento de (debitos|tributos|impostos)/, 3],
  [/\bicms\b|\bipi\b|pis\s*\/?\s*cofins|\birpj\b|\bcsll\b|\bitcmd\b|\bitbi\b|\biptu\b/, 2],
  [/\bcarf\b|\bconsef\b|\bsefaz\b|receita federal|\bpgfn\b|\bfisco\b/, 2],
  [/reforma tributaria|\bibs\b|\bcbs\b|imposto seletivo|split payment/, 3],
  [/elisao fiscal|evasao fiscal|substituicao tributaria|beneficios? fiscai?s|incentivos? fiscai?s|programa desenvolve/, 2],
  [/\bcontribuintes?\b|\bimpostos?\b|certidao negativa de debitos/, 1],
]

// "empresarial" sozinho aparece em endereço ("Edifício Empresarial X"):
// só contam expressões que indicam área de atuação.
const TERMOS_EMPRESARIAL = [
  [/direito empresarial|advocacia empresarial|advogad[oa]s? empresaria(l|is)|consultoria (juridica )?empresarial|juridico empresarial|contencioso empresarial|assessoria juridica empresarial|(tributari[oa]|civel|trabalhista) e empresarial|empresarial e (tributari|societari)/, 3],
  [/societari[oa]|contratos? (empresariais|comerciais)|fusoes e aquisicoes|\bm&a\b|reestruturacao societaria|governanca corporativa/, 3],
  [/recuperacao judicial|falencia|insolvencia/, 3],
  [/compliance|holding|planejamento patrimonial|planejamento sucessorio/, 2],
  [/startups?|propriedade intelectual|marcas e patentes/, 1],
]

function pontuar(texto, termos) {
  const encontrados = []
  let score = 0
  for (const [re, peso] of termos) {
    const m = texto.match(new RegExp(re.source, 'g'))
    if (m) {
      // repetições somam pouco: 1 ocorrência = peso, cada extra = +0,25 (máx. 2x)
      score += Math.min(peso * 2, peso + (m.length - 1) * 0.25 * peso)
      encontrados.push(m[0])
    }
  }
  return { score: Math.round(score * 10) / 10, encontrados: [...new Set(encontrados)] }
}

export function textoParaClassificar(s) {
  return semAcento(String(s || '')).toLowerCase()
}

/** Sinais de tributário/empresarial em um texto livre (nome, categorias, site). */
export function sinais(texto) {
  const t = textoParaClassificar(texto)
  const trib = pontuar(t, TERMOS_TRIBUTARIO)
  const emp = pontuar(t, TERMOS_EMPRESARIAL)
  return { tributario: trib.score, empresarial: emp.score, termos: [...trib.encontrados, ...emp.encontrados] }
}

export function somarSinais(...lista) {
  const out = { tributario: 0, empresarial: 0, termos: [] }
  for (const s of lista.filter(Boolean)) {
    out.tributario += s.tributario || 0
    out.empresarial += s.empresarial || 0
    out.termos.push(...(s.termos || []))
  }
  out.tributario = Math.round(out.tributario * 10) / 10
  out.empresarial = Math.round(out.empresarial * 10) / 10
  out.termos = [...new Set(out.termos)]
  return out
}

/** Nome sugere que não é escritório/advogado (contabilidade, agência...). */
export function pareceNaoJuridico(nome = '') {
  const n = textoParaClassificar(nome)
  if (/advog|advoc|juridic|direito|\badv\b|law/.test(n)) return false
  return /contabil|contador|marketing|criacao de sites|agencia|imobiliaria|despachante|seguros|corretora|cartorio|tabelionato|cobranca|calculos|faturamento|fatur|patentes|registro de marcas|assessoria empresarial|recursos humanos|treinamento/.test(n)
}

/**
 * Foco final do lead.
 * - "Tributário": sinal específico (nome/categoria/site) acima do limiar
 * - "Empresarial": sinal empresarial sem tributário suficiente
 * - "Geral": sem evidência (fica em aba separada)
 */
export function focoDoLead(s) {
  if (s.tributario >= 2 && s.empresarial >= 3) return 'Tributário e empresarial'
  if (s.tributario >= 4) return 'Tributário'
  if (s.empresarial >= 3) return 'Empresarial'
  if (s.tributario >= 2) return 'Tributário (sinal fraco)'
  return 'Geral'
}
