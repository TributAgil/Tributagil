import assert from 'node:assert/strict'
import { test } from 'node:test'
import { focoDoLead, pareceNaoJuridico, sinais } from '../src/lib/classificar.mjs'
import { extrairContatos, paginasInteressantes } from '../src/lib/contatos.mjs'
import { chaveNome, dominioDe, ehCelular, ehSiteProprio, formatarTelefone, normalizarEmail, normalizarTelefone } from '../src/lib/normalizar.mjs'

test('normaliza telefones brasileiros', () => {
  assert.equal(normalizarTelefone('(71) 3272-1374'), '557132721374')
  assert.equal(normalizarTelefone('+55 71 99657-5136'), '5571996575136')
  assert.equal(normalizarTelefone('071 3333 4444'), '557133334444')
  assert.equal(normalizarTelefone('(74) 8821-1296'), '5574988211296') // celular antigo sem o 9
  assert.equal(normalizarTelefone('3333-4444', '75'), '557533334444')
  assert.equal(normalizarTelefone('0800 123 4567'), null)
  assert.equal(normalizarTelefone('(71) 99999-9999'), null)
  assert.equal(normalizarTelefone('(20) 3333-4444'), null) // DDD inexistente
  assert.ok(ehCelular('5571996575136'))
  assert.ok(!ehCelular('557132721374'))
  assert.equal(formatarTelefone('5571996575136'), '(71) 99657-5136')
})

test('e-mails e domínios', () => {
  assert.equal(normalizarEmail('MAILTO:Contato@Exemplo.adv.br?subject=oi'), 'contato@exemplo.adv.br')
  assert.equal(normalizarEmail('logo@2x.png'), null)
  assert.equal(normalizarEmail('abc@sentry.io'), null)
  assert.equal(normalizarEmail('fulano@hotimail.com'), 'fulano@hotmail.com')
  assert.equal(normalizarEmail('fulano@gmail.com.br'), 'fulano@gmail.com')
  assert.equal(dominioDe('https://www.abpadv.com.br/contato'), 'abpadv.com.br')
  assert.ok(ehSiteProprio('https://abpadv.com.br'))
  assert.ok(!ehSiteProprio('https://www.instagram.com/escritorio'))
  assert.ok(!ehSiteProprio('https://www.jusbrasil.com.br/advogados/x'))
})

test('chave de nome ignora termos genéricos', () => {
  assert.equal(chaveNome('ABP ADVOGADOS ASSOCIADOS'), chaveNome('Abp Advogados'))
  assert.equal(chaveNome('Karam Advocacia em Caminho das Árvores'), 'karam')
  assert.equal(chaveNome('Pinto e Souza Advocacia Tributária'), 'pinto souza tributaria')
})

const cfEmail = (email, chave = 0x33) =>
  chave.toString(16).padStart(2, '0') + [...email].map((c) => (c.charCodeAt(0) ^ chave).toString(16).padStart(2, '0')).join('')

test('extrai contatos de HTML', () => {
  const html = `
    <a href="mailto:contato@abc.adv.br">e-mail</a>
    <a href="https://wa.me/5571999887766?text=Ol%C3%A1">WhatsApp</a>
    <a href="tel:+557133334444">ligue</a>
    <span class="__cf_email__" data-cfemail="${cfEmail('financeiro@abc.adv.br')}">[email protected]</span>
    Fale: (71) 3272-1374 ou socio [at] abc.adv.br
    <a href="https://www.instagram.com/abcadvocacia/">IG</a>
    <a href="https://www.instagram.com/p/XYZ/">post</a>
    <a href="https://br.linkedin.com/company/abc-advogados">in</a>
    <a href="https://www.facebook.com/sharer.php?u=x">share</a>
    <a href="https://www.facebook.com/abcadv">fb</a>`
  const c = extrairContatos(html)
  assert.ok(c.emails.includes('contato@abc.adv.br'))
  assert.ok(c.emails.includes('socio@abc.adv.br'))
  assert.ok(c.emails.includes('financeiro@abc.adv.br')) // protegido pelo Cloudflare
  assert.equal(c.emails.length, 3)
  assert.deepEqual(c.whatsapp, ['5571999887766'])
  assert.ok(c.telefones.includes('557133334444') && c.telefones.includes('557132721374'))
  assert.deepEqual(c.instagram, ['https://www.instagram.com/abcadvocacia'])
  assert.deepEqual(c.linkedin, ['https://www.linkedin.com/company/abc-advogados'])
  assert.deepEqual(c.facebook, ['https://www.facebook.com/abcadv'])
})

test('prioriza páginas de contato e áreas', () => {
  const html = `<a href="/blog/post-1">Blog</a><a href="/contato">Contato</a><a href="/areas-de-atuacao/tributario">Tributário</a><a href="https://outro.com/contato">x</a>`
  const p = paginasInteressantes(html, 'https://abc.adv.br/')
  assert.deepEqual(p, ['https://abc.adv.br/contato', 'https://abc.adv.br/areas-de-atuacao/tributario'])
})

test('classifica foco tributário e empresarial', () => {
  assert.equal(focoDoLead(sinais('Pinto e Souza Advocacia Tributária')), 'Tributário')
  assert.equal(focoDoLead(sinais('Direito empresarial e societário, contratos empresariais')), 'Empresarial')
  assert.equal(focoDoLead(sinais('Planejamento tributário, ICMS e direito societário empresarial')), 'Tributário e empresarial')
  assert.equal(focoDoLead(sinais('Fulano de Tal Advogados')), 'Geral')
  assert.ok(pareceNaoJuridico('Moreira e Moreira Contabilidade Ltda'))
  assert.ok(!pareceNaoJuridico('Contábil & Jurídico Advogados'))
})
