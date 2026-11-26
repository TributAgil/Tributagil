// Normalização de nomes, telefones, e-mails e domínios — base da
// deduplicação entre fontes.

export function semAcento(s = '') {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const PALAVRAS_GENERICAS = new Set(
  (
    'advogados advogado advogada advogadas associados associadas advocacia advocacias adv advs ' +
    'sociedade sociedades individual unipessoal de da do das dos e em & s/s ss s/c sc ltda eireli me epp ' +
    'escritorio juridico juridica consultoria assessoria consultores servicos dr dra the law firm group grupo'
  ).split(/\s+/),
)

/** Chave para comparar nomes de escritórios/advogados entre fontes. */
export function chaveNome(nome = '') {
  const tokens = semAcento(nome)
    .toLowerCase()
    .replace(/\bem\s+[a-z ]+$/, '') // Telelistas: "Fulano Advocacia em Pituba"
    .replace(/[^a-z0-9& ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !PALAVRAS_GENERICAS.has(t))
  return tokens.join(' ')
}

/** "FULANO DE TAL ADVOGADOS" -> "Fulano de Tal Advogados" */
export function capitalizar(nome = '') {
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em'])
  const siglas = new Set(['ltda', 'eireli', 'me', 'epp', 'ss', 'oab', 'cnpj', 'ba', 'sa'])
  return String(nome)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((p, i) => {
      if (siglas.has(p.replace(/[^a-z]/g, ''))) return p.toUpperCase()
      if (i > 0 && minusculas.has(p)) return p
      return p.charAt(0).toUpperCase() + p.slice(1)
    })
    .join(' ')
}

// DDDs válidos no Brasil (Anatel).
const DDDS = new Set(
  '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(
    ' ',
  ),
)
export const DDDS_BAHIA = new Set(['71', '73', '74', '75', '77'])

/**
 * Normaliza um telefone brasileiro para "55DDNNNNNNNN(N)". Retorna null se
 * não parecer um número válido. `dddPadrao` completa números sem DDD.
 */
export function normalizarTelefone(bruto, dddPadrao = null) {
  if (bruto == null) return null
  let d = String(bruto).replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('0800') || d.startsWith('800')) return null
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 11 && d.startsWith('0') && !d.startsWith('09')) d = d.slice(1) // 0 + DDD + 8 dígitos
  if (d.length === 12 && d.startsWith('0')) d = d.slice(1) // 0 + DDD + 9 dígitos
  if ((d.length === 8 || d.length === 9) && dddPadrao) d = dddPadrao + d
  if (d.length !== 10 && d.length !== 11) return null
  const ddd = d.slice(0, 2)
  if (!DDDS.has(ddd)) return null
  const assinante = d.slice(2)
  if (assinante.length === 9 && assinante[0] !== '9') return null
  if (assinante.length === 8 && !/^[2-5]/.test(assinante)) {
    // 8 dígitos começando com 6-9 = celular antigo sem o 9 → completa
    if (/^[6-9]/.test(assinante)) return '55' + ddd + '9' + assinante
    return null
  }
  if (/^(\d)\1+$/.test(assinante)) return null // 99999-9999 etc.
  return '55' + d
}

export function ehCelular(tel55) {
  return typeof tel55 === 'string' && tel55.length === 13 && tel55[4] === '9'
}

export function formatarTelefone(tel55) {
  if (!tel55) return ''
  const d = tel55.replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return tel55
}

export function linkWhatsapp(tel55) {
  return tel55 ? `https://wa.me/${tel55}` : ''
}

export const PROVEDORES_EMAIL_GENERICOS = new Set(
  (
    'gmail.com hotmail.com hotmail.com.br outlook.com outlook.com.br live.com msn.com yahoo.com yahoo.com.br ' +
    'bol.com.br uol.com.br terra.com.br ig.com.br globo.com globomail.com icloud.com me.com oi.com.br r7.com ' +
    'zipmail.com.br protonmail.com proton.me aol.com gmx.com yandex.com mail.com superig.com.br click21.com.br ' +
    'brturbo.com.br pop.com.br'
  ).split(/\s+/),
)

export function normalizarEmail(bruto) {
  if (!bruto) return null
  const e = String(bruto).trim().toLowerCase().replace(/^mailto:/, '').split('?')[0]
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return null
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(e)) return null
  const dominio = e.split('@')[1]
  if (/(^|\.)((sentry|wixpress|sentry-next)\.(io|com)|example\.(com|org)|domain\.com|email\.com|seudominio|seuemail|exemplo\.com|empresa\.com|yourdomain|teste\.com)/.test(dominio))
    return null
  return e
}

/** Domínio "registrável" aproximado, sem www. Ex.: https://www.x.adv.br/a -> x.adv.br */
export function dominioDe(url) {
  if (!url) return null
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : 'http://' + url)
    return u.hostname.replace(/^www\d?\./, '').toLowerCase()
  } catch {
    return null
  }
}

/** Domínio do e-mail, se não for de provedor genérico (pode ser o site do escritório). */
export function dominioProprioDoEmail(email) {
  const d = email?.split('@')[1]
  if (!d || PROVEDORES_EMAIL_GENERICOS.has(d)) return null
  return d
}

// Domínios que não são "site do escritório" (diretórios, redes sociais, encurtadores...).
const DOMINIOS_NAO_SITE =
  /(^|\.)(facebook|fb|instagram|linkedin|twitter|x|youtube|youtu|tiktok|wa|whatsapp|google|goo|bit|linktr|linktree|jusbrasil|telelistas|listamais|juridicocerto|escavador|analise|migalhas|conjur|apontador|guiamais|wix|wixsite|blogspot|wordpress|canva|beacons|taplink|bio|linkbio|msha|sites\.google|cutt|tinyurl|ow|lnk|calendly|doctoralia|econodata|cnpj|casadosdados|oab|gov|jus)\.[a-z.]+$/i

export function ehSiteProprio(url) {
  const d = dominioDe(url)
  if (!d) return false
  if (/\.(gov|jus|mp|leg)\.br$/.test(d)) return false
  return !DOMINIOS_NAO_SITE.test(d)
}

export function normalizarUrl(url) {
  if (!url) return null
  let s = String(url).trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '')
  try {
    const u = new URL(s)
    u.hash = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function unicos(lista) {
  return [...new Set(lista.filter(Boolean))]
}
