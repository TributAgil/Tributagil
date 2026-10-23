# Assistente de figuras da peça (design)

Data: 23/10/2026 · Branch: `feat/lu-novo` · Estado: etapa (a) implementada; (b), (c) e (d) pendentes.

## Problema
Os modelos Word trazem marcadores `[INSERIR FIGURA N – …]`. Hoje o advogado procura à mão, em cada documento do caso, o
trecho que ilustra cada figura, recorta e cola no Word. É o último trabalho manual que falta para fechar a peça.

## Decisão de lugar
O recurso fica **na criação da peça** (tela "Gerar peça"), e não no chat do Lu. Motivos: a lista de figuras já nasce no
motor, de forma exata; não depende da indexação do Lu nem do limite de 10 perguntas; e o caminho até o Word é direto.
O Lu continua para dúvidas do caso, com fonte, e pode receber um atalho para a tela de figuras.

## Fluxo
1. Cadastro do escritório (uma vez) · 2. Dados da peça · 3. Gerando · 4. Resultado (peças possíveis)
5. **Montar as figuras** (nova): revisão figura a figura, com Confirmar / Ajustar / Trocar · 6. Baixar o Word.
"Baixar assim mesmo" continua existindo, com os marcadores em amarelo.

## Arquitetura
- **(a) Lista de figuras, feita pelo código** (`figuras_meta` em `api/_contexto-peca.js`; `figurasDoDocx` em
  `api/_render-peca.js`). Cada item: `numero`, `chave`, `legenda`, `descricao`, `documento_fonte`, `cda`, `periodo` e
  `evidenciar` (o dado que precisa aparecer: campo e valor). A lista final sai do Word já renderizado, então só entra o
  que o modelo usou. A API devolve `figuras` em cada peça.
- **(b) Localização com o Gemini, em lote**: uma chamada por documento, pedindo página e região de cada figura.
- **(c) Tela de revisão no navegador**: pdf.js desenha a página, destaca a região e recorta em canvas. Sem biblioteca
  pesada no servidor; o CSP do site já permite `worker-src blob:`.
- **(d) Word com as imagens**: no clique final, o servidor regera o Word trocando cada marcador pela imagem (sem IA).
  Cada recorte é comprimido antes do envio (limite de corpo da função).

## Garantias de qualidade
- A lista bate com o Word em todas as peças dos 34 casos (`tests/figuras-peca.test.js`).
- A localização será medida nos 34 casos, em que a página de cada dado é conhecida.
- Nenhuma figura entra no Word sem o advogado ter visto; PDF ruim cai no ajuste manual ou no "trocar".

## Fora do escopo desta fase
Persistir os recortes no Storage, OCR de PDFs escaneados, ajuste em linguagem natural no chat.
