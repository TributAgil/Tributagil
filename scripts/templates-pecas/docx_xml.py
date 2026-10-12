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


def construir_tabela(cabecalhos, larguras, celulas_linha, loop=None, fonte='Quicksand', tamanho=21):
    """Tabela no padrão visual da quadro "Tese | Fundamento" da EPE de decadência.

    Bordas d1d5db, cabeçalho sombreado e5e7eb em negrito, margens de célula
    generosas. `celulas_linha` = textos (com comandos +++INS ...+++) da linha-modelo;
    `loop=(variavel, expressao)` cerca a linha-modelo com FOR/END-FOR (a linha
    se repete uma vez por item). Fonte/tamanho vêm do corpo da peça.
    """
    borda = ''.join(
        f'<w:{lado} w:val="single" w:sz="4" w:space="0" w:color="d1d5db"/>' for lado in ('top', 'left', 'bottom', 'right')
    )
    mar = '<w:tcMar><w:top w:w="115" w:type="dxa"/><w:left w:w="144" w:type="dxa"/><w:bottom w:w="115" w:type="dxa"/><w:right w:w="144" w:type="dxa"/></w:tcMar>'
    rfonts = f'<w:rFonts w:ascii="{fonte}" w:hAnsi="{fonte}" w:cs="{fonte}"/>'
    sz = f'<w:sz w:val="{tamanho}"/><w:szCs w:val="{tamanho}"/>'

    def celula(txt, largura, cab=False):
        shd = '<w:shd w:val="clear" w:color="auto" w:fill="e5e7eb"/>' if cab else ''
        jc = '<w:jc w:val="center"/>' if cab else ''
        neg = '<w:b/><w:bCs/>' if cab else ''
        return (
            f'<w:tc><w:tcPr><w:tcW w:w="{largura}" w:type="dxa"/><w:tcBorders>{borda}</w:tcBorders>{shd}{mar}</w:tcPr>'
            f'<w:p><w:pPr><w:spacing w:before="60" w:after="60" w:line="276" w:lineRule="auto"/>{jc}</w:pPr>'
            f'<w:r><w:rPr>{rfonts}{neg}{sz}</w:rPr><w:t xml:space="preserve">{_esc(txt)}</w:t></w:r></w:p></w:tc>'
        )

    cab = '<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>' + ''.join(celula(c, l, True) for c, l in zip(cabecalhos, larguras)) + '</w:tr>'

    def linha_comando(texto_cmd):
        # linha só com o comando na 1ª célula — o docx-templates a remove e repete as linhas entre FOR e END-FOR
        textos_cmd = [texto_cmd] + [''] * (len(larguras) - 1)
        return '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + ''.join(celula(t, l) for t, l in zip(textos_cmd, larguras)) + '</w:tr>'

    linha = '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + ''.join(celula(t, l) for t, l in zip(celulas_linha, larguras)) + '</w:tr>'
    if loop:
        var, expr = loop
        linha = linha_comando(f'+++FOR {var} IN {expr}+++') + linha + linha_comando(f'+++END-FOR {var}+++')
    grade = ''.join(f'<w:gridCol w:w="{l}"/>' for l in larguras)
    xml = (
        f'<w:tbl xmlns:w="{W_NS}"><w:tblPr><w:tblW w:w="{sum(larguras)}" w:type="dxa"/><w:jc w:val="left"/>'
        f'<w:tblBorders>{"".join(f"<w:{l} w:val=\"single\" w:sz=\"1\" w:space=\"0\" w:color=\"d1d5db\"/>" for l in ("top", "left", "bottom", "right", "insideH", "insideV"))}</w:tblBorders>'
        f'<w:tblLayout w:type="fixed"/><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>{grade}</w:tblGrid>{cab}{linha}</w:tbl>'
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
