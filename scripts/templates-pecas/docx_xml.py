"""Helpers de edição do document.xml dos modelos de peça (lxml).

lxml preserva os prefixos de namespace e os atributos mc:Ignorable — coisa que
o ElementTree padrão reescreve (ns0, ns1...) e que faz o Word acusar arquivo
corrompido. Por isso o projeto não usa xml.etree aqui.
"""
import copy
import re
import zipfile
from lxml import etree

W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS = {'w': W_NS}


def q(tag):
    return f'{{{W_NS}}}{tag}'


def ler_docx(caminho):
    z = zipfile.ZipFile(caminho)
    return {i.filename: z.read(i.filename) for i in z.infolist()}, [i.filename for i in z.infolist()]


def escrever_docx(caminho, partes, ordem):
    with zipfile.ZipFile(caminho, 'w', zipfile.ZIP_DEFLATED) as z:
        # [Content_Types].xml primeiro, como o Word espera
        for nome in sorted(ordem, key=lambda n: (n != '[Content_Types].xml', ordem.index(n))):
            z.writestr(nome, partes[nome])


def parse(xml_bytes):
    return etree.fromstring(xml_bytes)


def serializar(raiz):
    return etree.tostring(raiz, xml_declaration=True, encoding='UTF-8', standalone=True)


def corpo(raiz):
    return raiz.find('w:body', NS)


def filhos(raiz):
    return list(corpo(raiz))


def texto(el):
    return ''.join(t.text or '' for t in el.iter(q('t')))


def runs_com_texto(p):
    """Runs diretos do parágrafo (ou dentro de hyperlink/smartTag) que têm w:t."""
    return [r for r in p.iter(q('r')) if r.find('w:t', NS) is not None]


def _definir_texto_run(r, novo):
    ts = r.findall('w:t', NS)
    ts[0].text = novo
    ts[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    for extra in ts[1:]:
        r.remove(extra)


def trocar_no_paragrafo(p, antigo, novo, ocorrencia=1):
    """Substitui `antigo` por `novo` mesmo que o trecho atravesse vários runs.

    O novo texto fica no run onde o trecho começa (herda a formatação dele);
    os runs seguintes só perdem os caracteres do trecho. Devolve True se achou.
    """
    runs = runs_com_texto(p)
    mapa = []  # (run, indice_do_t, texto)
    completo = ''
    for r in runs:
        t = r.find('w:t', NS)
        mapa.append((r, completo.__len__(), t.text or ''))
        completo += t.text or ''
    inicio = -1
    pos = 0
    for _ in range(ocorrencia):
        inicio = completo.find(antigo, pos)
        if inicio < 0:
            return False
        pos = inicio + len(antigo)
    fim = inicio + len(antigo)
    colocado = False
    for r, off, txt in mapa:
        a, b = off, off + len(txt)
        if b <= inicio or a >= fim:
            continue
        ini_local = max(inicio, a) - a
        fim_local = min(fim, b) - a
        if not colocado:
            novo_txt = txt[:ini_local] + novo + txt[fim_local:]
            colocado = True
        else:
            novo_txt = txt[:ini_local] + txt[fim_local:]
        _definir_texto_run(r, novo_txt)
    return True


def definir_texto_paragrafo(p, novo):
    """Troca TODO o texto do parágrafo, preservando pPr e a formatação do 1º run com texto."""
    runs = runs_com_texto(p)
    if not runs:
        raise ValueError('parágrafo sem run de texto')
    _definir_texto_run(runs[0], novo)
    for r in runs[1:]:
        r.getparent().remove(r)


def limpar_conteudo_paragrafo(p, novo_texto):
    """Remove desenhos/formas/imagens e deixa só `novo_texto`, mantendo pPr.

    Usado nos parágrafos de figura: a imagem some e entra o marcador textual.
    """
    ppr = p.find('w:pPr', NS)
    modelo_rpr = None
    for r in p.iter(q('r')):
        rpr = r.find('w:rPr', NS)
        if rpr is not None:
            modelo_rpr = copy.deepcopy(rpr)
            break
    for filho in list(p):
        if filho is not ppr:
            p.remove(filho)
    r = etree.SubElement(p, q('r'))
    if modelo_rpr is not None:
        for ruim in modelo_rpr.findall('w:noProof', NS):
            modelo_rpr.remove(ruim)
        r.append(modelo_rpr)
    t = etree.SubElement(r, q('t'))
    t.text = novo_texto
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')


def paragrafo_comando(texto_cmd):
    """Parágrafo isolado só com um comando do docx-templates (some na renderização)."""
    p = etree.Element(q('p'))
    r = etree.SubElement(p, q('r'))
    t = etree.SubElement(r, q('t'))
    t.text = texto_cmd
    return p


def inserir_antes(ref, novo):
    ref.addprevious(novo)


def inserir_depois(ref, novo):
    ref.addnext(novo)


def remover(el):
    el.getparent().remove(el)


def remover_sombreado(p):
    """Tira o fundo amarelo (shd) de um parágrafo — o destaque agora vem do [PREENCHER]."""
    for shd in p.iter(q('shd')):
        shd.getparent().remove(shd)
    for hl in p.iter(q('highlight')):
        hl.getparent().remove(hl)


def trocar_entre(p, inicio, fim, novo):
    """Substitui o trecho que vai do início de `inicio` até o fim de `fim`.

    `novo` pode ser uma string ou uma função que recebe o trecho original e
    devolve o texto novo (útil para envolver o trecho num IF sem reescrevê-lo).
    """
    completo = ''.join(r.find('w:t', NS).text or '' for r in runs_com_texto(p))
    i = completo.find(inicio)
    if i < 0:
        return False
    j = completo.find(fim, i)
    if j < 0:
        return False
    trecho = completo[i:j + len(fim)]
    return trocar_no_paragrafo(p, trecho, novo(trecho) if callable(novo) else novo)


def _esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


_CMD_BLOCO = re.compile(r'\+\+\+(?:IF |END-IF|FOR |END-FOR)[^+]*\+\+\+')


def _separar_markup(texto):
    """'abc **negrito** ~~itálico~~ fim' -> [(texto, negrito, itálico), ...]. Comandos +++...+++ passam como texto.

    Comandos de bloco (IF/END-IF/FOR/END-FOR) ficam num run SÓ DELES: o docx-templates, ao descartar o
    trecho de um IF falso numa linha, mantém o texto que está no mesmo run do END-IF, e o que está
    antes dele vazaria para a peça.
    """
    partes, negrito, italico, atual = [], False, False, ''
    i = 0
    while i < len(texto):
        m = _CMD_BLOCO.match(texto, i)
        if m:
            if atual:
                partes.append((atual, negrito, italico))
                atual = ''
            partes.append((m.group(0), negrito, italico))
            i = m.end()
            continue
        if texto.startswith('**', i):
            if atual:
                partes.append((atual, negrito, italico))
                atual = ''
            negrito = not negrito
            i += 2
            continue
        if texto.startswith('~~', i):
            if atual:
                partes.append((atual, negrito, italico))
                atual = ''
            italico = not italico
            i += 2
            continue
        atual += texto[i]
        i += 1
    if atual:
        partes.append((atual, negrito, italico))
    return partes


def construir_tabela(cabecalhos, larguras, celulas_linha, loop=None, fonte='Quicksand', tamanho=21, linhas_estaticas=None):
    """Tabela no padrão visual do quadro "Tese | Fundamento" da EPE de decadência.

    Bordas d1d5db, cabeçalho sombreado e5e7eb em negrito, margens de célula generosas. O texto das
    células aceita **negrito**, ~~itálico~~ e comandos do docx-templates.
    - Tabela com laço: `celulas_linha` = textos da linha-modelo e `loop=(variavel, expressao)` cerca a
      linha com FOR/END-FOR (em LINHAS PRÓPRIAS, como o docx-templates exige).
    - Tabela estática (quadro sinóptico): passe `linhas_estaticas=[[c1, c2], ...]` (celulas_linha ignorado).
    """
    borda = ''.join(
        f'<w:{lado} w:val="single" w:sz="4" w:space="0" w:color="d1d5db"/>' for lado in ('top', 'left', 'bottom', 'right')
    )
    mar = '<w:tcMar><w:top w:w="115" w:type="dxa"/><w:left w:w="144" w:type="dxa"/><w:bottom w:w="115" w:type="dxa"/><w:right w:w="144" w:type="dxa"/></w:tcMar>'
    rfonts = f'<w:rFonts w:ascii="{fonte}" w:hAnsi="{fonte}" w:cs="{fonte}"/>'
    sz = f'<w:sz w:val="{tamanho}"/><w:szCs w:val="{tamanho}"/>'

    def runs(texto, cab):
        saida = ''
        for trecho, neg, ita in _separar_markup(texto):
            n = '<w:b/><w:bCs/>' if (neg or cab) else ''
            i = '<w:i/><w:iCs/>' if ita else ''
            saida += f'<w:r><w:rPr>{rfonts}{n}{i}{sz}</w:rPr><w:t xml:space="preserve">{_esc(trecho)}</w:t></w:r>'
        return saida or f'<w:r><w:rPr>{rfonts}{sz}</w:rPr><w:t xml:space="preserve"></w:t></w:r>'

    def celula(txt, largura, cab=False):
        shd = '<w:shd w:val="clear" w:color="auto" w:fill="e5e7eb"/>' if cab else ''
        jc = '<w:jc w:val="center"/>' if cab else ''
        return (
            f'<w:tc><w:tcPr><w:tcW w:w="{largura}" w:type="dxa"/><w:tcBorders>{borda}</w:tcBorders>{shd}{mar}</w:tcPr>'
            f'<w:p><w:pPr><w:spacing w:before="60" w:after="60" w:line="276" w:lineRule="auto"/>{jc}</w:pPr>'
            f'{runs(txt, cab)}</w:p></w:tc>'
        )

    def linha_de(textos):
        return '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + ''.join(celula(t, l) for t, l in zip(textos, larguras)) + '</w:tr>'

    cab = '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' + ''.join(celula(c, l, True) for c, l in zip(cabecalhos, larguras)) + '</w:tr>'

    def linha_comando(texto_cmd):
        # linha só com o comando na 1ª célula — o docx-templates a remove e repete as linhas entre FOR e END-FOR
        return linha_de([texto_cmd] + [''] * (len(larguras) - 1))

    if linhas_estaticas is not None:
        corpo = ''.join(linha_de(l) for l in linhas_estaticas)
    else:
        corpo = linha_de(celulas_linha)
        if loop:
            var, expr = loop
            corpo = linha_comando(f'+++FOR {var} IN {expr}+++') + corpo + linha_comando(f'+++END-FOR {var}+++')
    grade = ''.join(f'<w:gridCol w:w="{l}"/>' for l in larguras)
    bordas_tabela = ''.join(
        f'<w:{l} w:val="single" w:sz="1" w:space="0" w:color="d1d5db"/>' for l in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV')
    )
    xml = (
        f'<w:tbl xmlns:w="{W_NS}"><w:tblPr><w:tblW w:w="{sum(larguras)}" w:type="dxa"/><w:jc w:val="left"/>'
        f'<w:tblBorders>{bordas_tabela}</w:tblBorders>'
        f'<w:tblLayout w:type="fixed"/><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>{grade}</w:tblGrid>{cab}{corpo}</w:tbl>'
    )
    return etree.fromstring(xml)


def _linha_de_comando(modelo, texto_cmd):
    """Clona a linha-modelo, esvazia todas as células e coloca o comando na 1ª."""
    linha = copy.deepcopy(modelo)
    for i, tc in enumerate(linha.findall('w:tc', NS)):
        ps = tc.findall('w:p', NS)
        for extra in ps[1:]:
            tc.remove(extra)
        p = ps[0]
        for filho in list(p):
            if filho.tag != q('pPr'):
                p.remove(filho)
        if i == 0:
            r = etree.SubElement(p, q('r'))
            t = etree.SubElement(r, q('t'))
            t.text = texto_cmd
    return linha


def converter_linha_em_loop(tbl, indice_linha_modelo, textos, var, expr):
    """Em uma tabela ORIGINAL do modelo: a linha `indice_linha_modelo` vira linha-modelo
    de um laço (textos por célula); as demais linhas de dados são removidas e o
    FOR/END-FOR entram em linhas próprias (formato exigido pelo docx-templates)."""
    linhas = tbl.findall('w:tr', NS)
    modelo = linhas[indice_linha_modelo]
    for outra in linhas[indice_linha_modelo + 1:]:
        tbl.remove(outra)
    for tc, txt in zip(modelo.findall('w:tc', NS), textos):
        ps = tc.findall('w:p', NS)
        definir_texto_paragrafo(ps[0], txt)
        for extra in ps[1:]:
            tc.remove(extra)
    modelo.addprevious(_linha_de_comando(modelo, f'+++FOR {var} IN {expr}+++'))
    modelo.addnext(_linha_de_comando(modelo, f'+++END-FOR {var}+++'))



# ---------------------------------------------------------------------------
# Parágrafos novos a partir de um parágrafo-MODELO da base (herdam pPr e fonte)
# ---------------------------------------------------------------------------

def _rpr_base(modelo):
    """rPr do 1º run com texto do modelo, sem negrito/itálico/destaque (quem decide é a marcação)."""
    for r in runs_com_texto(modelo):
        rpr = r.find('w:rPr', NS)
        if rpr is not None:
            rpr = copy.deepcopy(rpr)
            for tag in ('b', 'bCs', 'i', 'iCs', 'highlight', 'shd', 'noProof'):
                for e in rpr.findall('w:' + tag, NS):
                    rpr.remove(e)
            return rpr
    return etree.Element(q('rPr'))


def _rpr_com(base, negrito, italico):
    rpr = copy.deepcopy(base)
    pos = 0
    for k, filho in enumerate(rpr):
        if filho.tag in (q('rStyle'), q('rFonts')):
            pos = k + 1
    extras = []
    if negrito:
        extras += [etree.Element(q('b')), etree.Element(q('bCs'))]
    if italico:
        extras += [etree.Element(q('i')), etree.Element(q('iCs'))]
    for k, e in enumerate(extras):
        rpr.insert(pos + k, e)
    return rpr


def paragrafo_de_modelo(modelo, markup):
    """Parágrafo novo com o pPr e a fonte do `modelo`, e o texto de `markup` (**negrito**, ~~itálico~~)."""
    novo = etree.Element(q('p'))
    ppr = modelo.find('w:pPr', NS)
    if ppr is not None:
        novo.append(copy.deepcopy(ppr))
    base = _rpr_base(modelo)
    for trecho, neg, ita in _separar_markup(markup):
        r = etree.SubElement(novo, q('r'))
        r.append(_rpr_com(base, neg, ita))
        t = etree.SubElement(r, q('t'))
        t.text = trecho
        t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    return novo


def markup_de_paragrafo(p):
    """Texto de um parágrafo existente como markup (negrito/itálico preservados) — para copiar blocos entre modelos."""
    saida = ''
    for r in runs_com_texto(p):
        rpr = r.find('w:rPr', NS)

        def ligado(tag):
            e = rpr.find('w:' + tag, NS) if rpr is not None else None
            return e is not None and e.get(q('val')) not in ('0', 'false')

        texto_r = ''.join(t.text or '' for t in r.findall('w:t', NS))
        if not texto_r:
            continue
        if ligado('b'):
            texto_r = f'**{texto_r}**'
        if ligado('i'):
            texto_r = f'~~{texto_r}~~'
        saida += texto_r
    return saida.replace('****', '').replace('~~~~', '')


def tirar_cor(p):
    """Remove cor de texto (ex.: branco da assinatura, que era oculto no modelo) para o texto ficar visível."""
    for c in list(p.iter(q('color'))):
        c.getparent().remove(c)
