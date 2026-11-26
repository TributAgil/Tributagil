// Cliente HTTP "educado" para a coleta: respeita robots.txt, espaça as
// requisições por host, repete em 429/5xx e guarda as respostas em cache
// no disco (re-rodar a coleta não volta a bater nos mesmos sites).
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { RAIZ } from './caminhos.mjs'

export const USER_AGENT = 'Mozilla/5.0 (compatible; ProspeccaoLeads/1.0)'
const PASTA_CACHE = path.join(RAIZ, '.cache', 'http')
const INTERVALO_POR_HOST_MS = Number(process.env.PROSPECCAO_INTERVALO_MS || 1200)
const TIMEOUT_MS = Number(process.env.PROSPECCAO_TIMEOUT_MS || 15000)
const TAMANHO_MAXIMO = 3 * 1024 * 1024

const ultimoAcesso = new Map() // host -> timestamp
const filaPorHost = new Map() // host -> Promise (serializa por host)
const robotsPorHost = new Map() // host -> Promise<string[]> (prefixos proibidos)

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

function chaveCache(url, extra = '') {
  return createHash('sha1').update(url + '\n' + extra).digest('hex')
}

async function lerCache(chave, ttlDias) {
  try {
    const bruto = JSON.parse(await readFile(path.join(PASTA_CACHE, chave.slice(0, 2), chave + '.json'), 'utf8'))
    if (ttlDias != null && Date.now() - bruto.quando > ttlDias * 864e5) return null
    return bruto
  } catch {
    return null
  }
}

async function gravarCache(chave, dados) {
  const pasta = path.join(PASTA_CACHE, chave.slice(0, 2))
  await mkdir(pasta, { recursive: true })
  await writeFile(path.join(pasta, chave + '.json'), JSON.stringify(dados))
}

// Espera a vez do host (uma requisição por vez e intervalo mínimo entre elas).
function naVezDoHost(host, tarefa) {
  const anterior = filaPorHost.get(host) || Promise.resolve()
  const atual = anterior
    .catch(() => {})
    .then(async () => {
      const espera = (ultimoAcesso.get(host) || 0) + INTERVALO_POR_HOST_MS - Date.now()
      if (espera > 0) await dormir(espera)
      try {
        return await tarefa()
      } finally {
        ultimoAcesso.set(host, Date.now())
      }
    })
  filaPorHost.set(host, atual)
  return atual
}

async function lerCorpoLimitado(resp) {
  const leitor = resp.body?.getReader?.()
  if (!leitor) return await resp.text()
  const partes = []
  let total = 0
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    total += value.length
    if (total > TAMANHO_MAXIMO) {
      leitor.cancel().catch(() => {})
      break
    }
    partes.push(value)
  }
  const buf = Buffer.concat(partes.map((p) => Buffer.from(p)))
  const tipo = resp.headers.get('content-type') || ''
  const charset = /charset=([\w-]+)/i.exec(tipo)?.[1]?.toLowerCase()
  if (charset && /iso-8859-1|latin1|windows-1252/.test(charset)) return new TextDecoder('latin1').decode(buf)
  return new TextDecoder('utf-8').decode(buf)
}

async function fetchComTimeout(url, opcoes = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      redirect: 'follow',
      ...opcoes,
      headers: {
        'user-agent': USER_AGENT,
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.5',
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        ...(opcoes.headers || {}),
      },
      signal: ctrl.signal,
    })
  } finally {
    clearTimeout(t)
  }
}

// robots.txt: só as regras de "User-agent: *" (suficiente para coleta leve).
async function prefixosProibidos(origem) {
  if (!robotsPorHost.has(origem)) {
    robotsPorHost.set(
      origem,
      (async () => {
        try {
          const r = await fetchComTimeout(origem + '/robots.txt')
          if (!r.ok) return []
          const txt = await lerCorpoLimitado(r)
          const proibidos = []
          let valeParaNos = false
          for (const linhaBruta of txt.split(/\r?\n/)) {
            const linha = linhaBruta.replace(/#.*/, '').trim()
            const m = /^([\w-]+)\s*:\s*(.*)$/.exec(linha)
            if (!m) continue
            const campo = m[1].toLowerCase()
            const valor = m[2].trim()
            if (campo === 'user-agent') valeParaNos = valor === '*' || /prospeccaoleads/i.test(valor)
            else if (campo === 'disallow' && valeParaNos && valor) proibidos.push(valor)
          }
          return proibidos
        } catch {
          return []
        }
      })(),
    )
  }
  return robotsPorHost.get(origem)
}

export async function permitidoPorRobots(url) {
  const u = new URL(url)
  const proibidos = await prefixosProibidos(u.origin)
  const caminho = u.pathname + u.search
  return !proibidos.some((p) => {
    if (p === '/') return true
    const re = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'))
    return re.test(caminho)
  })
}

/**
 * Baixa uma página (GET) com cache, robots.txt e limite por host.
 * Retorna { ok, status, url, texto, deCache, erro }.
 */
export async function baixar(url, { ttlDias = 30, respeitarRobots = true, cache = true } = {}) {
  const chave = chaveCache(url)
  if (cache) {
    const c = await lerCache(chave, ttlDias)
    if (c) return { ...c.resposta, deCache: true }
  }
  let u
  try {
    u = new URL(url)
  } catch {
    return { ok: false, status: 0, url, texto: '', erro: 'url inválida' }
  }
  if (respeitarRobots && !(await permitidoPorRobots(url))) {
    return { ok: false, status: 0, url, texto: '', erro: 'bloqueado por robots.txt' }
  }
  const resposta = await naVezDoHost(u.host, async () => {
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const r = await fetchComTimeout(url)
        if ((r.status === 429 || r.status >= 500) && tentativa < 3) {
          await dormir(2000 * tentativa)
          continue
        }
        const tipo = r.headers.get('content-type') || ''
        const texto = /text|json|xml|html/.test(tipo) || !tipo ? await lerCorpoLimitado(r) : ''
        return { ok: r.ok, status: r.status, url: r.url || url, texto }
      } catch (e) {
        const codigo = String(e?.cause?.code || e?.message || e)
        // DNS inexistente, conexão recusada ou certificado inválido não melhoram repetindo.
        const definitivo = /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|CERT|SSL|ERR_TLS|UNABLE_TO_VERIFY|self.signed|ERR_INVALID_URL/i.test(codigo)
        if (tentativa === 3 || definitivo) return { ok: false, status: 0, url, texto: '', erro: codigo }
        await dormir(1500 * tentativa)
      }
    }
  })
  // Erros de rede não vão para o cache (podem ser passageiros); 4xx/2xx vão.
  if (cache && resposta.status) await gravarCache(chave, { quando: Date.now(), resposta })
  return resposta
}

/** POST JSON (sem robots, para APIs oficiais como a do Google Places). */
export async function postarJson(url, corpo, headers = {}, { ttlDias = 30, cache = true } = {}) {
  const chave = chaveCache(url, JSON.stringify(corpo) + JSON.stringify(Object.keys(headers)))
  if (cache) {
    const c = await lerCache(chave, ttlDias)
    if (c) return { ...c.resposta, deCache: true }
  }
  const u = new URL(url)
  const resposta = await naVezDoHost(u.host, async () => {
    const r = await fetchComTimeout(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(corpo),
    })
    const texto = await r.text()
    let json = null
    try {
      json = JSON.parse(texto)
    } catch {
      /* resposta não-JSON */
    }
    return { ok: r.ok, status: r.status, json, texto: json ? '' : texto.slice(0, 2000) }
  })
  if (cache && resposta.ok) await gravarCache(chave, { quando: Date.now(), resposta })
  return resposta
}

/** Executa `fn` sobre `itens` com no máximo `n` em paralelo. */
export async function emParalelo(itens, n, fn) {
  const resultados = new Array(itens.length)
  let i = 0
  const trabalhadores = Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) {
      const atual = i++
      resultados[atual] = await fn(itens[atual], atual)
    }
  })
  await Promise.all(trabalhadores)
  return resultados
}
