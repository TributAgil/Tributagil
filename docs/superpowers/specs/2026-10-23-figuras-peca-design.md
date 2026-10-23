# Assistente de figuras da peça (design)

Data: 23/10/2026 · Branch: `feat/lu-novo` · Estado: etapas (a), (b) e (c) implementadas; (d) pendente.

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

## Resultado da etapa (b) com o Gemini real (23/10/2026)
8 casos fictícios, 40 figuras (34 verificáveis em código contra a posição exata do dado no PDF, via PyMuPDF):
página certa 34/34; caixa que contém o dado 34/34 (com margem de 12 unidades, já aplicada pelo servidor); caixa de tamanho
razoável 34/34; conferência em código do texto lido 34/34. As 6 restantes (ex.: "campo de negociações sem eventos") não
têm valor verificável em código e sempre exigem confirmação do advogado. Custo: cerca de 12 mil tokens por caso.
Aprendizados: o modelo acerta a linha, mas a caixa varia 2 a 3 unidades entre execuções (daí a margem); a conferência
precisa usar o texto completo lido, não o abreviado.
Medição: `node scripts/casos-ficticios/medir-localizacao-figuras.mjs P01 P03 D02 I01` (usa `.env.local`).

## Etapa (c): tela de revisão (implementada)
`PainelFiguras` + `EditorRecorte` (src/components), lógica em `src/lib/figuras.js`, leitor de PDF em `src/lib/pdfPaginas.js`.
Botão "Montar as N figura(s) antes de baixar" em cada peça do resultado. Lista lateral com o estado de cada figura
(dado conferido / revisar / não encontrada / confirmada); editor com a página, a caixa arrastável com alças, desenho de
caixa nova no fundo da página, troca de página ou de documento, "Confirmar este recorte" (PNG), "Usar o meu próprio print",
"Desfazer" e download individual ou em .zip. A tela, o pdf.js e o JSZip são carregados sob demanda (o pacote principal do
site diminuiu). Testada no navegador com um PDF fictício: mover, redimensionar, desenhar, confirmar, enviar print, zip,
erro com "Tentar de novo" e layout de celular. `pdfjs-dist` 4.10.38 (worker do próprio domínio, `isEvalSupported:false`).

## Garantias de qualidade
- A lista bate com o Word em todas as peças dos 34 casos (`tests/figuras-peca.test.js`).
- A localização será medida nos 34 casos, em que a página de cada dado é conhecida.
- Nenhuma figura entra no Word sem o advogado ter visto; PDF ruim cai no ajuste manual ou no "trocar".

## Fora do escopo desta fase
Persistir os recortes no Storage, OCR de PDFs escaneados, ajuste em linguagem natural no chat.
