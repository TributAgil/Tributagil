# Lu: respostas com fonte conferida e ligação ao parecer e à peça

Data: 23/10/2026 · Branch: `feat/lu-novo` (a main não é mexida) · Estado: implementada na `feat/lu-novo` (plano em `docs/superpowers/plans/2026-10-23-lu-fontes-e-peca.md`). Falta só a migração do banco, que aguarda autorização.

## Objetivo

Hoje o Lu enxerga só trechos de documentos e de legislação, não o parecer nem a peça. As fontes que ele mostra são os trechos recuperados, não os que a resposta de fato usou. E toda pergunta gasta uma das 10 chamadas de IA da consulta.

Este trabalho muda três coisas:

1. **Perguntas pré-montadas respondidas por código**, sem IA e sem descontar da cota. É o centro da entrega: elas dão ao chat a utilidade que o advogado sente no dia a dia.
2. **Perguntas livres com IA, cota de 5 por consulta**, para o que as pré-montadas não cobrem. Toda resposta de IA traz citações numeradas conferidas em código.
3. **O Lu passa a conhecer o parecer e o resumo da última peça gerada.**

## Decisões já tomadas

- Ligação ao motor: o Lu **explica**, não executa nada (nem gera peça, nem corrige dados).
- Citação numerada e conferida em código, com clique que abre a página do documento.
- Resumo da peça guardado em coluna nova (abordagem 2). A migração só roda em produção com autorização expressa do Luan.
- Sem peça gerada, o Lu responde só com o parecer e mostra um aviso discreto (texto em opacidade reduzida): "Nenhuma peça foi gerada para esta consulta ainda."
- Cota: 5 perguntas de IA por consulta (antes 10). Perguntas pré-montadas não contam.

## 1. Perguntas pré-montadas (sem IA), 14 no catálogo

As perguntas 5 ("em que documento consta") viraram quatro: citação, ajuizamento, notificação e inscrição.

Rodam no navegador, sobre o parecer (`analises.resultado`) e o resumo da peça. Resposta instantânea, custo zero, sem rate limit, sem desconto de cota. O resultado é sempre o mesmo para o mesmo parecer, o que também as torna testáveis em código.

Cada resposta traz citações `[n]` que apontam para o item do parecer ou da peça de onde saiu o dado. Fato com documento de origem abre o documento.

| # | Pergunta | Como o código responde |
|---|---|---|
| 1 | Qual a conclusão do parecer e com que confiança? | `conclusoes` favoráveis primeiro: título, resumo, confiança |
| 2 | Qual o fundamento legal de cada conclusão? | `conclusoes[].fundamento_legal` + `raciocinio[].referencia` |
| 3 | Quais datas sustentam o cálculo? | `fatos_importantes` de relevância crítica e alta, com data e documento |
| 4 | Mostre a linha do tempo do caso | `fatos_importantes` em ordem cronológica, agrupados por CDA quando houver |
| 5 | Em que documento consta a data X? (citação, ajuizamento, notificação, inscrição, pagamento) | Busca por tipo de marco nos `fatos_importantes`; devolve data, descrição e `fonte` |
| 6 | Existe risco ou ponto de atenção? | `conclusoes` com severidade atenção ou desfavorável + `suspensao_ativa`/`cautela` |
| 7 | Há algum dado que precisa ser confirmado? | `alerta_dados_insuficientes`, conclusões com confiança baixa, `[CONFIRMAR]` e `[PREENCHER]` do resumo da peça |
| 8 | Quais os próximos passos? | `recomendacoes` |
| 9 | O que falta preencher na peça? | Resumo da peça: campos `[PREENCHER]`, `[CONFIRMAR]` e figuras pendentes |
| 10 | Qual modelo de peça foi usado e por quê? | Resumo da peça: modelo, tese, motivo da escolha pelo motor |
| 11 | Como foi calculado o prazo? | `raciocinio`: premissa (direito), aplicação (fato com datas), conclusão |

As perguntas 9 e 10 dependem do resumo da peça. Sem peça, o Lu mostra a mensagem de que não houve peça gerada e oferece as demais.

As perguntas são organizadas nas três frentes que já existem na tela (fundamentação legal, estratégia processual, conferência de dados), mais um grupo "Peça".

## 2. Perguntas com IA (5 por consulta)

Para tudo que o catálogo acima não cobre: estratégia e comparação de caminhos, aplicação de súmula ou tema ao caso, dúvida sobre trecho dos documentos, explicação em linguagem mais simples.

Sugestões clicáveis dessa categoria na tela inicial (cada uma gasta 1 das 5, e a tela avisa isso):

- Entre exceção de pré-executividade e embargos, qual caminho você recomenda aqui e por quê?
- Há tese complementar ao que o parecer concluiu (por exemplo prescrição intercorrente, nulidade da CDA)?
- A Fazenda pode alegar causa de interrupção ou suspensão que o parecer não considerou?
- Que provas ou documentos ainda reforçariam a conclusão?
- Explique a conclusão do parecer em linguagem simples, para o cliente.

O campo livre fica sempre disponível enquanto houver cota.

### Contexto enviado ao modelo

Blocos numerados, cada um com um identificador único na mensagem:

- `[D1]…`: trechos de documentos do caso (nome do documento, página, texto)
- `[P1]…`: itens do parecer (conclusões, fatos, raciocínio, recomendações)
- `[A1]…`: itens do resumo da peça (modelo, pendências)
- `[L1]…`: legislação (norma e artigo)

O modelo é instruído a citar com esses identificadores.

### Conferência em código

1. Extrai do texto todos os `[Xn]` citados.
2. Descarta (remove do texto) qualquer identificador que não exista nos blocos enviados.
3. Devolve à tela só as fontes citadas, na ordem de aparição.
4. Resposta sem nenhuma citação válida é marcada "sem fonte conferida" e não desconta cota.

### Regra de resposta

Basta ter pelo menos uma fonte do próprio caso (documento, parecer ou peça). Legislação sozinha continua não bastando. Sem fonte do caso, resposta "não sei" sem chamar o modelo e sem descontar cota (comportamento atual preservado).

## 3. Ligação ao parecer e à peça

- O parecer já está salvo em `analises.resultado`: nada novo para ler.
- Resumo da peça: quando a peça é gerada, o sistema guarda um resumo pequeno em `analises.peca_resumo` (jsonb) com modelo, tese, motivo da escolha, datas e prazos usados, quantidade e texto dos campos pendentes, e figuras. Não guarda o texto jurídico dos modelos.
- Gravação com o token do próprio usuário (RLS), pelo mesmo caminho dos demais campos da análise. A confirmar na implementação se a policy de UPDATE de `analises` já cobre a coluna.
- Sem peça gerada: coluna nula, aviso discreto na tela.
- Resumo desatualizado: cada nova geração substitui o anterior, com a data da geração visível na resposta.

## 4. Itens técnicos

- `api/lu.js` passa a usar `chamarGemini` de `api/_gemini-resiliente.js` (retentativas em 502/503, proteção do 402, mensagem de erro clara), como o motor de peças.
- A cota passa a 5: constante `LIMITE_PERGUNTAS` e valor padrão da coluna `analises.perguntas_lu_disponiveis` para consultas novas (migração). Consultas antigas que ainda têm mais de 5 passam a mostrar e a usar no máximo 5.
- A fonte de documento abre o PDF com o visualizador `src/lib/pdfPaginas.js`, na página citada, com o trecho exibido ao lado. Sem caixa de destaque sobre o texto (decisão de não complicar).
- Lógica das pré-montadas em módulo próprio e puro (`src/lib/luPreMontadas.js`), sem React e sem rede.
- Conferência de citações em módulo puro no servidor (`api/_lu-citacoes.js`).

## 5. Testes

- Pré-montadas: cada uma dos 11 casos, sobre os 34 casos fictícios (parecer sintético a partir do gabarito), com e sem peça; garantia de que nenhuma depende de rede.
- Citações: identificador inválido removido, sem citação, citação repetida, ordem de aparição, texto sem identificador.
- Contexto: numeração dos blocos, parecer e peça presentes, ausência de peça.
- Regra de resposta: sem fonte do caso, "não sei" sem chamar o modelo e sem desconto.
- Cota 5: desconto só em resposta de IA bem-sucedida; pré-montada não desconta.
- Rodada com o Gemini real, em perguntas de exemplo dos casos fictícios, medindo a taxa de citações válidas.
- Navegador: tela inicial, resposta pré-montada, aviso de peça ausente, abertura da fonte na página.

## 6. Fora do escopo

- Lu gerar peça, abrir fluxos ou corrigir dados (ligação só explicativa).
- Destacar o trecho com uma caixa sobre a página do documento.
- Mudança do comportamento da main: tudo na `feat/lu-novo`, até você pedir o merge.

## 7. Resultado (23/10/2026)

- Cota de IA: 5 por consulta, confirmada pelo Luan. Sugestões clicáveis gastam 1 da cota.
- Resumo da peça: `{ gerada_em, pecas: [{ modelo, tese, descricao, data_referencia, campos_preencher, figuras, a_confirmar, avisos }] }`, gravado pelo navegador.
- Recusa explícita do modelo ("Não possuo essa informação") não é tratada como falha de fonte: não é marcada e não desconta.
- Medição com o Gemini real (caso P03, 18 perguntas, com e sem peça): 16 respostas com citação válida, 2 recusas corretas (pergunta fora do contexto), 0 identificador inventado, pergunta sobre a peça respondida corretamente nos dois contextos. Testes: 367 passando.
- Pendente: migração `docs/migracoes/2026-10-23-lu-peca-resumo-e-cota-5.sql` em produção (só com autorização expressa) e merge da `feat/lu-novo` na main (só quando o Luan pedir).

## 8. Pontos que foram confirmados na revisão

1. Cota de IA em 5: confirma o número, ou prefere outro?
2. "5 perguntas com IA" é a cota do campo livre mais as sugestões clicáveis da seção 2 (cada uma gastando 1 da cota)? Foi assim que interpretei.
3. A migração tem duas partes: coluna `peca_resumo` e novo padrão da cota. Só roda com sua autorização.
