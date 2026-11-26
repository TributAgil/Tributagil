#!/usr/bin/env node
// Enriquecimento pelos sites: para cada site de escritório encontrado nas
// fontes (campo "site" ou domínio próprio do e-mail do CNPJ), visita a página
// inicial e até 5 páginas de contato/equipe/áreas de atuação, e extrai
// e-mails, telefones, WhatsApp, Instagram, LinkedIn e Facebook, além dos
// sinais de atuação tributária/empresarial no texto.
//
// Grava dados/sites.jsonl (um registro por domínio). Respeita robots.txt e
// faz no máximo 1 requisição por segundo em cada site.
//
// Uso: node src/enriquecer.mjs [--paralelo 12] [--max-paginas 6]
import path from 'node:path'
import { lerCsv, lerJsonl, gravarJsonl, listar } from './lib/arquivos.mjs'
import { PASTA_DADOS, PASTA_ENTRADA, PASTA_FONTES } from './lib/caminhos.mjs'
import { sinais } from './lib/classificar.mjs'
import { extrairContatos, paginasInteressantes, textoVisivel, tituloDaPagina } from './lib/contatos.mjs'
import { baixar, emParalelo } from './lib/http.mjs'
import { DDDS_BAHIA, dominioDe, dominioProprioDoEmail, ehSiteProprio, normalizarUrl, unicos } from './lib/normalizar.mjs'

const args = process.argv.slice(2)
const opt = (nome, padrao) => {
  const i = args.indexOf('--' + nome)
  return i >= 0 ? args[i + 1] : padrao
}
const PARALELO = Number(opt('paralelo', 12))
const MAX_PAGINAS = Number(opt('max-paginas', 6))

// Domínios de e-mail que são de contabilidades/provedores, não do escritório.
// Sinais de que o site é de escritório na Bahia (para descartar páginas de
// captação de escritórios de outros estados que só "atendem" a Bahia).
const RE_BAHIA = /\b(Salvador|Bahia|Feira de Santana|Vit[óo]ria da Conquista|Lauro de Freitas|Cama[çc]ari|Itabuna|Ilh[ée]us|Barreiras|Lu[íi]s Eduardo Magalh[ãa]es|Juazeiro|Jequi[ée]|Teixeira de Freitas|Porto Seguro|Alagoinhas)\b[^.]{0,40}(BA\b|Bahia)|\b(Salvador|Feira de Santana|Vit[óo]ria da Conquista|Itabuna|Ilh[ée]us|Barreiras)\s*[-/,–]\s*BA\b|CEP:?\s*4[0-8]\d{3}-?\d{3}/i

export const NAO_E_SITE_DO_ESCRITORIO =
  /contab|contador|contadores|\.cnt\.br$|linkpj|pejota|contabilizei|agilize|accounttech|vercontas|contasso|conube|\.gov\.br$|\.jus\.br$|oabsp\.org\.br$|veloxmail|ymail\.com$/

export async function sitesDasFontes() {
  const mapa = new Map() // dominio -> url inicial
  const arquivos = await listar(PASTA_FONTES, (f) => f.endsWith('.jsonl'))
  const registros = []
  for (const a of arquivos) registros.push(...(await lerJsonl(a)))
  for (const a of await listar(PASTA_ENTRADA, (f) => f.endsWith('.csv'))) registros.push(...(await lerCsv(a)))
  for (const r of registros) {
    const site = normalizarUrl(r.site)
    if (site && ehSiteProprio(site)) {
      const d = dominioDe(site)
      // começa pela página inicial (o link da fonte pode ser um post de blog)
      if (!mapa.has(d)) mapa.set(d, new URL(site).origin)
    }
    const emails = Array.isArray(r.emails) ? r.emails : String(r.email || r.emails || '').split(/[|,;\s]+/)
    for (const e of emails) {
      const d = dominioProprioDoEmail(String(e).toLowerCase())
      if (d && !NAO_E_SITE_DO_ESCRITORIO.test(d) && !mapa.has(d)) mapa.set(d, 'https://' + d)
    }
  }
  return mapa
}

async function visitarSite(dominio, urlInicial) {
  const resultado = {
    dominio,
    url: urlInicial,
    url_final: '',
    titulo: '',
    paginas: [],
    emails: [],
    telefones: [],
    whatsapp: [],
    instagram: [],
    linkedin: [],
    facebook: [],
    sinais: { tributario: 0, empresarial: 0, termos: [] },
    erro: '',
  }
  let inicio = await baixar(urlInicial, { ttlDias: 30 })
  const semResposta = (r) => !r.ok && !r.status && !/robots/.test(r.erro || '')
  if (semResposta(inicio) && /ENOTFOUND/.test(inicio.erro || '') && !/^https?:\/\/www\./.test(urlInicial)) {
    const alt = await baixar(urlInicial.replace(/^(https?:\/\/)/, '$1www.'), { ttlDias: 30 })
    if (alt.ok) inicio = alt
  }
  if (!inicio.ok && urlInicial.startsWith('https://') && !/ENOTFOUND/.test(inicio.erro || '')) {
    const alt = await baixar(urlInicial.replace('https://', 'http://'), { ttlDias: 30 })
    if (alt.ok) inicio = alt
  }
  if (!inicio.ok) {
    resultado.erro = inicio.erro || `HTTP ${inicio.status}`
    return resultado
  }
  // Redirecionou para outro domínio (ex.: domínio expirado → parking): descarta.
  const dominioFinal = dominioDe(inicio.url)
  if (dominioFinal && dominioFinal !== dominio && !dominioFinal.endsWith('.' + dominio) && !dominio.endsWith('.' + dominioFinal)) {
    if (!ehSiteProprio(inicio.url)) {
      resultado.erro = 'redireciona para ' + dominioFinal
      return resultado
    }
  }
  resultado.url_final = inicio.url
  resultado.titulo = tituloDaPagina(inicio.texto)
  const paginas = [inicio]
  for (const u of paginasInteressantes(inicio.texto, inicio.url, MAX_PAGINAS - 1)) {
    const r = await baixar(u, { ttlDias: 30 })
    if (r.ok) paginas.push(r)
  }
  const textos = []
  const acumulado = { emails: [], telefones: [], whatsapp: [], instagram: [], linkedin: [], facebook: [] }
  for (const p of paginas) {
    resultado.paginas.push(p.url)
    const c = extrairContatos(p.texto, p.url)
    for (const k of Object.keys(acumulado)) acumulado[k].push(...c[k])
    textos.push(tituloDaPagina(p.texto), textoVisivel(p.texto).slice(0, 20000))
  }
  for (const k of Object.keys(acumulado)) resultado[k] = unicos(acumulado[k])
  // E-mails de outros domínios no rodapé (agência que fez o site etc.) ficam por último.
  resultado.emails.sort((a, b) => (b.endsWith('@' + dominio) ? 1 : 0) - (a.endsWith('@' + dominio) ? 1 : 0))
  resultado.sinais = sinais(textos.join(' '))
  const tudo = textos.join(' ')
  resultado.juridico = /advog|advocacia|jur[ií]dic|escrit[óo]rio de advocacia|\bOAB\b|direito (tribut|empresar|civil)/i.test(resultado.titulo + ' ' + tudo.slice(0, 30000))
  resultado.menciona_uf = RE_BAHIA.test(tudo) || resultado.telefones.some((t) => DDDS_BAHIA.has(t.slice(2, 4)))
  const parking = /domain (is )?for sale|dominio (esta )?a venda|this domain|parked|godaddy|hostgator.*default|site em constru|under construction|account suspended|conta suspensa/i
  if (parking.test(resultado.titulo + ' ' + textos.slice(0, 2).join(' ').slice(0, 2000))) resultado.erro = 'site inativo/estacionado'
  return resultado
}

async function main() {
  const sites = await sitesDasFontes()
  const anteriores = new Map((await lerJsonl(path.join(PASTA_DADOS, 'sites.jsonl'))).map((s) => [s.dominio, s]))
  const pendentes = [...sites.entries()]
  console.log(`Enriquecimento: ${pendentes.length} domínios (${PARALELO} em paralelo)`)
  let feitos = 0
  const resultados = await emParalelo(pendentes, PARALELO, async ([dominio, url]) => {
    let r
    try {
      r = await visitarSite(dominio, url)
    } catch (e) {
      r = anteriores.get(dominio) || { dominio, url, erro: String(e.message || e) }
    }
    if (++feitos % 25 === 0) console.log(`  ${feitos}/${pendentes.length}`)
    return r
  })
  await gravarJsonl(path.join(PASTA_DADOS, 'sites.jsonl'), resultados)
  const ok = resultados.filter((r) => !r.erro)
  console.log(
    `OK: ${ok.length}/${resultados.length} sites lidos; ${ok.filter((r) => r.emails.length).length} com e-mail, ` +
      `${ok.filter((r) => r.whatsapp.length).length} com WhatsApp, ${ok.filter((r) => r.sinais.tributario >= 4).length} com sinal tributário`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
