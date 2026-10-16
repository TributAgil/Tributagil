"""Converte um .docx gerado em HTML simples (texto, negrito, itálico, destaque amarelo, recuo, centralizado e tabelas),
para abrir como Google Doc no Drive ou no celular. NÃO substitui o .docx (que tem fontes, timbrado e paginação do Word).

    python scripts/casos-ficticios/docx_para_html.py <pasta-docx> <pasta-saida>
"""
import html
import os
import sys

from lxml import etree
import zipfile

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
ns = {'w': W}


def v(el, nome):
    return el.get(f'{{{W}}}{nome}') if el is not None else None


def ligado(rpr, tag):
    e = rpr.find(f'w:{tag}', ns) if rpr is not None else None
    return e is not None and v(e, 'val') not in ('0', 'false')


def runs_html(p):
    saida = ''
    for r in p.iter(f'{{{W}}}r'):
        texto = ''.join((t.text or '') for t in r.findall('w:t', ns))
        if not texto:
            continue
        rpr = r.find('w:rPr', ns)
        h = html.escape(texto)
        if ligado(rpr, 'b'):
            h = f'<b>{h}</b>'
        if ligado(rpr, 'i'):
            h = f'<i>{h}</i>'
        if rpr is not None and rpr.find('w:highlight', ns) is not None:
            h = f'<span style="background:#ffff00">{h}</span>'
        saida += h
    return saida


def paragrafo(p):
    conteudo = runs_html(p)
    ppr = p.find('w:pPr', ns)
    estilo = []
    if ppr is not None:
        jc = v(ppr.find('w:jc', ns), 'val')
        if jc == 'center':
            estilo.append('text-align:center')
        elif jc in ('both', 'justify'):
            estilo.append('text-align:justify')
        ind = ppr.find('w:ind', ns)
        esq = v(ind, 'left') or v(ind, 'start')
        if esq and esq.lstrip('-').isdigit() and int(esq) > 300:
            estilo.append(f'margin-left:{int(int(esq) / 567 * 10) / 10}cm')
        shd = ppr.find('w:shd', ns)
        fill = v(shd, 'fill')
        if fill and fill not in ('auto', 'FFFFFF', 'ffffff'):
            estilo.append(f'background:#{fill}')
    if not conteudo.strip():
        return '<p>&nbsp;</p>'
    return f'<p style="{";".join(estilo)}">{conteudo}</p>' if estilo else f'<p>{conteudo}</p>'


def tabela(t):
    linhas = ''
    for i, tr in enumerate(t.findall('w:tr', ns)):
        cel = ''
        for tc in tr.findall('w:tc', ns):
            texto = '<br>'.join(runs_html(p) for p in tc.findall('w:p', ns) if runs_html(p).strip())
            cel += f'<{"th" if i == 0 else "td"}>{texto}</{"th" if i == 0 else "td"}>'
        linhas += f'<tr>{cel}</tr>'
    return f'<table border="1" cellspacing="0" cellpadding="4" width="100%">{linhas}</table>'


def converter(docx, saida):
    doc = etree.fromstring(zipfile.ZipFile(docx).read('word/document.xml'))
    corpo = doc.find('w:body', ns)
    partes = []
    for el in corpo:
        tag = etree.QName(el.tag).localname
        if tag == 'p':
            h = paragrafo(el)
            if h == '<p>&nbsp;</p>' and partes and partes[-1] == h:
                continue
            partes.append(h)
        elif tag == 'tbl':
            partes.append(tabela(el))
    titulo = os.path.splitext(os.path.basename(docx))[0]
    aviso = '<p style="background:#fde7e7;color:#a00;font-size:9pt">MINUTA FICTICIA PARA TESTE (dados inventados). Esta e uma visualizacao em texto; o arquivo Word original tem timbrado, fontes e paginacao.</p>'
    corpo_html = f'<html><head><meta charset="utf-8"><title>{html.escape(titulo)}</title></head><body style="font-family:Arial;font-size:11pt">{aviso}{"".join(partes)}</body></html>'
    with open(saida, 'w', encoding='utf-8') as f:
        f.write(corpo_html)
    return len(corpo_html)


if __name__ == '__main__':
    origem, destino = sys.argv[1], sys.argv[2]
    os.makedirs(destino, exist_ok=True)
    for nome in sorted(os.listdir(origem)):
        if nome.lower().endswith('.docx'):
            n = converter(os.path.join(origem, nome), os.path.join(destino, nome[:-5] + '.html'))
            print(f'{nome[:-5]}.html  {n // 1024} KB')
