"""Verdade de campo para medir a localização de figuras: dado um PDF e uma lista de textos (datas, números),
devolve em JSON, para cada texto, as páginas e as caixas [ymin, xmin, ymax, xmax] (0 a 1000) onde ele aparece.
Entrada (stdin): {"pdf": "caminho.pdf", "valores": ["10/05/2018", ...]}"""
import json
import sys

try:
    import pymupdf as fitz  # PyMuPDF
except ImportError:  # versões antigas
    import fitz

entrada = json.load(sys.stdin)
doc = fitz.open(entrada["pdf"])
saida = {}
for valor in entrada["valores"]:
    achados = []
    for i, pagina in enumerate(doc, start=1):
        w, h = pagina.rect.width, pagina.rect.height
        for r in pagina.search_for(valor):
            achados.append({"pagina": i, "caixa": [round(r.y0 / h * 1000), round(r.x0 / w * 1000), round(r.y1 / h * 1000), round(r.x1 / w * 1000)]})
    saida[valor] = achados
print(json.dumps(saida, ensure_ascii=False))
