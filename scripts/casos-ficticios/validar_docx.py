"""Validação ESTRUTURAL dos .docx gerados (sem Word): confere o que o Word exige para abrir sem o aviso
"o arquivo está corrompido" e o que costuma quebrar um documento montado por código.

    python scripts/casos-ficticios/validar_docx.py <pasta-ou-arquivos...>

Confere: zip íntegro; todos os XML bem formados; [Content_Types].xml cobre todas as partes; toda relação aponta para
parte que existe; ordem dos elementos dentro de <w:rPr> (a que o Word exige, ex.: highlight depois de sz); tabelas
(células terminam em parágrafo e a grade bate com as colunas); ids de desenhos únicos; um único sectPr no fim do corpo;
nenhum marcador do docx-templates (+++) sobrando; e que o python-docx consegue abrir.
"""
import os
import sys
import zipfile
import posixpath
from lxml import etree

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
ns = {'w': W}

ORDEM_RPR = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss',
             'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs',
             'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout',
             'specVanish', 'oMath']
IDX = {n: i for i, n in enumerate(ORDEM_RPR)}


def local(tag):
    return etree.QName(tag).localname


def validar(caminho):
    erros = []
    try:
        z = zipfile.ZipFile(caminho)
    except Exception as e:
        return [f'não é um zip válido: {e}']
    if z.testzip() is not None:
        erros.append(f'zip corrompido em {z.testzip()}')
    nomes = z.namelist()
    if len(nomes) != len(set(nomes)):
        erros.append('há partes duplicadas no zip')

    # --- XML bem formado
    xmls = {}
    for n in nomes:
        if n.endswith('.xml') or n.endswith('.rels'):
            try:
                xmls[n] = etree.fromstring(z.read(n))
            except Exception as e:
                erros.append(f'{n}: XML inválido ({e})')

    # --- Content types
    ct = xmls.get('[Content_Types].xml')
    if ct is None:
        erros.append('falta [Content_Types].xml')
    else:
        defaults = {d.get('Extension').lower() for d in ct.findall(f'{{{CT}}}Default')}
        overrides = {o.get('PartName') for o in ct.findall(f'{{{CT}}}Override')}
        for n in nomes:
            if n == '[Content_Types].xml' or n.endswith('/'):
                continue
            ext = n.rsplit('.', 1)[-1].lower() if '.' in n else ''
            if '/' + n not in overrides and ext not in defaults:
                erros.append(f'{n}: sem tipo de conteúdo em [Content_Types].xml')
        for o in overrides:
            if o.lstrip('/') not in nomes:
                erros.append(f'Content_Types aponta para parte inexistente: {o}')

    # --- Relações
    for n, raiz in xmls.items():
        if not n.endswith('.rels'):
            continue
        base = posixpath.dirname(posixpath.dirname(n))  # pasta da parte dona
        for rel in raiz.findall(f'{{{R}}}Relationship'):
            if rel.get('TargetMode') == 'External':
                continue
            alvo = rel.get('Target')
            caminho_alvo = alvo.lstrip('/') if alvo.startswith('/') else posixpath.normpath(posixpath.join(base, alvo))
            if caminho_alvo not in nomes:
                erros.append(f'{n}: relação {rel.get("Id")} aponta para {caminho_alvo}, que não existe')

    doc = xmls.get('word/document.xml')
    if doc is None:
        return erros + ['falta word/document.xml']

    # --- Partes com texto do Word
    partes = [n for n in xmls if n.startswith('word/') and (n.endswith('document.xml') or 'header' in n or 'footer' in n) and n.endswith('.xml')]
    ids_desenho = []
    for n in partes:
        raiz = xmls[n]
        texto = ''.join(t.text or '' for t in raiz.iter(f'{{{W}}}t'))
        if '+++' in texto:
            erros.append(f'{n}: marcador do docx-templates sobrando (+++)')
        for rpr in raiz.iter(f'{{{W}}}rPr'):
            pos = [IDX.get(local(c.tag), -1) for c in rpr]
            conhecidos = [p for p in pos if p >= 0]
            if conhecidos != sorted(conhecidos):
                erros.append(f'{n}: ordem inválida em <w:rPr>: {[local(c.tag) for c in rpr]}')
                break
        for p in raiz.iter(f'{{{W}}}p'):
            filhos = [local(c.tag) for c in p]
            if 'pPr' in filhos and filhos.index('pPr') != 0:
                erros.append(f'{n}: <w:pPr> fora do início de um parágrafo')
                break
        for dp in raiz.iter('{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}docPr'):
            ids_desenho.append(dp.get('id'))

    # --- Tabelas
    for tbl in doc.iter(f'{{{W}}}tbl'):
        grade = len(tbl.findall('w:tblGrid/w:gridCol', ns))
        for tr in tbl.findall('w:tr', ns):
            celulas = tr.findall('w:tc', ns)
            larg = 0
            for tc in celulas:
                span = tc.find('w:tcPr/w:gridSpan', ns)
                larg += int(span.get(f'{{{W}}}val')) if span is not None else 1
                filhos = [local(c.tag) for c in tc]
                if not filhos or filhos[-1] not in ('p', 'tbl'):
                    erros.append('célula de tabela que não termina em parágrafo')
                    break
            if grade and larg != grade:
                erros.append(f'linha de tabela com {larg} colunas para uma grade de {grade}')
                break

    if len(ids_desenho) != len(set(ids_desenho)):
        erros.append('ids de desenho (wp:docPr) repetidos')
    corpo = doc.find('w:body', ns)
    sect = corpo.findall('w:sectPr', ns)
    if len(sect) != 1 or local(corpo[-1].tag) != 'sectPr':
        erros.append('o corpo deve terminar com um único <w:sectPr>')

    # --- python-docx abre
    try:
        import docx  # noqa: F401
        d = docx.Document(caminho)
        _ = [p.text for p in d.paragraphs]
    except Exception as e:
        erros.append(f'python-docx não consegue abrir: {e}')
    return erros


def main(args):
    arquivos = []
    for a in args:
        if os.path.isdir(a):
            arquivos += sorted(os.path.join(a, f) for f in os.listdir(a) if f.lower().endswith('.docx'))
        else:
            arquivos.append(a)
    ruins = 0
    for f in arquivos:
        e = validar(f)
        if e:
            ruins += 1
            print(f'FALHOU  {os.path.basename(f)}')
            for x in e[:6]:
                print('   -', x)
    print(f'{len(arquivos) - ruins} de {len(arquivos)} arquivos sem nenhum problema estrutural')
    return 1 if ruins else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
