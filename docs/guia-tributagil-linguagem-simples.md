# TributÁgil explicado de forma simples

Versão de 26/11/2026. Este guia explica, passo a passo e sem juridiquês, o que o TributÁgil faz. No fim há um
pequeno dicionário com as palavras técnicas que aparecem pelo caminho.

---

## A ideia em uma frase

Quando o governo cobra um imposto atrasado, a lei dá a ele um **tempo limite** para cobrar. O TributÁgil lê os
documentos da cobrança, faz as contas das datas e mostra se esse tempo já acabou. Se acabou, a dívida pode ser
cancelada, e o sistema já prepara o documento que o advogado vai entregar à Justiça ou ao governo.

---

## Como o sistema pensa

1. **A inteligência artificial lê; a calculadora decide.** A IA lê os papéis e anota as datas importantes: quando a
   dívida foi criada, quando o governo foi à Justiça, quando houve um parcelamento e assim por diante. Quem faz a
   conta dos prazos é uma calculadora programada com as regras da lei, sempre do mesmo jeito.
2. **Na dúvida, o sistema para e avisa.** Se falta uma data ou algo pode mudar a conta, o sistema não chuta. Ele
   mostra o que precisa ser conferido.
3. **Tudo é rascunho até o advogado revisar.** O que o sistema não sabe aparece marcado em amarelo, para o advogado
   completar ou conferir antes de entregar.

---

## Passo a passo

### Passo 1: entrar e ter créditos
- A pessoa cria a conta com e-mail e senha. Cada conta nova ganha 3 créditos.
- Cada análise de um caso gasta 1 crédito. Se a análise der erro no meio do caminho, o crédito volta sozinho.
- Até 5 dias depois de uma análise, dá para pedir o crédito de volta explicando o motivo. A equipe avalia o pedido.

### Passo 2: cadastrar o escritório
- Uma única vez, o advogado cadastra o nome do escritório, o logotipo e os advogados com o número da OAB.
- Esses dados entram automaticamente no topo e na assinatura de todos os documentos.

### Passo 3: enviar os documentos da cobrança
- Arquivos em PDF ou fotos, somando até 12 MB por análise.
- Quanto mais completo, melhor: certidão da dívida, processo de cobrança, declarações, extratos, parcelamentos.
- Se chegar um documento novo depois, ele pode ser somado ao mesmo caso, e o sistema faz uma nova versão da
  análise sem apagar a anterior.

### Passo 4: o sistema analisa (alguns minutos)
Ele verifica quatro tempos limite:
1. **Quando a dívida passou a valer.** Isso define a data de início da contagem.
2. **Se o governo demorou demais para criar a cobrança** (decadência: 5 anos).
3. **Se o governo demorou demais para cobrar na Justiça** (prescrição: 5 anos). Aqui o sistema leva em conta o que
   pausa ou reinicia o relógio: um parcelamento, um pagamento, a decisão do juiz mandando chamar o devedor.
4. **Se o processo de cobrança ficou parado tempo demais** (prescrição intercorrente). Quando o governo não acha o
   devedor ou bens para penhorar, conta-se 1 ano de pausa e depois 5 anos. Pedidos de busca que não dão em nada não
   param o relógio; só uma penhora de verdade ou o devedor ser encontrado e oficialmente avisado param.

Também verifica se parte da dívida já foi quitada por compensação, um encontro de contas com créditos que a pessoa
tinha com o governo.

### Passo 5: o resultado
A tela mostra:
- **Conclusões:** o que é favorável, o que pede atenção e o que não ajuda, com o grau de certeza.
- **Linha do tempo:** os fatos do caso em ordem de data, cada um com o documento de onde saiu.
- **Raciocínio:** a conta passo a passo (a regra, as datas do caso e o resultado).
- **Recomendações:** o caminho sugerido.
- **Anotações:** espaço para o advogado registrar correções.
- **Relatório para o cliente:** a versão em linguagem simples (Passo 10).

O resultado pode ser baixado em Word, em texto ou impresso em PDF.

### Passo 6: perguntar ao assistente (Lu)
- O botão **"Conversar com o Lu"** abre um chat sobre aquele caso.
- O Lu responde procurando dentro dos documentos e diz de qual arquivo e de qual página tirou cada informação.
- Ele só fala daquele caso e não altera nada sozinho.

### Passo 7: gerar o documento para a Justiça ou para o governo
- Com um clique, o sistema monta o documento em Word, com o timbre do escritório:
  - se a cobrança já está na Justiça: uma petição pedindo o fim da cobrança;
  - se ainda não está: um pedido de revisão direto ao órgão que cobra.
- Ele também confere outras defesas comuns:
  - cobrança feita contra um sócio que não deveria responder pela dívida da empresa;
  - certidão da dívida com erro grave;
  - dívida que já tinha sido paga ou que está sendo cobrada duas vezes.
- Se algo impede o documento (por exemplo, um parcelamento no meio do caminho), o sistema explica o porquê em vez
  de gerar algo errado.
- Hoje, gerar o documento não gasta crédito.

### Passo 8: revisar e ajustar o documento
- O texto aparece dividido por partes, para o advogado revisar e corrigir antes de baixar.
- O sistema encontra nos papéis as páginas que viram imagem dentro do documento (como a certidão da dívida).
- O botão **"Pedir ao Lu"** pede ajustes num trecho. O Lu sugere, e o advogado aceita ou recusa.
- O documento fica salvo com as 3 últimas versões.

### Passo 9: os próximos documentos do processo
Em "Outras peças deste caso", o sistema prepara:
- **Resposta ao governo:** quando o governo contesta, o advogado envia a contestação, o sistema confere cada
  argumento contra as datas e monta a resposta.
- **Embargos:** a defesa completa, usada quando já houve penhora ou depósito para garantir a cobrança.
- **Recurso (agravo):** quando o juiz nega o primeiro pedido.
- **Pedido simples** para o juiz reconhecer que o processo ficou parado tempo demais.

Nos prazos desses documentos, o sistema já desconta fins de semana, feriados nacionais e o recesso de fim de ano da
Justiça (20/12 a 20/01). Feriados da cidade ou do estado ficam marcados para o advogado conferir.

### Passo 10: o relatório para o cliente
Na aba "Relatório para o cliente", o escritório gera um relatório com o próprio logotipo, em linguagem simples. Ele
mostra:
- o que foi encontrado a favor do cliente e quais cobranças foram atingidas;
- quanto da dívida pode ser cancelado, com os valores informados pelo escritório;
- uma estimativa dos **honorários que o governo pode ser condenado a pagar** se a defesa der certo. Esse valor é
  pago pelo governo, não pelo cliente;
- os próximos passos.

O relatório pode ser impresso, salvo em PDF, baixado em Word ou copiado.

### Passo 11: acompanhar os prazos (Carteira e prazos)
- Uma tela reúne todos os casos e mostra em que fase cada um está (analisado, documento gerado, entregue, decidido,
  arquivado).
- Um **calendário** mostra os dias em que um prazo vence: vermelho para o que já venceu, amarelo para o que vai
  vencer. Ao lado, uma agenda lista os próximos 90 dias.
- Os **avisos** aparecem dentro da plataforma, sem e-mail: faixas no topo da carteira e um número no botão "Carteira
  e prazos" da tela inicial.
- Filtros ajudam a achar rápido os casos que pedem atenção, por situação, nome, número da certidão, fase ou tipo de
  defesa.

---

## Segurança e privacidade
- Cada pessoa só vê os próprios casos e documentos.
- Os créditos só mudam pelo sistema, nunca pela tela.
- A pessoa pode apagar os próprios dados a qualquer momento.

## O que o sistema não faz
- Não enxerga o que não está nos documentos enviados. Um parcelamento ou uma penhora que não constam dos papéis não
  entram na conta.
- Não substitui o advogado: tudo o que ele prepara é rascunho, e o advogado revisa e assina.

---

## Pequeno dicionário

| Palavra | O que significa |
|---|---|
| **Prescrição** | O governo perdeu o prazo para cobrar a dívida na Justiça (5 anos). |
| **Decadência** | O governo perdeu o prazo para criar a cobrança do imposto (5 anos). |
| **Prescrição intercorrente** | O processo de cobrança ficou parado tempo demais sem achar o devedor ou bens. |
| **CDA (Certidão de Dívida Ativa)** | O documento oficial que registra a dívida com o governo. |
| **Execução fiscal** | O processo na Justiça em que o governo cobra a dívida. |
| **PGFN / Procuradoria** | O órgão que cobra as dívidas com o governo federal. |
| **Exceção de pré-executividade** | Pedido ao juiz para encerrar a cobrança quando o erro é evidente pelos documentos, sem precisar garantir a dívida. |
| **Embargos** | A defesa completa contra a cobrança, apresentada depois de garantir a dívida (penhora ou depósito). |
| **Agravo** | Recurso contra uma decisão do juiz durante o processo. |
| **Penhora** | Quando a Justiça separa um bem ou dinheiro do devedor para pagar a dívida. |
| **Citação** | Quando o devedor é oficialmente avisado do processo. |
| **Parcelamento** | Acordo para pagar a dívida em parcelas; ele pausa e reinicia a contagem dos prazos. |
| **Honorários de sucumbência** | Valor que quem perde o processo paga ao advogado de quem ganhou. |
