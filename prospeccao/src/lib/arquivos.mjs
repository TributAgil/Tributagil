import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'

export async function garantirPasta(p) {
  await mkdir(p, { recursive: true })
}

export async function lerJson(arquivo, padrao = null) {
  try {
    return JSON.parse(await readFile(arquivo, 'utf8'))
  } catch {
    return padrao
  }
}

export async function gravarJson(arquivo, dados) {
  await garantirPasta(path.dirname(arquivo))
  await writeFile(arquivo, JSON.stringify(dados, null, 2) + '\n')
}

export async function lerJsonl(arquivo) {
  const itens = []
  try {
    const rl = readline.createInterface({ input: createReadStream(arquivo, 'utf8'), crlfDelay: Infinity })
    for await (const linha of rl) if (linha.trim()) itens.push(JSON.parse(linha))
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  return itens
}

export async function gravarJsonl(arquivo, itens) {
  await garantirPasta(path.dirname(arquivo))
  await writeFile(arquivo, itens.map((i) => JSON.stringify(i)).join('\n') + (itens.length ? '\n' : ''))
}

export async function listar(pasta, filtro = () => true) {
  try {
    return (await readdir(pasta)).filter(filtro).map((f) => path.join(pasta, f))
  } catch {
    return []
  }
}

// CSV com aspas, separador detectado (; ou ,). Suficiente para planilhas
// exportadas do Excel/Google Sheets e para os arquivos da Receita.
export function separarLinhaCsv(linha, sep) {
  const campos = []
  let atual = ''
  let entreAspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (entreAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') {
          atual += '"'
          i++
        } else entreAspas = false
      } else atual += c
    } else if (c === '"') entreAspas = true
    else if (c === sep) {
      campos.push(atual)
      atual = ''
    } else atual += c
  }
  campos.push(atual)
  return campos
}

export async function lerCsv(arquivo) {
  const texto = (await readFile(arquivo, 'utf8')).replace(/^﻿/, '')
  const linhas = juntarLinhasComQuebra(texto.split(/\r?\n/)).filter((l) => l.trim())
  if (!linhas.length) return []
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ','
  const cab = separarLinhaCsv(linhas[0], sep).map((c) => c.trim())
  return linhas.slice(1).map((l) => {
    const v = separarLinhaCsv(l, sep)
    return Object.fromEntries(cab.map((c, i) => [c, (v[i] ?? '').trim()]))
  })
}

// Junta linhas físicas quando um campo entre aspas contém quebra de linha.
function juntarLinhasComQuebra(linhas) {
  const out = []
  let buf = null
  for (const l of linhas) {
    const s = buf == null ? l : buf + '\n' + l
    if (((s.match(/"/g) || []).length % 2) === 1) buf = s
    else {
      out.push(s)
      buf = null
    }
  }
  if (buf != null) out.push(buf)
  return out
}

export function paraCsv(linhas, colunas, sep = ';') {
  const esc = (v) => {
    const s = v == null ? '' : Array.isArray(v) ? v.join(' | ') : String(v)
    return /["\n\r;,]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  return '﻿' + [colunas.join(sep), ...linhas.map((l) => colunas.map((c) => esc(l[c])).join(sep))].join('\r\n') + '\r\n'
}
