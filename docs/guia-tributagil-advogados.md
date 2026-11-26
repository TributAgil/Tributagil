# TributÁgil: guia completo para advogados

Versão de 26/11/2026. Este guia descreve, passo a passo, tudo o que a plataforma faz, com a terminologia jurídica e o
encadeamento processual de cada etapa.

---

## 0. Premissas de funcionamento

1. **A IA lê e extrai; o código calcula.** A inteligência artificial lê os documentos e extrai fatos e datas: CDA,
   período de apuração, modalidade de lançamento, notificação, ajuizamento, despacho de citação, parcelamento,
   pagamento, intimação de não localização, penhora etc. Os prazos de prescrição, decadência e prescrição intercorrente
   são contados por motor determinístico, em código, sobre esses fatos. A IA não "decide" a tese.
2. **Na dúvida, bloqueia.** Quando falta dado, a data é inválida ou o caso tem um evento que pode alterar o prazo
   (por exemplo, parcelamento no meio da contagem), o sistema não presume. Ele bloqueia a peça e diz o que precisa ser
   conferido.
3. **Tudo é minuta.** Parecer e peças saem com o aviso fixo "Minuta gerada automaticamente. Revisão do advogado
   responsável é obrigatória antes do protocolo". O que o sistema não sabe sai marcado: `[PREENCHER: ...]` para dado
   faltante e `[CONFIRMAR: ...]` para ponto que exige conferência nos autos. Os dois aparecem destacados em amarelo
   no Word.
4. **Fontes rastreáveis.** O parecer indica o documento de origem de cada fato. O assistente (Lu) cita o arquivo e a
   página de onde tirou cada informação e os dispositivos da base de legislação curada.

---

## 1. Conta, créditos e histórico

1. **Cadastro e login** com e-mail e senha, protegidos por verificação contra robôs (hCaptcha). Há recuperação de
   senha por e-mail.
2. **Créditos de análise.** Cada conta nova recebe 3 créditos gratuitos. Cada análise (e cada reanálise de um caso)
   consome 1 crédito, debitado de forma atômica no servidor (primeiro o bônus, depois o plano). O saldo aparece na
   barra de créditos.
3. **Proteção contra cobrança em dobro.** Um duplo clique ou uma reconexão não cobram duas vezes a mesma análise
   (idempotência). Se a análise falhar depois do débito (erro do serviço de IA, tempo esgotado), o crédito é estornado
   automaticamente.
4. **Estorno a pedido.** No Histórico, até 5 dias depois da análise, o usuário pode pedir o estorno informando o
   motivo. O pedido é avaliado pela equipe; não é automático.
5. **Histórico de resultados:**
   - busca por título ou conteúdo;
   - filtro por resultado;
   - reabrir qualquer análise;
   - baixar todo o histórico;
   - excluir uma análise ou todos os dados ("Excluir meus dados/histórico"), conforme a LGPD.
6. **Navegação:** no Histórico, os botões "Início" (tela inicial) e "Carteira e prazos" ficam ao lado de
   "+ Nova Análise".

---

## 2. Cadastro do escritório (timbre e assinatura)

Feito uma vez e usado em todas as peças e no relatório ao cliente:

1. Nome do escritório, cidade/UF, endereço, e-mail e site.
2. Logo em PNG ou JPG de até 1 MB, que entra no cabeçalho das peças e do relatório.
3. Advogados: nome, número e UF da OAB, e gênero. O gênero define o tratamento na peça ("sua advogada", "seus
   advogados" etc.); o sistema nunca presume.
4. **Perfil da peça.** O número do documento da procuração ("Doc. nº") e a qualificação do cliente são lembrados por
   escritório e por caso. O que for digitado na geração prevalece sobre o salvo; campo deixado em branco não apaga o
   salvo.

---

## 3. Nova análise: envio dos documentos

1. **Arquivos aceitos:** PDF e imagens (JPG, PNG, WEBP), vários por análise, até 12 MB no total. As imagens são
   reduzidas automaticamente antes do envio.
2. **Documentos úteis:**
   - CDA;
   - petição inicial da execução fiscal;
   - despacho de citação e AR;
   - DCTF, PGDAS-D, GFIP e demais declarações;
   - auto de infração e notificação de lançamento;
   - decisões administrativas (DRJ/CARF);
   - extratos de débito (e-CAC, Regularize, SEFAZ);
   - termos de parcelamento e rescisão;
   - intimação de não localização de bens ou devedor;
   - certidões de penhora;
   - manifestações da Fazenda.
3. **Caso e versões.** Cada análise pertence a um caso. "Adicionar documento a este caso" gera uma nova versão do
   parecer sem apagar a anterior (histórico versionado).
4. Os documentos ficam no armazenamento privado do próprio usuário. Arquivos que não se vinculam a nenhum caso são
   apagados automaticamente por uma rotina de limpeza.

---

## 4. Processamento ("Cérebro Tributário")

A análise roda em duas fases, com acompanhamento em tela.

### Fase 1: extração estruturada

O modelo lê os documentos e monta a tabela de eventos de cada inscrição: datas, categoria do evento e documento de
origem.

### Fase 2: parecer pelos módulos de análise

**Módulo 1: Constituição Definitiva do Crédito Tributário (CDCT).** Classifica o lançamento:

| Tipo | Situação | CDCT |
|---|---|---|
| A | Declaração seguida de lançamento de ofício sobre ela | Notificação da decisão final do recurso administrativo ou 31º dia após a notificação da guia |
| B | Lançamento por homologação (DCTF, PGDAS-D, GFIP) | O posterior entre a entrega da declaração e o vencimento (Súmula 436/STJ) |
| C | Lançamento de ofício | 30 dias após a ciência; havendo recurso, 30 dias após a decisão da DRJ ou do CARF |

A inscrição em dívida ativa nunca é tratada como CDCT.

**Módulo 2: decadência (5 anos).**
- art. 173, I, do CTN para lançamento de ofício, ausência de declaração e de pagamento (Súmula 555/STJ) ou
  dolo/fraude comprovados documentalmente (o ônus é do Fisco);
- art. 150, § 4º, do CTN para homologação com pagamento, ainda que parcial;
- declaração sem pagamento é confissão de dívida: não há decadência, e o caso segue para a prescrição.

**Módulo 3: prescrição ordinária (art. 174 do CTN c/c Súmula 150/STF).** A contagem começa na CDCT.
- **Suspensões (art. 151):** parcelamento, liminar, depósito integral e recurso administrativo.
- **Interrupções (art. 174, parágrafo único):** despacho que ordena a citação (após a LC 118/2005), protesto, ato
  judicial que constitua em mora e ato inequívoco de reconhecimento, inclusive parcelamento e pagamento.
- **Regra de ordem:** ato posterior à consumação não interrompe nem reabre o prazo. O crédito já está extinto
  (art. 156, V), e pagamento de dívida prescrita configura indébito (art. 165, I).
- **Rescisão de parcelamento:** tratada como marco interruptivo, sempre com alerta da divergência jurisprudencial
  (interrupção ou mera cessação da suspensão).
- **Súmula 106/STJ:** alerta sobre a demora imputável ao Judiciário.
- **Check final de suspensão ativa:** havendo causa de suspensão em curso, o resultado é "exigibilidade suspensa",
  não extinção.

**Módulo 4: prescrição intercorrente (art. 40 da LEF; REsp 1.340.553/RS, Temas 566 a 571).**
- Marco inicial: ciência da Fazenda sobre a não localização do devedor ou de bens.
- Contagem automática: 1 ano de suspensão e, em seguida, 5 anos de prescrição, independentemente de decisão
  formal de suspensão ou arquivamento.
- Só a efetiva constrição patrimonial e a efetiva citação interrompem. O requerimento de constrição feito dentro do
  prazo que resultar em constrição efetiva retroage à data do protocolo.
- Cada episódio de não localização é um ciclo próprio.
- O cálculo é feito em código e conferido contra o texto do parecer.
- Roda independentemente do Módulo 3: um crédito pode ter a prescrição ordinária não configurada e a intercorrente
  reconhecida.

**Compensação (art. 156, II, do CTN).** Verificada à parte, como hipótese autônoma de extinção. Nunca é tratada
como pagamento nem como causa interruptiva.

**Protocolo de alerta.** Faltando dado essencial (por exemplo, a modalidade de lançamento), o parecer diz qual dado
falta em vez de presumir.

**Falhas.** Se a análise falhar, a tela mostra o erro e o botão "Sinalizar erro", que manda o registro técnico ao
suporte.

---

## 5. Resultado da análise (parecer)

1. **Cabeçalho:** número do processo, partes (exequente e executado), valor da causa e juízo.
2. **Aba Conclusões.** Um item por módulo aplicável (decadência, prescrição, intercorrente, compensação, cautela,
   procedimental, suspensão ativa), cada um com:
   - severidade: favorável, atenção, neutro ou desfavorável;
   - grau de confiança;
   - resumo e fundamento legal, com o texto do dispositivo citado ao alcance de um clique.
3. **Aba Fatos importantes:** linha do tempo em ordem cronológica, com a fonte de cada fato. O parcelamento sempre
   aparece em destaque.
4. **Aba Raciocínio lógico:** um silogismo por módulo (premissa normativa, aplicação às datas do caso, conclusão e
   referência).
5. **Aba Recomendações:** a via sugerida (administrativa, exceção de pré-executividade ou embargos) e as providências.
6. **Aba Anotações do usuário:** correções e ressalvas do advogado, salvas com a análise e incluídas nos downloads.
7. **Aba Relatório para o cliente** (item 10).
8. **Downloads:** Word, texto (.txt) e impressão em PDF.
9. **Conversar com o Lu** (botão no canto esquerdo): perguntas sobre o parecer e os documentos, com citação de
   arquivo e página (item 7).

---

## 6. Gerar a peça (Word editável)

### 6.1 Como a peça é decidida

1. Uma segunda extração estruturada lê os documentos de novo: inscrições, períodos, modalidade, datas, eventos,
   redirecionamento, requisitos da CDA, quitações.
2. O motor de peças avalia cada tese separadamente. Um caso pode ter mais de uma peça.
   - **Prescrição ordinária:** com execução, exceção de pré-executividade (EPE); sem execução, Pedido de Revisão de
     Débito Fiscal (PGFN).
   - **Decadência:** com execução, EPE de decadência; sem execução, Pedido de Revisão de Débito Fiscal (decadência).
   - **Prescrição intercorrente:** EPE de prescrição intercorrente, só com execução ajuizada.
3. **Bloqueios.** Nesses casos a peça não sai, e o sistema lista o motivo e a orientação:
   - parcelamento, pagamento ou outro ato no meio do prazo;
   - divergência entre o cálculo e o parecer (registrada para auditoria);
   - modalidade de lançamento não identificada;
   - evento com data inválida;
   - crédito declarado: não há peça de decadência, com o aviso da Súmula 436/STJ;
   - saída malformada da extração.
4. **Teses adicionais**, avaliadas em código e conservadoras (na dúvida, bloqueiam):
   - **Ilegitimidade passiva do sócio (redirecionamento):** a peça é do sócio.
     - mero inadimplemento: Súmula 430/STJ;
     - dissolução irregular com retirada anterior: Tema 962/STJ;
     - sócio sem poderes de gerência na data da dissolução: Tema 981/STJ;
     - prescrição para o redirecionamento: Tema 444/STJ, com `[CONFIRMAR]` sobre a inércia;
     - honorários: Tema 961/STJ;
     - nome do sócio na CDA: bloqueia e orienta embargos (REsp 1.110.925/SP: ônus da prova).
   - **Nulidade da CDA:** requisito essencial ausente na CDA anexada (art. 202 do CTN e art. 2º, § 5º, da LEF), com o
     aviso da Súmula 392/STJ e do art. 203 do CTN sobre a substituição da CDA.
   - **Cobrança indevida:** período quitado antes da inscrição (art. 156, I, do CTN) e cobrança do mesmo tributo e
     período em duas inscrições (duplicidade sai com `[CONFIRMAR]`).
5. Gerar a peça hoje não consome crédito de análise.

### 6.2 O que vem em cada peça

- Timbre, endereçamento (juízo da execução ou Procuradoria), qualificação, fatos, cabimento (Súmula 393/STJ na EPE),
  mérito com as datas calculadas por CDA e período, pedidos, honorários (art. 85, §§ 2º e 3º, do CPC), fecho e
  assinatura dos advogados cadastrados.
- Lista de CDAs e períodos que entram na peça, com termo inicial e consumação de cada um.

---

## 7. Editor da peça e assistente Lu

1. **Revisão por tópicos.** O texto da peça aparece separado por seção, para editar antes de baixar. Notas de rodapé,
   campos automáticos e imagens são preservados.
2. **Figuras.** O sistema localiza nos documentos as páginas que viram figura (CDA, despacho, AR etc.). O advogado
   confere e confirma, e a figura entra no lugar certo.
3. **Peça salva.** A peça fica salva com a análise. As 3 últimas versões são mantidas, e "Abrir peça salva" reabre
   a última revisão sem ler os documentos de novo.
4. **Pedir ao Lu:** pedido de ajuste num trecho ("reescreva o tópico X", "inclua o argumento Y"). O Lu propõe, e o
   advogado aceita ou recusa. Nada é alterado sozinho.
5. **Conversar com o Lu:** chat sobre aquele caso, disponível no editor e no resultado da análise.
   - responde e busca informações dentro dos documentos enviados, citando arquivo e página;
   - cita a legislação da base curada (CTN, LEF, CPC, súmulas e temas);
   - fica restrito ao caso aberto;
   - no editor, também pode propor alterações na peça.
6. **Limite diário do Lu.** Cada usuário tem 1.000.000 de créditos informativos por dia para o Lu, o equivalente a
   US$ 1,00 do modelo de IA. Um medidor mostra o consumo do dia. Esses créditos não se confundem com os créditos de
   análise.

---

## 8. Outras peças do caso

Ficam em "Gerar peça" → "Outras peças deste caso". Todas saem no mesmo modelo, com o timbre do escritório.

1. **Réplica à manifestação da Fazenda.** O advogado envia a impugnação (PDF ou imagem). A IA só extrai os
   argumentos, e o código confronta cada data alegada com o cálculo:
   - ato posterior à consumação: refutado (art. 156, V, do CTN);
   - ato dentro do prazo de crédito prescrito: `[CONFIRMAR]`;
   - pedido de penhora sem constrição efetiva: refutado pelo REsp 1.340.553/RS;
   - penhora ou citação efetiva na janela da intercorrente: `[CONFIRMAR]`, avisando que a Fazenda pode ter razão;
   - inadequação da via: Súmula 393/STJ;
   - argumento sem resposta automática: `[PREENCHER]`.
2. **Embargos à execução fiscal (art. 16 da LEF).** Pedem a data da intimação da garantia e a forma (penhora,
   depósito, fiança ou seguro).
   - Prazo de 30 dias calculado em dias corridos e em dias úteis (art. 219 do CPC), com aviso se venceu.
   - Matérias de defesa tiradas do cálculo do caso. A ilegitimidade do sócio com nome na CDA entra aqui, porque nos
     embargos cabe a prova.
   - Efeito suspensivo (art. 919, § 1º, do CPC), provas e valor da causa.
   - Exige execução ajuizada.
3. **Agravo de instrumento** contra a decisão que rejeitou a exceção (art. 1.015, parágrafo único, do CPC).
   - Pede a data da intimação, o tribunal (opcional) e o resumo da decisão (opcional).
   - Prazo de 15 dias úteis (art. 1.003, § 5º, do CPC).
   - TRF ou TJ conforme o ente credor.
   - Peças obrigatórias (art. 1.017 do CPC) e efeito suspensivo (art. 1.019, I, do CPC).
4. **Pedido de reconhecimento da prescrição intercorrente (art. 40, § 4º, da LEF).** Petição simples com as datas do
   cálculo. Só sai quando a intercorrente está consumada.
5. **Calendário forense dos prazos processuais.** São descontados:
   - fins de semana;
   - feriados nacionais (inclusive 20/11);
   - Sexta-feira da Paixão;
   - suspensão de 20/12 a 20/01 (art. 220 do CPC);
   - na Justiça Federal, os dias da Lei nº 5.010/1966: Carnaval, quarta e quinta-feira santas, 11/08, 01/11 e 08/12.

   Feriado estadual ou municipal e ponto facultativo do tribunal não são descontados, para o prazo calculado nunca
   passar do real. Eles vão para o `[CONFIRMAR]`, que lista os feriados que caíram no período.

---

## 9. Carteira e prazos

1. **Uma linha por caso**, sempre com a versão mais nova da análise, e a fase do caso: analisado, peça gerada,
   protocolado, decidido ou arquivado.
2. **Marcos de prazo** gravados a cada geração de peça ou pelo botão "Calcular prazos", que lê os documentos e roda o
   motor sem gerar peça e sem gastar crédito:
   - **consumado:** já prescrito ou decaído quando calculado; a tese está pronta;
   - **acompanhar:** consuma numa data conhecida, desde que nada interrompa. Vale para a prescrição ordinária sem
     execução ("desde que a execução não seja ajuizada até lá") e para a intercorrente em curso ("desde que não haja
     penhora efetiva ou citação").
3. **Calendário do mês:** vermelho para prazo consumado, amarelo para prazo que vai consumar. Clicar num dia filtra
   os casos daquele dia.
4. **Agenda:** os próximos 90 dias e o que já consumou e pede atenção.
5. **Avisos dentro da plataforma, sem e-mail:**
   - faixas no topo: "prazos que consumaram" e "prazos nos próximos 30 dias";
   - contador no botão "Carteira e prazos" do painel (vermelho para consumado, amarelo para próximo).
6. **Filtros:**
   - cartões de situação: consumados agora, prontos para a peça, em acompanhamento, pedem revisão e sem cálculo;
   - busca por nome do caso ou número da CDA;
   - fase e tese;
   - "Só encerrados".
7. Quando o cálculo pede conferência manual, a tese aparece com os motivos. Se houver versão mais nova da análise,
   o sistema avisa para recalcular.

---

## 10. Relatório para o cliente

Aba do resultado da análise. Traduz o parecer para o cliente leigo, com o timbre do escritório.

1. **Resumo** do que foi encontrado a favor do cliente, com explicação em linguagem simples de cada tese favorável.
2. **Cobranças atingidas** (CDA e período, com a data) e **prazos acompanhados**, quando a carteira já tem o cálculo.
3. **Pontos a conferir**, que são as conclusões marcadas como "atenção".
4. **Valores.** O sistema não inventa valor: o escritório informa o total atualizado e quanto foi atingido (o valor
   da causa vem sugerido). O relatório mostra o percentual atingido e o que continuaria devido.
5. **Honorários de sucumbência (art. 85, § 3º, do CPC).** Estimativa em escada (§ 5º) sobre o valor atingido, com o
   salário mínimo editável (R$ 1.621,00 desde 01/01/2026, Decreto nº 12.797/2025).
   - Só com execução ajuizada; na via administrativa não há condenação.
   - O texto esclarece que esses honorários são pagos pela Fazenda e não se confundem com os contratados.
6. **Próximos passos:** EPE (sem necessidade de garantia), pedido administrativo, ou parcelamento e transação para o
   que continua devido. Há também campo de observações do escritório.
7. **Saídas:** imprimir ou salvar em PDF (A4), Word ou copiar o texto.

---

## 11. Segurança e privacidade

1. Cada usuário só enxerga os próprios casos, análises, peças e arquivos (Row Level Security no banco).
2. Saldo de créditos e funções de débito e estorno só mudam pelo servidor. As funções sensíveis exigem um segredo do
   servidor e não podem ser chamadas sem login.
3. Limite de requisições por endereço de acesso, contra abuso e robôs.
4. Exclusão de dados a pedido do titular (LGPD) e limpeza automática de arquivos órfãos.

---

## 12. Limites e responsabilidade

1. O resultado depende dos documentos enviados. Ato que não consta dos autos analisados (parcelamento, penhora,
   citação) não é considerado.
2. Prazos processuais: feriados locais e portarias de suspensão do tribunal devem ser conferidos.
3. As peças novas (réplica, embargos, agravo, reconhecimento, teses adicionais) e os textos do relatório são minutas
   pendentes da revisão jurídica do escritório (`templates/pecas/REVISAO_JURIDICA.md`).
4. A responsabilidade técnica pelo protocolo é sempre do advogado.
