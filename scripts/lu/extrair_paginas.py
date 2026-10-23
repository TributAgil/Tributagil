"""Extrai o texto de cada página de um PDF e imprime como JSON: [{"pagina": 1, "texto": "..."}].
Usado por scripts/lu/medir-citacoes.mjs. Script próprio e confiável: rodar SEM -I (precisa do pymupdf instalado).

    python scripts/lu/extrair_paginas.py exemplos/casos-ficticios/P03.pdf
"""
import json
import sys

try:
    import pymupdf as fitz
except ImportError:  # versões antigas
    import fitz

saida = []
with fitz.open(sys.argv[1]) as doc:
    for i, pagina in enumerate(doc, start=1):
        saida.append({'pagina': i, 'texto': pagina.get_text()})
sys.stdout.reconfigure(encoding='utf-8')
print(json.dumps(saida, ensure_ascii=False))
