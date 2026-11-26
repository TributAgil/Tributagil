#!/usr/bin/env node
// Fonte: Google Maps, pela API oficial do Google Places (Text Search, "New").
//
// Precisa de uma chave com a "Places API (New)" ativada no Google Cloud:
//   GOOGLE_PLACES_API_KEY=... node src/fontes/google-places.mjs
// Sem a chave, o script avisa e sai sem erro (as outras fontes seguem).
//
// Para cada município × termo de busca, pede até 60 resultados (3 páginas de
// 20) e grava dados/fontes/google_places.jsonl com nome, telefone, site,
// endereço, nota e link do Maps.
//
// Custo: cada página é uma chamada "Text Search Enterprise" (os campos de
// telefone e site estão nesse nível). Ver preço/franquia gratuita em
// https://developers.google.com/maps/billing-and-pricing/pricing — use
// --max-cidades e --termos para controlar o volume. As respostas ficam em
// cache (.cache/), então repetir a coleta não cobra de novo.
import path from 'node:path'
import { gravarJsonl, lerJson } from '../lib/arquivos.mjs'
import { PASTA_CONFIG, PASTA_FONTES } from '../lib/caminhos.mjs'
import { pareceNaoJuridico, sinais } from '../lib/classificar.mjs'
import { postarJson } from '../lib/http.mjs'
import { normalizarTelefone, normalizarUrl } from '../lib/normalizar.mjs'

const args = process.argv.slice(2)
const opt = (nome, padrao) => {
  const i = args.indexOf('--' + nome)
  return i >= 0 ? args[i + 1] : padrao
}
const UF = (opt('uf', 'BA') || 'BA').toUpperCase()
const NOME_UF = { BA: 'Bahia' }[UF] || UF
const MAX_CIDADES = Number(opt('max-cidades', 60))
const MAX_PAGINAS = Number(opt('max-paginas', 3))
const TERMOS = (
  opt('termos', null) ||
  'advogado tributarista;escritório de advocacia tributária;direito tributário;advocacia empresarial;advogado empresarial'
)
  .split(';')
  .map((t) => t.trim())
  .filter(Boolean)
const CHAVE = process.env.GOOGLE_PLACES_API_KEY || ''
const URL_API = 'https://places.googleapis.com/v1/places:searchText'
const CAMPOS = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.types',
  'places.primaryTypeDisplayName',
  'nextPageToken',
].join(',')

function componente(place, tipo) {
  return (place.addressComponents || []).find((c) => (c.types || []).includes(tipo))
}

async function buscar(textQuery, pageToken) {
  const corpo = { textQuery, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20, ...(pageToken ? { pageToken } : {}) }
  const r = await postarJson(URL_API, corpo, { 'X-Goog-Api-Key': CHAVE, 'X-Goog-FieldMask': CAMPOS }, { ttlDias: 30 })
  if (!r.ok) {
    const msg = r.json?.error?.message || r.texto || `HTTP ${r.status}`
    throw new Error(`Places API: ${msg}`)
  }
  return r.json || {}
}

async function main() {
  if (!CHAVE) {
    console.log('Google Places: GOOGLE_PLACES_API_KEY não definida — pulando esta fonte.')
    console.log('  (crie a chave em https://console.cloud.google.com/google/maps-apis com a "Places API (New)" ativada)')
    return
  }
  let cidades
  if (opt('cidades')) cidades = opt('cidades').split(',').map((s) => s.trim())
  else {
    const ranking = (await lerJson(path.join(PASTA_CONFIG, `municipios-${UF.toLowerCase()}.json`), [])) || []
    cidades = ranking.length ? ranking.slice(0, MAX_CIDADES).map((m) => m.nome) : ['Salvador']
  }
  console.log(`Google Places: ${cidades.length} municípios × ${TERMOS.length} termos (até ${MAX_PAGINAS * 20} resultados cada)`)
  const vistos = new Map()
  let chamadas = 0
  for (const cidade of cidades) {
    for (const termo of TERMOS) {
      const q = `${termo} em ${cidade}, ${NOME_UF}`
      let token = null
      for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
        let resp
        try {
          resp = await buscar(q, token)
          chamadas++
        } catch (e) {
          console.warn('  ! ' + e.message)
          if (/API key|PERMISSION_DENIED|billing|not been used/i.test(e.message)) return
          break
        }
        for (const p of resp.places || []) {
          const uf = componente(p, 'administrative_area_level_1')?.shortText
          if (uf && uf !== UF) continue
          if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue
          const nome = p.displayName?.text || ''
          if (!nome || pareceNaoJuridico(nome)) continue
          const ant = vistos.get(p.id)
          if (ant) {
            ant.categorias = [...new Set([...ant.categorias, termo])]
            continue
          }
          const tel = normalizarTelefone(p.internationalPhoneNumber || p.nationalPhoneNumber)
          vistos.set(p.id, {
            fonte: 'google_places',
            fonte_url: p.googleMapsUri || '',
            nome,
            tipo: null,
            cidade: componente(p, 'administrative_area_level_2')?.longText || cidade,
            uf: UF,
            bairro: componente(p, 'sublocality_level_1')?.longText || componente(p, 'sublocality')?.longText || '',
            endereco: p.formattedAddress || '',
            cep: (componente(p, 'postal_code')?.longText || '').replace(/\D/g, ''),
            telefones: tel ? [tel] : [],
            whatsapp: [],
            emails: [],
            site: normalizarUrl(p.websiteUri) || '',
            google_maps: p.googleMapsUri || '',
            nota_google: p.rating ?? '',
            avaliacoes_google: p.userRatingCount ?? '',
            categorias: [termo, p.primaryTypeDisplayName?.text].filter(Boolean),
            sinais: sinais(`${nome} ${p.primaryTypeDisplayName?.text || ''}`),
          })
        }
        token = resp.nextPageToken
        if (!token) break
      }
    }
    console.log(`  ${cidade}: ${vistos.size} lugares únicos até agora (${chamadas} chamadas)`)
  }
  await gravarJsonl(path.join(PASTA_FONTES, 'google_places.jsonl'), [...vistos.values()])
  console.log(`OK: ${vistos.size} lugares → dados/fontes/google_places.jsonl (${chamadas} chamadas à API)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
