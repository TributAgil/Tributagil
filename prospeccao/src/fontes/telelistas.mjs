#!/usr/bin/env node
// Fonte: TeleListas.net (guia comercial com telefone, endereço e site).
//
// Para cada município da UF e cada categoria jurídica relevante, lê a lista
// (e as listas por bairro, quando a primeira página vem cheia) e depois a
// ficha de cada empresa. Grava dados/fontes/telelistas.jsonl.
//
// Uso:
//   node src/fontes/telelistas.mjs                      # municípios de config/municipios-ba.json
//   node src/fontes/telelistas.mjs --cidades "Salvador,Feira de Santana"
//   node src/fontes/telelistas.mjs --max-cidades 40
import path from 'node:path'
import { gravarJsonl, lerJson } from '../lib/arquivos.mjs'
import { PASTA_CONFIG, PASTA_FONTES } from '../lib/caminhos.mjs'
import { pareceNaoJuridico, sinais } from '../lib/classificar.mjs'
import { extrairContatos } from '../lib/contatos.mjs'
import { baixar } from '../lib/http.mjs'
import { ehSiteProprio, normalizarTelefone, normalizarUrl, semAcento, unicos } from '../lib/normalizar.mjs'

const args = process.argv.slice(2)
const opt = (nome, padrao) => {
  const i = args.indexOf('--' + nome)
  return i >= 0 ? args[i + 1] : padrao
}
const UF = (opt('uf', 'BA') || 'BA').toLowerCase()
const MAX_CIDADES = Number(opt('max-cidades', 120))
const CATEGORIAS = (opt('categorias', 'advogado+tributarista,advogado+empresarial,assessoria+fiscal+e+tributaria') || '').split(',')
const BASE = 'https://www.telelistas.net'
const LIMITE_PAGINA = 20 // a partir daqui a lista provavelmente foi cortada → abre os bairros

const DDD_PADRAO = { salvador: '71', 'feira+de+santana': '75', 'vitoria+da+conquista': '77', itabuna: '73', ilheus: '73' }

export function slugTelelistas(nome) {
  return semAcento(nome).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '+').replace(/^\+|\+$/g, '')
}

function linksDeEmpresas(html, cidade, cat) {
  const re = new RegExp(`href="(/locais/${UF}/${cidade.replace(/\+/g, '\\+')}/${cat.replace(/\+/g, '\\+')}/bu-\\d+/[^"]+)"`, 'g')
  return unicos([...html.matchAll(re)].map((m) => BASE + m[1].split('?')[0]))
}

function linksDeBairros(html, cidade, cat) {
  const re = new RegExp(`href="(?:${BASE})?(/${UF}/${cidade.replace(/\+/g, '\\+')}/em\\+[^/"]+/${cat.replace(/\+/g, '\\+')})"`, 'g')
  return unicos([...html.matchAll(re)].map((m) => BASE + m[1]))
}

function jsonLdNegocio(html) {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1])
      if (j['@type'] === 'LocalBusiness') return j
    } catch {
      /* JSON-LD inválido */
    }
  }
  return null
}

function lerFicha(html, url, cidadeNome, cat) {
  const ld = jsonLdNegocio(html) || {}
  const nome = String(ld.name || '').replace(/\s+em\s+[^,]+$/i, '').trim()
  const end = ld.address || {}
  const ddd = DDD_PADRAO[slugTelelistas(cidadeNome)] || null
  const contatos = extrairContatos(html, url, { dddPadrao: ddd })
  // O telefone do próprio TeleListas aparece no rodapé: descarta.
  const telefones = unicos(
    [...html.matchAll(/href="tel:([^"]+)"/gi)].map((m) => normalizarTelefone(m[1], ddd)).filter((t) => t && t !== '552130318091'),
  )
  const externos = [...html.matchAll(/href="(https?:\/\/[^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*(?:Nosso Site|Visite nosso site|Site)/gi)].map((m) => m[1])
  const site = externos.map(normalizarUrl).find((u) => u && ehSiteProprio(u) && !/telelistas|conexaomercado|linkmercado/.test(u)) || ''
  const servicos = /Produtos e Servi[çc]os([\s\S]{0,4000}?)Telefones e Endere/i.exec(html)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || ''
  const instagram = contatos.instagram.filter((i) => !/telelistas/i.test(i))
  const facebook = contatos.facebook.filter((f) => !/telelistas/i.test(f))
  const whatsappTexto = /data-loga-tipo="Whatsapp"[^>]*href="[^"]*?(\d{10,13})/i.exec(html)?.[1]
  return {
    fonte: 'telelistas',
    fonte_url: url,
    nome,
    tipo: null,
    cidade: cidadeNome,
    uf: UF.toUpperCase(),
    bairro: (end.streetAddress || '').includes(' - ') ? (end.streetAddress || '').split(' - ').pop().replace(/\s+em\s+.*$/i, '') : '',
    endereco: (end.streetAddress || '').replace(/\s+em\s+[^-]+$/i, ''),
    cep: end.postalCode || '',
    telefones,
    whatsapp: unicos([...contatos.whatsapp, normalizarTelefone(whatsappTexto, ddd)]),
    emails: contatos.emails.filter((e) => !/telelistas|linkmercado|conexaomercado/.test(e)),
    site,
    instagram: instagram[0] || '',
    facebook: facebook[0] || '',
    linkedin: contatos.linkedin.filter((l) => !/telelistas/i.test(l))[0] || '',
    categorias: [cat.replace(/\+/g, ' ')],
    descricao: servicos.slice(0, 600),
    sinais: sinais(`${nome} ${cat.replace(/\+/g, ' ')} ${servicos}`),
  }
}

async function main() {
  let cidades
  if (opt('cidades')) cidades = opt('cidades').split(',').map((s) => s.trim())
  else {
    const ranking = (await lerJson(path.join(PASTA_CONFIG, `municipios-${UF}.json`), [])) || []
    cidades = ranking.length ? ranking.slice(0, MAX_CIDADES).map((m) => m.nome) : ['Salvador', 'Feira de Santana', 'Vitória da Conquista']
  }
  console.log(`TeleListas: ${cidades.length} municípios × ${CATEGORIAS.length} categorias`)
  const fichas = new Map() // url -> { cidade, cats:Set }
  for (const cidadeNome of cidades) {
    const cidade = slugTelelistas(cidadeNome)
    for (const cat of CATEGORIAS) {
      const r = await baixar(`${BASE}/${UF}/${cidade}/${cat}`, { ttlDias: 15 })
      if (!r.ok) continue
      const listas = [r.texto]
      if (linksDeEmpresas(r.texto, cidade, cat).length >= LIMITE_PAGINA) {
        for (const b of linksDeBairros(r.texto, cidade, cat)) {
          const rb = await baixar(b, { ttlDias: 15 })
          if (rb.ok) listas.push(rb.texto)
        }
      }
      let n = 0
      for (const html of listas)
        for (const u of linksDeEmpresas(html, cidade, cat)) {
          const id = /bu-(\d+)/.exec(u)[1]
          if (!fichas.has(id)) fichas.set(id, { url: u, cidade: cidadeNome, cat })
          n++
        }
      if (n) console.log(`  ${cidadeNome} / ${cat.replace(/\+/g, ' ')}: ${n}`)
    }
  }
  console.log(`  ${fichas.size} fichas para ler…`)
  const leads = []
  for (const { url, cidade, cat } of fichas.values()) {
    const r = await baixar(url, { ttlDias: 30 })
    if (!r.ok) continue
    const lead = lerFicha(r.texto, url, cidade, cat)
    if (!lead.nome) continue
    if (pareceNaoJuridico(lead.nome)) continue
    // "assessoria fiscal" traz muitos contadores: só fica se o nome for jurídico.
    if (cat.startsWith('assessoria') && !/advog|advoc|jur[ií]dic|direito|\badv\b/i.test(lead.nome)) continue
    leads.push(lead)
  }
  await gravarJsonl(path.join(PASTA_FONTES, 'telelistas.jsonl'), leads)
  console.log(`OK: ${leads.length} leads → dados/fontes/telelistas.jsonl`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
