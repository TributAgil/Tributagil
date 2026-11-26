#!/usr/bin/env node
// Fonte: Dados Abertos do CNPJ (Receita Federal).
//
// Baixa a edição mensal mais recente, filtra os estabelecimentos ATIVOS da UF
// com CNAE 6911-7/01 (serviços advocatícios) como atividade principal ou
// secundária, junta razão social (Empresas) e sócios (Socios) e grava
// dados/fontes/cnpj.jsonl — telefone e e-mail do cadastro de cada sociedade.
//
// Uso:
//   node src/fontes/cnpj-receita.mjs                 # baixa e processa (UF=BA)
//   node src/fontes/cnpj-receita.mjs --uf BA --mes 2026-11
//   node src/fontes/cnpj-receita.mjs --pasta /caminho/com/zips   # usa zips já baixados
//   node src/fontes/cnpj-receita.mjs --apagar-zips   # apaga cada zip depois de filtrar
//
// Observação: o telefone/e-mail do CNPJ muitas vezes é o do contador que fez
// o registro. A consolidação marca os contatos repetidos em várias empresas.
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { readdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { pipeline } from 'node:stream/promises'
import yauzl from 'yauzl'
import { garantirPasta, gravarJson, gravarJsonl, separarLinhaCsv } from '../lib/arquivos.mjs'
import { PASTA_BRUTOS, PASTA_CONFIG, PASTA_FONTES } from '../lib/caminhos.mjs'
import { sinais } from '../lib/classificar.mjs'
import { capitalizar, normalizarEmail, normalizarTelefone, semAcento, unicos } from '../lib/normalizar.mjs'

const args = process.argv.slice(2)
const opt = (nome, padrao) => {
  const i = args.indexOf('--' + nome)
  return i >= 0 ? args[i + 1] : padrao
}
const flag = (nome) => args.includes('--' + nome)

const UF = (opt('uf', 'BA') || 'BA').toUpperCase()
const CNAE = opt('cnae', '6911701')
const APAGAR_ZIPS = flag('apagar-zips')
const PARALELO = Number(opt('paralelo', 6))

// Compartilhamento público da Receita (Nextcloud do SERPRO). Se mudar, ver
// https://dados.gov.br/dados/conjuntos-dados/cadastro-nacional-da-pessoa-juridica---cnpj
const WEBDAV = 'https://arquivos.receitafederal.gov.br/public.php/webdav'
const TOKEN_COMPARTILHAMENTO = 'gn672Ad4CF8N6TK'
const AUTH = 'Basic ' + Buffer.from(TOKEN_COMPARTILHAMENTO + ':').toString('base64')

// CNAEs secundários que reforçam o foco tributário/empresarial.
const CNAES_SINAL = {
  6920601: 'contabilidade',
  6920602: 'consultoria e auditoria contábil e tributária',
  7020400: 'consultoria em gestão empresarial',
  8211300: 'serviços combinados de escritório',
  6619399: 'serviços auxiliares financeiros',
}

const NATUREZAS_SOCIEDADE = { 2232: 'Sociedade Simples Pura', 2321: 'Sociedade Unipessoal de Advocacia' }

async function propfind(caminho) {
  const r = await fetch(WEBDAV + caminho, { method: 'PROPFIND', headers: { authorization: AUTH, depth: '1' } })
  if (!r.ok) throw new Error(`PROPFIND ${caminho}: HTTP ${r.status}`)
  const xml = await r.text()
  return [...xml.matchAll(/<d:response>([\s\S]*?)<\/d:response>/g)].map((m) => ({
    href: decodeURIComponent(/<d:href>([^<]+)/.exec(m[1])[1]),
    tamanho: Number(/<d:getcontentlength>(\d+)/.exec(m[1])?.[1] || 0),
  }))
}

async function edicaoMaisRecente() {
  const itens = await propfind('/Dados/Cadastros/CNPJ/')
  const meses = itens.map((i) => /\/(\d{4}-\d{2})\/$/.exec(i.href)?.[1]).filter(Boolean).sort()
  if (!meses.length) throw new Error('nenhuma edição mensal encontrada no compartilhamento da Receita')
  return meses.at(-1)
}

async function baixarArquivo(mes, nome, destino, tamanhoEsperado) {
  let inicio = 0
  if (existsSync(destino)) {
    inicio = (await stat(destino)).size
    if (tamanhoEsperado && inicio >= tamanhoEsperado) return
  }
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    try {
      const r = await fetch(`${WEBDAV}/Dados/Cadastros/CNPJ/${mes}/${nome}`, {
        headers: { authorization: AUTH, ...(inicio ? { range: `bytes=${inicio}-` } : {}) },
      })
      if (!r.ok && r.status !== 206) throw new Error('HTTP ' + r.status)
      await pipeline(r.body, createWriteStream(destino, { flags: inicio && r.status === 206 ? 'a' : 'w' }))
      return
    } catch (e) {
      console.warn(`  ! ${nome}: ${e.message} (tentativa ${tentativa})`)
      inicio = existsSync(destino) ? (await stat(destino)).size : 0
      await new Promise((r) => setTimeout(r, 5000 * tentativa))
    }
  }
  throw new Error('falha ao baixar ' + nome)
}

function abrirZip(arquivo) {
  return new Promise((resolve, reject) => {
    yauzl.open(arquivo, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err)
      zip.readEntry()
      zip.on('entry', (entrada) => {
        zip.openReadStream(entrada, (e2, stream) => (e2 ? reject(e2) : resolve({ zip, stream })))
      })
      zip.on('error', reject)
    })
  })
}

/** Percorre as linhas (latin-1) do arquivo dentro de um zip da Receita. */
async function* linhasDoZip(arquivo) {
  const { zip, stream } = await abrirZip(arquivo)
  stream.setEncoding('latin1')
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const linha of rl) yield linha
  } finally {
    zip.close()
  }
}

async function* linhasDoCsv(arquivo) {
  const rl = readline.createInterface({ input: createReadStream(arquivo, 'utf8'), crlfDelay: Infinity })
  for await (const linha of rl) yield linha
}

const campos = (linha) => separarLinhaCsv(linha, ';')

async function filtrarEstabelecimentos(pasta, arquivosZip) {
  for (const zip of arquivosZip) {
    const saida = zip.replace(/\.zip$/, `.${UF.toLowerCase()}${CNAE}.csv`)
    if (existsSync(saida) && !existsSync(zip)) continue
    if (existsSync(saida) && existsSync(zip)) {
      // já filtrado numa execução anterior
      if (APAGAR_ZIPS) await rm(zip)
      continue
    }
    const tmp = saida + '.parcial'
    const out = createWriteStream(tmp, 'utf8')
    let total = 0
    let ok = 0
    for await (const linha of linhasDoZip(zip)) {
      total++
      if (!linha.includes(`"${UF}"`) || !linha.includes(CNAE)) continue
      const c = campos(linha)
      if (c[19] !== UF || c[5] !== '02') continue // 02 = ativa
      if (c[11] !== CNAE && !c[12].split(',').includes(CNAE)) continue
      out.write(c.map((v) => '"' + v.replace(/"/g, '""') + '"').join(';') + '\n')
      ok++
    }
    await new Promise((r) => out.end(r))
    await rename(tmp, saida)
    console.log(`  ${path.basename(zip)}: ${total.toLocaleString('pt-BR')} linhas, ${ok} selecionadas`)
    if (APAGAR_ZIPS) await rm(zip)
  }
  return (await readdir(pasta)).filter((f) => f.startsWith('Estabelecimentos') && f.endsWith(`.${UF.toLowerCase()}${CNAE}.csv`))
}

// Nomes com acento (a Receita grava "VITORIA DA CONQUISTA"). Usa a API de
// localidades do IBGE; se não responder, fica o nome capitalizado.
async function nomesIbge(uf) {
  try {
    const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
    if (!r.ok) return new Map()
    const lista = await r.json()
    return new Map(lista.map((m) => [semAcento(m.nome).toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim(), m.nome]))
  } catch {
    return new Map()
  }
}

async function tabelaSimples(zip) {
  const mapa = new Map()
  if (!existsSync(zip)) return mapa
  for await (const linha of linhasDoZip(zip)) {
    const [cod, desc] = campos(linha)
    mapa.set(cod, desc)
  }
  return mapa
}

async function main() {
  const pasta = opt('pasta', null)
  let pastaZips = pasta
  if (!pastaZips) {
    const mes = opt('mes', null) || (await edicaoMaisRecente())
    pastaZips = path.join(PASTA_BRUTOS, 'cnpj', mes)
    await garantirPasta(pastaZips)
    console.log(`CNPJ: edição ${mes} → ${pastaZips}`)
    const lista = (await propfind(`/Dados/Cadastros/CNPJ/${mes}/`)).filter((i) => i.href.endsWith('.zip'))
    const queremos = lista.filter((i) => /\/(Estabelecimentos\d|Empresas\d|Socios\d|Municipios|Cnaes|Naturezas|Qualificacoes)\.zip$/.test(i.href))
    const pendentes = []
    for (const i of queremos) {
      const nome = path.basename(i.href)
      const filtrado = path.join(pastaZips, nome.replace(/\.zip$/, `.${UF.toLowerCase()}${CNAE}.csv`))
      if (nome.startsWith('Estabelecimentos') && existsSync(filtrado)) continue
      pendentes.push({ nome, tamanho: i.tamanho })
    }
    const totalMb = Math.round(pendentes.reduce((s, p) => s + p.tamanho, 0) / 1048576)
    console.log(`  baixando ${pendentes.length} arquivos (~${totalMb} MB)…`)
    let i = 0
    await Promise.all(
      Array.from({ length: PARALELO }, async () => {
        while (i < pendentes.length) {
          const p = pendentes[i++]
          await baixarArquivo(mes, p.nome, path.join(pastaZips, p.nome), p.tamanho)
          console.log(`  ✓ ${p.nome}`)
        }
      }),
    )
  }

  const arquivos = await readdir(pastaZips)
  const zipsEstab = arquivos.filter((f) => /^Estabelecimentos\d\.zip$/.test(f)).map((f) => path.join(pastaZips, f))
  console.log('Filtrando estabelecimentos…')
  const filtrados = await filtrarEstabelecimentos(pastaZips, zipsEstab)

  const municipios = await tabelaSimples(path.join(pastaZips, 'Municipios.zip'))
  const ibge = await nomesIbge(UF)
  const nomeCidade = (cod) => {
    const bruto = municipios.get(cod) || cod
    return ibge.get(semAcento(bruto).toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()) || capitalizar(bruto)
  }
  const estabs = []
  for (const f of filtrados)
    for await (const linha of linhasDoCsv(path.join(pastaZips, f))) {
      if (!linha.trim()) continue
      const c = campos(linha)
      if (c[5] === '02' && c[19] === UF) estabs.push(c)
    }
  console.log(`  ${estabs.length} estabelecimentos ativos (${UF}, CNAE ${CNAE})`)
  const basicos = new Set(estabs.map((e) => e[0]))

  console.log('Juntando razão social e sócios…')
  const empresas = new Map()
  for (const f of arquivos.filter((f) => /^Empresas\d\.zip$/.test(f))) {
    for await (const linha of linhasDoZip(path.join(pastaZips, f))) {
      const b = linha.slice(1, 9)
      if (!basicos.has(b)) continue
      const c = campos(linha)
      empresas.set(c[0], { razao: c[1], natureza: c[2], capital: c[4], porte: c[5] })
    }
  }
  const socios = new Map()
  for (const f of arquivos.filter((f) => /^Socios\d\.zip$/.test(f))) {
    for await (const linha of linhasDoZip(path.join(pastaZips, f))) {
      const b = linha.slice(1, 9)
      if (!basicos.has(b)) continue
      const c = campos(linha)
      if (c[1] !== '2') continue // 2 = pessoa física
      if (!socios.has(c[0])) socios.set(c[0], [])
      socios.get(c[0]).push(capitalizar(c[2]))
    }
  }

  const porMunicipio = {}
  const leads = estabs.map((c) => {
    const emp = empresas.get(c[0]) || {}
    const cidade = nomeCidade(c[20])
    porMunicipio[cidade] = (porMunicipio[cidade] || 0) + 1
    const ddd1 = c[21]?.trim()
    const ddd2 = c[23]?.trim()
    const telefones = unicos([
      normalizarTelefone((ddd1 || '') + (c[22] || '')),
      normalizarTelefone((ddd2 || '') + (c[24] || '')),
    ])
    const secundarios = (c[12] || '').split(',').filter(Boolean)
    const sinaisCnae = secundarios.filter((s) => CNAES_SINAL[s]).map((s) => CNAES_SINAL[s])
    const razao = capitalizar(emp.razao || '')
    const fantasia = capitalizar(c[4] || '')
    const cnpj = c[0] + c[1] + c[2]
    const textoSinal = [razao, fantasia, ...sinaisCnae.map((s) => (/tribut/.test(s) ? 'assessoria fiscal tributaria' : s))].join(' ')
    return {
      fonte: 'cnpj',
      fonte_url: `https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp?cnpj=${cnpj}`,
      nome: fantasia || razao,
      razao_social: razao,
      nome_fantasia: fantasia,
      tipo: emp.natureza === '2321' ? 'Advogado (sociedade individual)' : 'Escritório',
      cnpj,
      matriz: c[3] === '1',
      natureza_juridica: NATUREZAS_SOCIEDADE[emp.natureza] || emp.natureza || '',
      porte: { '01': 'ME', '03': 'EPP', '05': 'Demais' }[emp.porte] || '',
      capital_social: emp.capital || '',
      inicio_atividade: c[10] ? `${c[10].slice(6, 8)}/${c[10].slice(4, 6)}/${c[10].slice(0, 4)}` : '',
      cnae_principal: c[11],
      cnaes_sinal: sinaisCnae,
      socios: socios.get(c[0]) || [],
      cidade,
      uf: c[19],
      bairro: capitalizar(c[17] || ''),
      endereco: [capitalizar(`${c[13]} ${c[14]}`.trim()), c[15], capitalizar(c[16] || '')].filter(Boolean).join(', '),
      cep: c[18],
      telefones,
      whatsapp: [],
      emails: unicos([normalizarEmail(c[27])]),
      sinais: sinais(textoSinal),
    }
  })

  await gravarJsonl(path.join(PASTA_FONTES, 'cnpj.jsonl'), leads)
  const ranking = Object.entries(porMunicipio)
    .sort((a, b) => b[1] - a[1])
    .map(([nome, sociedades]) => ({ nome, sociedades }))
  await gravarJson(path.join(PASTA_CONFIG, `municipios-${UF.toLowerCase()}.json`), ranking)
  console.log(`OK: ${leads.length} sociedades → dados/fontes/cnpj.jsonl; ${ranking.length} municípios → config/municipios-${UF.toLowerCase()}.json`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
