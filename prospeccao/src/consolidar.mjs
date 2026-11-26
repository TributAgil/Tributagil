#!/usr/bin/env node
// Consolidação: junta todas as fontes, remove duplicados, classifica o foco
// (tributário / empresarial / geral), escolhe o melhor contato e exporta a
// planilha final em saida/ (XLSX com abas + CSVs).
//
// Entradas:
//   dados/fontes/*.jsonl   — saída dos coletores (cnpj, telelistas, google_places, ...)
//   dados/entrada/*.csv    — leads adicionados à mão ou por pesquisa web
//                            (ver config/modelo-entrada.csv)
//   dados/sites.jsonl      — saída do enriquecimento pelos sites
//
// Uso: node src/consolidar.mjs [--uf BA]
import path from 'node:path'
import ExcelJS from 'exceljs'
import { garantirPasta, lerCsv, lerJsonl, listar, paraCsv } from './lib/arquivos.mjs'
import { PASTA_DADOS, PASTA_ENTRADA, PASTA_FONTES, PASTA_SAIDA } from './lib/caminhos.mjs'
import { focoDoLead, pareceNaoJuridico, sinais, somarSinais } from './lib/classificar.mjs'
import { NAO_E_SITE_DO_ESCRITORIO } from './enriquecer.mjs'
import {
  DDDS_BAHIA,
  capitalizar,
  chaveNome,
  dominioDe,
  dominioProprioDoEmail,
  ehCelular,
  ehSiteProprio,
  formatarTelefone,
  linkWhatsapp,
  normalizarEmail,
  normalizarTelefone,
  normalizarUrl,
  semAcento,
  unicos,
} from './lib/normalizar.mjs'
import { writeFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const opt = (nome, padrao) => {
  const i = args.indexOf('--' + nome)
  return i >= 0 ? args[i + 1] : padrao
}
const UF = (opt('uf', 'BA') || 'BA').toUpperCase()
const HOJE = new Date().toISOString().slice(0, 10)

const ROTULO_FONTE = {
  cnpj: 'Receita Federal (CNPJ)',
  telelistas: 'TeleListas',
  google_places: 'Google Maps',
  busca_web: 'Pesquisa web',
  jusbrasil: 'Jusbrasil (via busca)',
  analise_dna: 'Análise DNA',
  manual: 'Manual',
  site: 'Site do escritório',
}
// Preferência para escolher o nome exibido.
const ORDEM_NOME = ['manual', 'busca_web', 'analise_dna', 'jusbrasil', 'google_places', 'telelistas', 'cnpj']

const lista = (v) =>
  Array.isArray(v)
    ? v
    : String(v || '')
        .split(/\s*[|;,]\s*|\s+\/\s+/)
        .map((s) => s.trim())
        .filter(Boolean)

/** Converte uma linha de CSV manual para o formato dos coletores. */
function deCsv(l, arquivo) {
  const ddd = null
  return {
    fonte: (l.fonte || 'manual').toLowerCase().replace(/\s+/g, '_'),
    fonte_url: l.fonte_url || l.url_fonte || '',
    nome: l.nome || '',
    tipo: l.tipo || null,
    cidade: l.cidade || '',
    uf: (l.uf || UF).toUpperCase(),
    bairro: l.bairro || '',
    endereco: l.endereco || '',
    cep: (l.cep || '').replace(/\D/g, ''),
    telefones: lista(l.telefone || l.telefones).map((t) => normalizarTelefone(t, ddd)),
    whatsapp: lista(l.whatsapp).map((t) => normalizarTelefone(t, ddd)),
    emails: lista(l.email || l.emails).map(normalizarEmail),
    site: normalizarUrl(l.site) || '',
    instagram: l.instagram ? (/^https?:/.test(l.instagram) ? l.instagram : 'https://www.instagram.com/' + l.instagram.replace(/^@/, '')) : '',
    linkedin: l.linkedin || '',
    facebook: l.facebook || '',
    oab: l.oab || '',
    cnpj: (l.cnpj || '').replace(/\D/g, ''),
    categorias: lista(l.areas || l.categorias),
    observacao: l.observacao || '',
    arquivo_origem: path.basename(arquivo),
    // Áreas do Jusbrasil são autodeclaradas e costumam vir várias juntas:
    // contam como sinal fraco de tributário (a não ser que a observação traga mais).
    sinais:
      (l.fonte || '').toLowerCase() === 'jusbrasil' && !/comiss|tributarist|especialista/i.test(l.observacao || '')
        ? { tributario: 2.5, empresarial: /empresar/i.test(l.areas || '') ? 3 : 0, termos: ['tributário (perfil Jusbrasil)'] }
        : sinais(`${l.nome || ''} ${l.areas || ''} ${l.observacao || ''}`),
  }
}

class Uniao {
  constructor(n) {
    this.p = Array.from({ length: n }, (_, i) => i)
  }
  achar(i) {
    while (this.p[i] !== i) i = this.p[i] = this.p[this.p[i]]
    return i
  }
  unir(a, b) {
    const ra = this.achar(a)
    const rb = this.achar(b)
    if (ra !== rb) this.p[rb] = ra
  }
}

function pareceNomeDePessoa(nome) {
  const n = semAcento(nome).toLowerCase()
  if (/advogad|advocacia|associad|escritorio|consult|assessor|sociedade|&| e cia|ltda|juridic|law|group|partners/.test(n)) return false
  const palavras = nome.trim().split(/\s+/)
  return palavras.length >= 2 && palavras.length <= 6
}

function tipoFinal(registros, nome) {
  const cnpj = registros.find((r) => r.fonte === 'cnpj' && r.tipo === 'Escritório') || registros.find((r) => r.fonte === 'cnpj')
  const manual = registros.find((r) => r.tipo && r.fonte !== 'cnpj')
  if (cnpj?.tipo === 'Escritório' && chaveNome(nome) === chaveNome(cnpj.nome_fantasia || cnpj.razao_social)) return 'Escritório'
  if (manual?.tipo) {
    const t = semAcento(manual.tipo).toLowerCase()
    if (/escrit|sociedade|firma/.test(t)) return 'Escritório'
    if (/advog|individual|autonom/.test(t)) return 'Advogado(a)'
  }
  // Sociedade individual que se apresenta como banca ("X & Y Advogados Associados").
  if (cnpj?.tipo?.startsWith('Advogado') && /advogados|associad|\s&\s/i.test(nome)) return 'Escritório'
  if (cnpj?.tipo?.startsWith('Advogado')) return 'Advogado(a) — sociedade individual'
  if (pareceNomeDePessoa(nome)) return 'Advogado(a)'
  return 'Escritório'
}

async function main() {
  const registros = []
  for (const a of await listar(PASTA_FONTES, (f) => f.endsWith('.jsonl'))) registros.push(...(await lerJsonl(a)))
  for (const a of await listar(PASTA_ENTRADA, (f) => f.endsWith('.csv'))) for (const l of await lerCsv(a)) if (l.nome) registros.push(deCsv(l, a))
  const sites = new Map((await lerJsonl(path.join(PASTA_DADOS, 'sites.jsonl'))).filter((s) => !s.erro).map((s) => [s.dominio, s]))
  console.log(`Consolidação: ${registros.length} registros de ${new Set(registros.map((r) => r.fonte)).size} fontes; ${sites.size} sites lidos`)

  for (const r of registros) {
    r.telefones = unicos(r.telefones || [])
    r.whatsapp = unicos(r.whatsapp || [])
    r.emails = unicos((r.emails || []).map(normalizarEmail))
    r.site = normalizarUrl(r.site) || ''
    if (r.site && !ehSiteProprio(r.site)) {
      // link de rede social/diretório no campo "site": move para o campo certo
      if (/instagram\.com/.test(r.site) && !r.instagram) r.instagram = r.site
      else if (/linkedin\.com/.test(r.site) && !r.linkedin) r.linkedin = r.site
      else if (/facebook\.com/.test(r.site) && !r.facebook) r.facebook = r.site
      r.site = ''
    }
  }

  // Contatos do CNPJ repetidos em 3+ empresas diferentes = provavelmente do contador.
  const usoTel = new Map()
  const usoEmail = new Map()
  for (const r of registros.filter((r) => r.fonte === 'cnpj')) {
    const b = r.cnpj.slice(0, 8)
    for (const t of r.telefones) usoTel.set(t, (usoTel.get(t) || new Set()).add(b))
    for (const e of r.emails) usoEmail.set(e, (usoEmail.get(e) || new Set()).add(b))
  }
  const telCompartilhado = (t) => (usoTel.get(t)?.size || 0) >= 3
  const emailCompartilhado = (e) => (usoEmail.get(e)?.size || 0) >= 3

  // Nome de cidade com acento quando alguma fonte o tiver ("Ilheus" -> "Ilhéus").
  const cidadeComAcento = new Map()
  for (const r of registros) {
    if (!r.cidade) continue
    const k = semAcento(r.cidade).toLowerCase()
    const atual = cidadeComAcento.get(k)
    if (!atual || (semAcento(atual) === atual && semAcento(r.cidade) !== r.cidade)) cidadeComAcento.set(k, r.cidade)
  }
  for (const r of registros) if (r.cidade) r.cidade = cidadeComAcento.get(semAcento(r.cidade).toLowerCase())

  // Domínio de e-mail usado por 3+ sociedades diferentes: ou é de um escritório
  // (sócios com sociedade individual usando o e-mail da banca) ou de um
  // contador. Decide pelo site: se o site é jurídico, une os leads; se não, os
  // e-mails desse domínio são tratados como contato do contador.
  const basicosPorDominio = new Map()
  for (const r of registros.filter((r) => r.fonte === 'cnpj'))
    for (const e of r.emails) {
      const d = dominioProprioDoEmail(e)
      if (d) basicosPorDominio.set(d, (basicosPorDominio.get(d) || new Set()).add(r.cnpj.slice(0, 8)))
    }
  const dominioDeContador = (d) => {
    if (!d) return false
    if (NAO_E_SITE_DO_ESCRITORIO.test(d)) return true
    if ((basicosPorDominio.get(d)?.size || 0) < 3) return false
    return !sites.get(d)?.juridico
  }
  const emailDeContador = (e) =>
    emailCompartilhado(e) || dominioDeContador(dominioProprioDoEmail(e)) || /contab|contador|contadora|escritorio\.?contabil|\bcont\.|fiscal\.cont|dpessoal|departamentopessoal/.test(e.split('@')[0])

  // Deduplicação por chaves fortes.
  const u = new Uniao(registros.length)
  const indice = new Map()
  const ligar = (chave, i) => {
    if (!chave) return
    if (indice.has(chave)) u.unir(indice.get(chave), i)
    else indice.set(chave, i)
  }
  registros.forEach((r, i) => {
    if (r.cnpj) ligar('cnpj:' + r.cnpj.slice(0, 8), i)
    if (r.site) ligar('dom:' + dominioDe(r.site), i)
    for (const e of r.emails) {
      if (emailDeContador(e)) continue
      ligar('email:' + e, i)
      const d = dominioProprioDoEmail(e)
      if (d) ligar('dom:' + d, i)
    }
    for (const t of [...r.telefones, ...r.whatsapp]) if (!telCompartilhado(t)) ligar('tel:' + t, i)
    const nomeBom = (k) => (k.length >= 8 && k.includes(' ')) || k.length >= 10
    const cn = chaveNome(r.nome)
    if (nomeBom(cn)) ligar('nome:' + cn + '@' + semAcento(r.cidade || '').toLowerCase(), i)
    if (r.razao_social) {
      const cr = chaveNome(r.razao_social)
      if (nomeBom(cr)) ligar('nome:' + cr + '@' + semAcento(r.cidade || '').toLowerCase(), i)
    }
    if (r.instagram) ligar('ig:' + r.instagram.toLowerCase().replace(/\/$/, ''), i)
  })
  // Pessoa achada na web/Jusbrasil que é sócia de uma sociedade do CNPJ na
  // mesma cidade (todos os nomes dela no nome do sócio, mesmo primeiro nome,
  // 3+ nomes e um único candidato): junta com a sociedade.
  const sociosPorCidade = new Map()
  registros.forEach((r, i) => {
    if (r.fonte !== 'cnpj') return
    const c = semAcento(r.cidade || '').toLowerCase()
    if (!sociosPorCidade.has(c)) sociosPorCidade.set(c, [])
    for (const nomeSocio of r.socios || []) sociosPorCidade.get(c).push({ i, tokens: chaveNome(nomeSocio).split(' ') })
  })
  registros.forEach((r, i) => {
    if (r.fonte === 'cnpj' || r.cnpj || !pareceNomeDePessoa(r.nome.replace(/\s*\(.*\)\s*/, ''))) return
    const t = chaveNome(r.nome.replace(/\s*\(.*\)\s*/, '')).split(' ').filter(Boolean)
    if (t.length < 3) return
    const candidatos = (sociosPorCidade.get(semAcento(r.cidade || '').toLowerCase()) || []).filter(
      (s) => s.tokens[0] === t[0] && t.every((w) => s.tokens.includes(w)),
    )
    const distintos = [...new Set(candidatos.map((c) => u.achar(c.i)))]
    if (distintos.length === 1) u.unir(distintos[0], i)
  })

  const grupos = new Map()
  registros.forEach((r, i) => {
    const g = u.achar(i)
    if (!grupos.has(g)) grupos.set(g, [])
    grupos.get(g).push(r)
  })

  const leads = []
  for (const regs of grupos.values()) {
    regs.sort((a, b) => ORDEM_NOME.indexOf(a.fonte) - ORDEM_NOME.indexOf(b.fonte))
    // Entre vários CNPJs do mesmo grupo (escritório + sociedades individuais dos
    // sócios, matriz + filiais), o principal é a sociedade "Escritório" matriz.
    const cnpjReg = regs
      .filter((r) => r.fonte === 'cnpj')
      .sort((a, b) => (a.tipo === 'Escritório' ? 0 : 1) - (b.tipo === 'Escritório' ? 0 : 1) || (b.matriz ? 1 : 0) - (a.matriz ? 1 : 0))[0]
    let nomeBase = regs.find((r) => r.fonte !== 'cnpj' && r.nome)?.nome || cnpjReg?.nome_fantasia || cnpjReg?.razao_social || regs[0].nome
    // Pessoa (da web/Jusbrasil) unida a um escritório do CNPJ: o lead é o
    // escritório e a pessoa vira o contato.
    const pessoas = regs
      .filter((r) => r.fonte !== 'cnpj' && /^advog/i.test(semAcento(r.tipo || '')) && r.nome)
      .map((r) => r.nome.replace(/\s*\(.*\)\s*$/, ''))
    if (cnpjReg && cnpjReg.tipo === 'Escritório' && pessoas.length && regs.every((r) => r.fonte === 'cnpj' || pessoas.includes(r.nome.replace(/\s*\(.*\)\s*$/, ''))))
      nomeBase = cnpjReg.nome_fantasia || cnpjReg.razao_social
    const contatoPessoa = unicos(pessoas.filter((p) => chaveNome(p) !== chaveNome(nomeBase.replace(/\s*\(.*\)\s*$/, '')))).join(', ')
    const nome = /^[A-ZÀ-Ú0-9\s&.,'-]+$/.test(nomeBase) ? capitalizar(nomeBase) : nomeBase
    if (pareceNaoJuridico(nome) && !cnpjReg) continue

    const dominios = unicos([
      ...regs.map((r) => dominioDe(r.site)),
      ...regs.flatMap((r) => r.emails.map(dominioProprioDoEmail)).filter((d) => d && !dominioDeContador(d)),
    ])
    const dadosSites = dominios.map((d) => sites.get(d)).filter(Boolean)
    const siteOficial = regs.map((r) => r.site).find(Boolean) || (dadosSites[0] ? dadosSites[0].url_final || 'https://' + dadosSites[0].dominio : '')

    const emailsSite = dadosSites.flatMap((s) => s.emails)
    const emailsFonte = regs.filter((r) => r.fonte !== 'cnpj').flatMap((r) => r.emails)
    const emailsCnpj = regs.filter((r) => r.fonte === 'cnpj').flatMap((r) => r.emails)
    const emails = unicos([...emailsSite, ...emailsFonte, ...emailsCnpj.filter((e) => !emailDeContador(e))]).slice(0, 6)
    const emailsDoContador = unicos(emailsCnpj.filter(emailDeContador))

    const telsCnpj = regs.filter((r) => r.fonte === 'cnpj').flatMap((r) => r.telefones)
    const telefones = unicos([
      ...dadosSites.flatMap((s) => s.telefones),
      ...regs.filter((r) => r.fonte !== 'cnpj').flatMap((r) => r.telefones),
      ...telsCnpj.filter((t) => !telCompartilhado(t)),
    ])
      .filter((t) => t.slice(2, 4) !== '00')
      .slice(0, 6)
    const telsDoContador = unicos(telsCnpj.filter(telCompartilhado))
    const whatsExplicito = unicos([...dadosSites.flatMap((s) => s.whatsapp), ...regs.flatMap((r) => r.whatsapp)])
    const celular = telefones.find(ehCelular)
    const whatsapp = whatsExplicito[0] || celular || ''
    const origemWhats = whatsExplicito[0] ? 'link de WhatsApp publicado' : celular ? 'celular (provável WhatsApp)' : ''

    const instagram = regs.map((r) => r.instagram).find(Boolean) || dadosSites.flatMap((s) => s.instagram)[0] || ''
    const linkedin = regs.map((r) => r.linkedin).find(Boolean) || dadosSites.flatMap((s) => s.linkedin)[0] || ''
    const facebook = regs.map((r) => r.facebook).find(Boolean) || dadosSites.flatMap((s) => s.facebook)[0] || ''
    const maps = regs.map((r) => r.google_maps).find(Boolean) || ''

    if (!emails.length && !telefones.length && !whatsapp && !siteOficial && !instagram && !linkedin) continue
    // Achado só na pesquisa web, sem cidade, sem telefone baiano e com site que
    // não cita a UF: provavelmente escritório de fora que só "atende" a Bahia.
    const soWeb = regs.every((r) => ['busca_web', 'manual', 'jusbrasil'].includes(r.fonte))
    const temCidade = regs.some((r) => r.cidade)
    const telUf = [...telefones, whatsapp].some((t) => t && DDDS_BAHIA.has(String(t).slice(2, 4)))
    if (UF === 'BA' && soWeb && !temCidade && !telUf && !dadosSites.some((d) => d.menciona_uf)) continue

    // Sinais: o melhor sinal de nome/categoria entre as fontes + o do site.
    const melhorFonte = regs.map((r) => r.sinais || {}).sort((a, b) => (b.tributario || 0) - (a.tributario || 0))[0]
    const melhorEmp = regs.map((r) => r.sinais || {}).sort((a, b) => (b.empresarial || 0) - (a.empresarial || 0))[0]
    const sinalSite = dadosSites.map((s) => s.sinais).sort((a, b) => b.tributario - a.tributario)[0]
    const s = somarSinais(
      { tributario: melhorFonte?.tributario || 0, termos: melhorFonte?.termos || [] },
      { empresarial: melhorEmp?.empresarial || 0, termos: melhorEmp?.termos || [] },
      sinalSite && { tributario: Math.min(sinalSite.tributario, 12), empresarial: Math.min(sinalSite.empresarial, 9), termos: sinalSite.termos },
    )
    const foco = focoDoLead(s)

    const cidade = regs.map((r) => r.cidade).find(Boolean) || ''
    const fontes = unicos(regs.map((r) => ROTULO_FONTE[r.fonte] || r.fonte))
    if (dadosSites.length) fontes.push(ROTULO_FONTE.site)
    const obs = []
    if (emailsDoContador.length || telsDoContador.length)
      obs.push(`Contato do cadastro CNPJ repetido em várias empresas (provável contador): ${[...emailsDoContador, ...telsDoContador.map(formatarTelefone)].join(', ')}`)
    if (!dadosSites.length && emails.length && regs.every((r) => r.fonte === 'cnpj')) obs.push('Contatos só do cadastro CNPJ: confirmar antes do primeiro contato')
    obs.push(...regs.map((r) => r.observacao).filter(Boolean))

    // Prioridade 0–100: foco + qualidade dos canais.
    let prioridade = { Tributário: 50, 'Tributário e empresarial': 50, 'Tributário (sinal fraco)': 30, Empresarial: 25, Geral: 0 }[foco]
    prioridade += Math.min(20, s.tributario * 1.5)
    if (whatsapp) prioridade += 10
    if (emails.length) prioridade += 8
    if (siteOficial) prioridade += 6
    if (instagram || linkedin) prioridade += 3
    if (fontes.length >= 2) prioridade += 3
    prioridade = Math.min(100, Math.round(prioridade))

    leads.push({
      prioridade,
      nome,
      tipo: tipoFinal(regs, nome),
      contato_pessoa: contatoPessoa,
      foco,
      evidencia: s.termos.slice(0, 8).join(', '),
      cidade,
      bairro: regs.map((r) => r.bairro).find(Boolean) || '',
      endereco: regs.map((r) => r.endereco).find(Boolean) || '',
      cep: regs.map((r) => r.cep).find(Boolean) || '',
      whatsapp: whatsapp ? formatarTelefone(whatsapp) : '',
      whatsapp_link: whatsapp ? linkWhatsapp(whatsapp) : '',
      whatsapp_origem: origemWhats,
      telefones: telefones.map(formatarTelefone).join(' | '),
      emails: emails.join(' | '),
      site: siteOficial,
      instagram,
      linkedin,
      facebook,
      google_maps: maps,
      nota_google: regs.map((r) => r.nota_google).find((v) => v !== undefined && v !== '') ?? '',
      avaliacoes_google: regs.map((r) => r.avaliacoes_google).find((v) => v !== undefined && v !== '') ?? '',
      oab: regs.map((r) => r.oab).find(Boolean) || '',
      cnpj: cnpjReg ? cnpjReg.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '',
      razao_social: cnpjReg?.razao_social || '',
      socios: unicos(regs.flatMap((r) => r.socios || [])).slice(0, 12).join(', '),
      inicio_atividade: cnpjReg?.inicio_atividade || '',
      porte: cnpjReg?.porte || '',
      fontes: unicos(fontes).join(', '),
      links_fontes: unicos([...regs.map((r) => r.fonte_url), ...dadosSites.map((d) => d.url_final)]).filter(Boolean).slice(0, 5).join(' | '),
      observacoes: obs.join(' · '),
      coletado_em: HOJE,
    })
  }
  leads.sort((a, b) => b.prioridade - a.prioridade || a.cidade.localeCompare(b.cidade) || a.nome.localeCompare(b.nome))

  const abas = [
    ['Tributário', (l) => l.foco.startsWith('Tributário')],
    ['Empresarial', (l) => l.foco === 'Empresarial'],
    ['Demais sociedades', (l) => l.foco === 'Geral'],
  ]
  const COLUNAS = [
    ['prioridade', 'Prioridade', 10],
    ['nome', 'Nome', 38],
    ['tipo', 'Tipo', 18],
    ['contato_pessoa', 'Pessoa de contato', 26],
    ['foco', 'Foco', 20],
    ['evidencia', 'Evidência do foco', 30],
    ['cidade', 'Cidade', 18],
    ['bairro', 'Bairro', 18],
    ['whatsapp', 'WhatsApp', 17],
    ['whatsapp_link', 'Link WhatsApp', 26],
    ['whatsapp_origem', 'Origem do WhatsApp', 22],
    ['telefones', 'Telefones', 30],
    ['emails', 'E-mails', 34],
    ['site', 'Site', 30],
    ['instagram', 'Instagram', 30],
    ['linkedin', 'LinkedIn', 30],
    ['facebook', 'Facebook', 26],
    ['google_maps', 'Google Maps', 26],
    ['nota_google', 'Nota Google', 10],
    ['avaliacoes_google', 'Avaliações Google', 10],
    ['endereco', 'Endereço', 40],
    ['cep', 'CEP', 11],
    ['oab', 'OAB', 12],
    ['cnpj', 'CNPJ', 20],
    ['razao_social', 'Razão social', 36],
    ['socios', 'Sócios (CNPJ)', 40],
    ['inicio_atividade', 'Início atividade', 13],
    ['porte', 'Porte', 8],
    ['fontes', 'Fontes', 30],
    ['links_fontes', 'Links das fontes', 40],
    ['observacoes', 'Observações', 50],
    ['coletado_em', 'Coletado em', 12],
  ]

  await garantirPasta(PASTA_SAIDA)
  const livro = new ExcelJS.Workbook()
  livro.creator = 'TributÁgil — prospecção'
  livro.created = new Date()

  const resumo = livro.addWorksheet('Resumo')
  for (const [titulo, filtro] of abas) {
    const linhas = leads.filter(filtro)
    const ws = livro.addWorksheet(titulo, { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] })
    ws.columns = COLUNAS.map(([key, header, width]) => ({ key, header, width }))
    for (const l of linhas) ws.addRow(l)
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS.length } }
    for (const col of ['whatsapp_link', 'site', 'instagram', 'linkedin', 'facebook', 'google_maps']) {
      const c = ws.getColumn(col)
      c.eachCell((cell, n) => {
        if (n > 1 && typeof cell.value === 'string' && /^https?:\/\//.test(cell.value)) cell.value = { text: cell.value, hyperlink: cell.value }
      })
    }
    const arquivo = `leads-${UF.toLowerCase()}-${semAcento(titulo).toLowerCase().replace(/\s+/g, '-')}.csv`
    await writeFile(path.join(PASTA_SAIDA, arquivo), paraCsv(linhas, COLUNAS.map((c) => c[0])))
  }

  // Aba de resumo
  const contar = (f) => leads.filter(f).length
  const trib = leads.filter((l) => l.foco.startsWith('Tributário'))
  resumo.columns = [
    { header: 'Indicador', key: 'k', width: 52 },
    { header: 'Valor', key: 'v', width: 16 },
  ]
  resumo.getRow(1).font = { bold: true }
  const linhasResumo = [
    ['Gerado em', HOJE],
    ['UF', UF],
    ['Leads com pelo menos um contato (todas as abas)', leads.length],
    ['Aba Tributário (inclui tributário e empresarial e sinal fraco)', trib.length],
    ['  com WhatsApp (link publicado ou celular)', trib.filter((l) => l.whatsapp).length],
    ['  com e-mail', trib.filter((l) => l.emails).length],
    ['  com site', trib.filter((l) => l.site).length],
    ['Aba Empresarial', contar((l) => l.foco === 'Empresarial')],
    ['Aba Demais sociedades (sem evidência de tributário no nome/site)', contar((l) => l.foco === 'Geral')],
    [],
    ['Leads da aba Tributário por cidade', ''],
  ]
  const porCidade = {}
  for (const l of trib) porCidade[l.cidade || '(sem cidade)'] = (porCidade[l.cidade || '(sem cidade)'] || 0) + 1
  for (const [c, n] of Object.entries(porCidade).sort((a, b) => b[1] - a[1])) linhasResumo.push(['  ' + c, n])
  linhasResumo.push([], ['Registros por fonte', ''])
  const porFonte = {}
  for (const r of registros) porFonte[ROTULO_FONTE[r.fonte] || r.fonte] = (porFonte[ROTULO_FONTE[r.fonte] || r.fonte] || 0) + 1
  for (const [f, n] of Object.entries(porFonte)) linhasResumo.push(['  ' + f, n])
  linhasResumo.push(
    [],
    ['Como ler', ''],
    ['Prioridade: 0–100. Soma o foco tributário e a qualidade dos canais (WhatsApp, e-mail, site).', ''],
    ['WhatsApp: "link publicado" = o próprio escritório divulga; "celular" = número móvel, provável WhatsApp.', ''],
    ['Contatos do CNPJ podem ser do contador que fez o registro; os repetidos em várias empresas foram separados.', ''],
    ['LGPD: dados profissionais públicos, para contato B2B. Ofereça opção de não receber mais mensagens.', ''],
  )
  for (const l of linhasResumo) resumo.addRow(l.length ? { k: l[0], v: l[1] } : {})

  const xlsx = path.join(PASTA_SAIDA, `leads-${UF.toLowerCase()}-direito-tributario.xlsx`)
  await livro.xlsx.writeFile(xlsx)
  console.log(
    `OK: ${leads.length} leads (${trib.length} tributário, ${contar((l) => l.foco === 'Empresarial')} empresarial, ${contar((l) => l.foco === 'Geral')} demais) → ${path.relative(process.cwd(), xlsx)}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
