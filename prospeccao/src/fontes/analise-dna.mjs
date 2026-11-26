#!/usr/bin/env node
// Fonte: perfis públicos de escritórios no Análise DNA (analise.com).
//
// A busca do site é dinâmica; este coletor lê só os perfis cujos endereços
// estão listados (um por linha) em dados/entrada/analise-dna.txt — por
// exemplo, os encontrados numa pesquisa "site:analise.com/dna perfil Salvador".
// De cada perfil extrai nome, endereço, cidade/UF, CEP, telefone, site e
// especialidades. Grava dados/fontes/analise_dna.jsonl (só a UF pedida).
//
// Uso: node src/fontes/analise-dna.mjs [--uf BA]
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { gravarJsonl } from '../lib/arquivos.mjs'
import { PASTA_ENTRADA, PASTA_FONTES } from '../lib/caminhos.mjs'
import { sinais } from '../lib/classificar.mjs'
import { extrairContatos, textoVisivel } from '../lib/contatos.mjs'
import { baixar } from '../lib/http.mjs'
import { ehSiteProprio, normalizarTelefone, normalizarUrl, unicos } from '../lib/normalizar.mjs'

const args = process.argv.slice(2)
const i = args.indexOf('--uf')
const UF = (i >= 0 ? args[i + 1] : 'BA').toUpperCase()

export function lerPerfil(html, url) {
  const nome = textoVisivel(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || '')
  const endereco = /<address[^>]*>([\s\S]*?)<\/address>/i.exec(html)?.[1] || ''
  const linhas = [...endereco.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)].map((m) => textoVisivel(m[1]))
  const cidadeUf = /([^()]+)\s*\(([A-Z]{2})\)/.exec(linhas.find((l) => /\([A-Z]{2}\)/.test(l)) || '')
  const cep = /CEP\s*([\d-]{8,9})/.exec(textoVisivel(endereco))?.[1]?.replace(/\D/g, '') || ''
  const ddd = /Telefone\s*\(?(\d{2})/.exec(textoVisivel(endereco))?.[1] || null
  const telefones = unicos(
    [...textoVisivel(endereco).matchAll(/Telefone\s*([\d\s()+-]{8,20})/g)].map((m) => normalizarTelefone(m[1], ddd)),
  )
  const corpo = /<main[\s\S]*?<\/main>/i.exec(html)?.[0] || html
  const contatos = extrairContatos(corpo, url, { dddPadrao: ddd })
  const externos = [...corpo.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((m) => normalizarUrl(m[1]))
  const site = externos.find((u) => u && ehSiteProprio(u) && !/analise\.com/.test(u)) || ''
  const especialidades = textoVisivel(/Especialidades?([\s\S]{0,3000}?)<\/(?:ul|section|div)>/i.exec(corpo)?.[1] || '').slice(0, 400)
  return {
    fonte: 'analise_dna',
    fonte_url: url,
    nome,
    tipo: 'Escritório',
    cidade: cidadeUf?.[1]?.trim() || '',
    uf: cidadeUf?.[2] || '',
    endereco: linhas[0] || '',
    cep,
    telefones,
    whatsapp: contatos.whatsapp,
    emails: contatos.emails,
    site,
    instagram: contatos.instagram[0] || '',
    linkedin: contatos.linkedin[0] || '',
    facebook: contatos.facebook.filter((f) => !/analise/i.test(f))[0] || '',
    categorias: especialidades ? [especialidades] : [],
    sinais: sinais(`${nome} ${especialidades}`),
  }
}

async function main() {
  let urls = []
  try {
    urls = (await readFile(path.join(PASTA_ENTRADA, 'analise-dna.txt'), 'utf8'))
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^https:\/\/analise\.com\/dna\/perfil-do-escritorio\//.test(l))
  } catch {
    console.log('Análise DNA: crie dados/entrada/analise-dna.txt com os endereços dos perfis (um por linha).')
    return
  }
  const leads = []
  for (const u of unicos(urls)) {
    const r = await baixar(u, { ttlDias: 60 })
    if (!r.ok) continue
    const lead = lerPerfil(r.texto, u)
    if (lead.nome && lead.uf === UF) leads.push(lead)
  }
  await gravarJsonl(path.join(PASTA_FONTES, 'analise_dna.jsonl'), leads)
  console.log(`OK: ${leads.length}/${urls.length} perfis da UF ${UF} → dados/fontes/analise_dna.jsonl`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
