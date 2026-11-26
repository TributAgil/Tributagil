// Extração de contatos de uma página HTML: e-mails (inclusive os protegidos
// pelo Cloudflare), telefones, links de WhatsApp e perfis em redes sociais.
import { normalizarEmail, normalizarTelefone, unicos } from './normalizar.mjs'

function decodificarCfEmail(hex) {
  try {
    const chave = parseInt(hex.slice(0, 2), 16)
    let s = ''
    for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ chave)
    return s
  } catch {
    return null
  }
}

function decodificarEntidades(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export function textoVisivel(html = '') {
  return decodificarEntidades(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

export function tituloDaPagina(html = '') {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return m ? decodificarEntidades(m[1]).replace(/\s+/g, ' ').trim() : ''
}

export function linksDaPagina(html, base) {
  const links = []
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodificarEntidades(m[1].trim())
    let abs = href
    try {
      abs = new URL(href, base).toString()
    } catch {
      /* mailto:, tel:, javascript: ... */
    }
    links.push({ href: abs, texto: textoVisivel(m[2]).slice(0, 120) })
  }
  return links
}

const RE_EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi
// (71) 3333-4444 | 71 99999-8888 | +55 (71) 9 9999-8888 | 071 3333 4444 | 71.3333.4444
const RE_TEL =
  /(?:\+?55[\s.-]?)?(?:\(?0?(\d{2})\)?[\s.-]?)(9[\s.-]?\d{4}|[2-5]\d{3})[\s.-]?(\d{4})(?!\d)/g

const IG_RESERVADOS = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'share', 'direct', 'about', 'developer', 'legal', 'web'])
const FB_RESERVADOS = new Set(['sharer', 'sharer.php', 'share', 'plugins', 'tr', 'dialog', 'login', 'policy.php', 'help', 'pages', 'events', 'groups', 'watch', 'profile.php'])

/**
 * Extrai contatos de um HTML. `dddPadrao` completa telefones sem DDD.
 * Retorna listas sem repetição: emails, telefones (55DD...), whatsapp
 * (55DD...), instagram, linkedin, facebook (URLs canônicas).
 */
export function extrairContatos(html = '', base = 'https://exemplo.invalid/', { dddPadrao = null } = {}) {
  const emails = []
  const telefones = []
  const whatsapp = []
  const instagram = []
  const linkedin = []
  const facebook = []

  for (const m of html.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) emails.push(decodificarCfEmail(m[1]))
  for (const m of html.matchAll(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi)) emails.push(decodificarCfEmail(m[1]))
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) emails.push(decodeURIComponent(m[1]))
  const texto = textoVisivel(html)
  for (const m of texto.matchAll(RE_EMAIL)) emails.push(m[0])
  // e-mails "escondidos" como fulano [at] dominio.com.br
  for (const m of texto.matchAll(/([a-z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\[arroba\]|\(arroba\))\s*([a-z0-9.-]+\.[a-z]{2,})/gi))
    emails.push(m[1] + '@' + m[2])

  for (const m of html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) telefones.push(normalizarTelefone(decodeURIComponent(m[1]), dddPadrao))
  for (const m of texto.matchAll(RE_TEL)) telefones.push(normalizarTelefone(m[0], dddPadrao))

  const htmlDecodificado = decodificarEntidades(html)
  for (const m of htmlDecodificado.matchAll(/(?:wa\.me|api\.whatsapp\.com\/send|web\.whatsapp\.com\/send|whatsapp:\/\/send|chat\.whatsapp\.com)[^"'\s<>]*/gi)) {
    const s = m[0]
    const num = /wa\.me\/\+?(\d{10,13})/i.exec(s)?.[1] || /phone=\+?(\d{10,13})/i.exec(s)?.[1]
    if (num) whatsapp.push(normalizarTelefone(num, dddPadrao))
  }

  for (const m of htmlDecodificado.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]{2,30})\/?(?=["'?\s<#]|$)/g)) {
    const h = m[1].toLowerCase()
    if (!IG_RESERVADOS.has(h)) instagram.push('https://www.instagram.com/' + h)
  }
  for (const m of htmlDecodificado.matchAll(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(company|in|school)\/([A-Za-z0-9\-_%.]{2,100})\/?/g))
    linkedin.push(`https://www.linkedin.com/${m[1]}/${m[2].replace(/\/$/, '')}`)
  for (const m of htmlDecodificado.matchAll(/https?:\/\/(?:www\.|m\.|pt-br\.)?facebook\.com\/([A-Za-z0-9.\-_]{3,80})\/?(?=["'?\s<#]|$)/g)) {
    const h = m[1]
    if (!FB_RESERVADOS.has(h.toLowerCase())) facebook.push('https://www.facebook.com/' + h)
  }

  return {
    emails: unicos(emails.map(normalizarEmail)),
    telefones: unicos(telefones),
    whatsapp: unicos(whatsapp),
    instagram: unicos(instagram),
    linkedin: unicos(linkedin),
    facebook: unicos(facebook),
  }
}

/** Links internos que costumam ter contato/equipe/áreas de atuação. */
export function paginasInteressantes(html, base, limite = 6) {
  const origem = new URL(base).origin
  const pontuar = (href, texto) => {
    const alvo = semAcentoMin(href + ' ' + texto)
    let p = 0
    if (/contato|fale-conosco|fale conosco|contact|atendimento/.test(alvo)) p += 5
    if (/equipe|advogad|socios|profissionais|quem-somos|quem somos|sobre|team|nosso/.test(alvo)) p += 3
    if (/atuacao|areas|tribut|servicos|especialidade|expertise|praticas/.test(alvo)) p += 3
    if (/blog|artigo|noticia|post|tag|categoria|page\/\d|wp-|\.pdf|\.jpg|login|carrinho|politica|privacidade|termos/.test(alvo)) p -= 4
    return p
  }
  const vistos = new Set()
  return linksDaPagina(html, base)
    .filter((l) => l.href.startsWith(origem))
    .map((l) => ({ url: l.href.split('#')[0], p: pontuar(l.href.slice(origem.length), l.texto) }))
    .filter((l) => l.p > 0 && !vistos.has(l.url) && vistos.add(l.url))
    .sort((a, b) => b.p - a.p)
    .slice(0, limite)
    .map((l) => l.url)
}

function semAcentoMin(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
