# Pontos para revisão jurídica dos modelos de peça

Documento para a advogada responsável. O sistema **não alterou o texto jurídico**
dos três modelos originais — só trocou dados do caso (datas, CDA, PAF, nomes)
por campos preenchidos automaticamente. Os **dois modelos novos** (Revisão por decadência e EPE por
prescrição intercorrente) são **minutas redigidas sem a sua revisão** — veja a seção
"Modelos novos" mais abaixo. Abaixo, tudo o que o sistema notou e
**não decidiu sozinho**, e o que foi mudado por ser erro de contexto (e não de tese).

Os originais, sem nenhuma alteração, estão em `templates/pecas/originais/`.
Os modelos com campos automáticos são gerados por `scripts/templates-pecas/gerar_templates.py`
(basta rodar de novo quando o texto de um modelo mudar).

---

## O que o sistema corrigiu (erros de contexto, não de tese)

**Pedido de Revisão de Débito Fiscal (PGFN)** — o texto foi escrito a partir de uma
peça judicial e ficou com vocabulário de processo:

- "pela **Executada** e recepcionada pela **Exequente**" → "pela **Devedora** e recepcionada pela **Fazenda Nacional**".
- "emolumentos ao **executado**" → "ao **devedor**".
- "débito objeto dessa **execução**" → "dessa **inscrição em dívida ativa**".
- Frase que estava cortada no meio ("…ao promover a presente c") foi **completada** com o mesmo
  trecho da EPE de prescrição, sem a palavra "executiva":
  "ao promover a presente cobrança, baseada em crédito que claramente não desfruta das
  características de certeza, liquidez e exigibilidade."
  → **Confirmar** se é essa a redação desejada.
- A frase "até o presente (xxxxxx) não houve a realização da cobrança judicial" agora mostra a
  data de geração da peça. (A menção a "execução fiscal devidamente proposta" nessa frase foi
  mantida: ali ela diz justamente que **não** houve execução.)

**EPE de decadência**:

- O "]" solto depois de "no caso em apreço." foi removido.
- O trecho destacado "(Escolha o que encaixa a seu caso)" virou **lógica automática**: o sistema
  escolhe entre art. 150, § 4º e art. 173, I do CTN conforme o pagamento antecipado informado.
- "Fulana de Tal" fixo nos pedidos virou o nome do executado.

**Todos os modelos**: datas, nomes de advogados, CDA, número de PAF, cidade e data do fecho viraram
campos. Os prints de documentos que estavam dentro dos modelos (continham nome de parte de um
processo real) **foram removidos** e substituídos por um marcador `[INSERIR FIGURA n – …]`.
O timbrado ("Programa Advogado Aprendiz") virou os dados do escritório cadastrado (logo opcional).
O nome da pessoa que figurava nas propriedades do arquivo foi retirado.

---

## O que precisa da sua decisão (o sistema manteve o texto original)

### Prescrição — EPE e Revisão PGFN

1. **Decreto 20.910/32 e Lei 9.873/99 como "termo final".**
   O Decreto 20.910/32 trata de dívidas **da** Fazenda (contra a Fazenda), não de créditos tributários
   da Fazenda; e a Lei 9.873/99, art. 5º, exclui matéria tributária. O rótulo do segundo artigo está
   como "**Decreto** 9.873/99". O sistema **não mexeu** no texto, mas isolou esse bloco: na tela
   "Gerar peça" há uma opção para **não incluir** essa citação (`incluir_bloco_decreto_lei`, ligada por
   padrão). Observação: a frase seguinte ("Desse modo, nos termos dos dispositivos acima colacionados…")
   continua no texto mesmo com o bloco desligado — pode precisar de ajuste.
2. **Convenção de contagem "dia seguinte" (Tema 265/STJ).**
   O texto do modelo cita que o termo inicial é "o dia seguinte ao vencimento… ou a data da entrega,
   o que for posterior". O sistema calcula **termo inicial = a data posterior entre vencimento e entrega**
   e **consumação = mesma data, 5 anos depois** (convenção do próprio modelo: 27/01/2020 → 27/01/2025).
   A peça só é considerada prescrita se o ajuizamento for **posterior** à consumação. Confirmar se a
   leitura "dia seguinte" deve mudar o cálculo (1 dia de diferença nos casos-limite).
3. **Qual marco a EPE de prescrição deve usar: ajuizamento ou despacho citatório?**
   O texto cita o **despacho citatório** (29/09/2025) e o quadro/linha do tempo citavam o
   **ajuizamento** (20/09/2025). O motor usa o **ajuizamento** (pela retroação da interrupção à data
   da propositura). A frase do despacho citatório foi mantida, com a data extraída dos documentos.
4. **Eventos que interrompem/suspendem.** O sistema **não gera a peça** se encontrar parcelamento,
   pagamento, compensação ou protesto **dentro** do prazo prescricional da mesma inscrição. Evento
   **depois** da consumação (como o protesto do modelo, 03/07/2025) **não bloqueia**: vira aviso, e o
   próprio modelo diz que ele não interrompe. Confirmar essa leitura.
5. **Fundamentação centrada em DIRPF / Imposto de Renda.** O texto fala em "DIRPF, no caso do Imposto
   de Renda" e em "declaração de rendimentos auferidos no ano de…". Nesta versão o sistema só troca o
   **nome da declaração** (DIRPF → DCTF, GIA, PGDAS-D, DEFIS, GFIP…) — o resto do texto continua falando
   de imposto de renda. **Confirmar o texto para outros tributos.**
5-B. **Visto num teste com contribuições previdenciárias (GFIP, pessoa jurídica).** Além do item 5, a peça de prescrição
   sai com "(GFIP, no caso do Imposto de Renda)" no parágrafo da Súmula 436 e, nos períodos em que a entrega é posterior
   ao vencimento, com "A declaração de rendimentos auferidos no ano de 13/2012 foi entregue…" — trechos do modelo
   original, escritos para DIRPF. O sistema só troca o **nome** da declaração. **Decidir** se o texto deve ser
   adaptado por tributo (previdenciário, IRPJ, ICMS…). **Qualificação de pessoa jurídica:** quando o documento é CNPJ, o
   sistema agora escreve "pessoa jurídica de direito privado, inscrita no CNPJ sob nº …, com sede em …" (antes saía
   "[PREENCHER: nacionalidade], [PREENCHER: estado civil], [PREENCHER: profissão]") — é texto de qualificação, não de tese;
   confirmar a redação.
6. **Várias CDAs/períodos.** Cada CDA gera um bloco "Da prescrição da CDA nº…" e as figuras são numeradas
   em sequência. A frase "entre os marcos citados, X e Y" lista os pares de datas de todos os períodos
   da CDA. Conferir se a redação fica adequada quando há mais de um período.
7. **Gênero.** O cadastro de advogados não tinha campo de gênero. **Resolvido nesta versão:** o cadastro
   do escritório tem o gênero de cada advogado e o texto sai "sua advogada", "seu advogado", "suas advogadas"
   ou "seus advogados" (misto → masculino), com "subscreve/subscrevem" e "constituída/o/as/os" concordando.
   Vale para os 5 modelos. Gênero não cadastrado não é presumido: sai `[PREENCHER]`. Continuam como no modelo
   "**Devedora**" (Revisão de prescrição) e "inscrito(a)" — esses não acompanham o cadastro.

### EPE de prescrição

8. **Pedidos: honorários.** A EPE de prescrição **pede** honorários e indenização (Súmula 519 e
   Tema 587); a EPE de decadência **não pede**. Confirmar se devem ser iguais.
9. **Nota de rodapé do pedido de honorários** cita uma sentença de **prescrição intercorrente**
   (TRF1, 1059095-64.2023.4.01.3300) para fundamentar honorários numa peça de prescrição **ordinária**.
   O sistema manteve a nota como está.

### EPE de decadência

10. **Tabela de marcos.** A última linha junta "Notificação do lançamento / ajuizamento da execução"
    numa só linha, com o fundamento "Extrapolação do prazo legal — Operada a Decadência". O sistema
    preenche essa linha com a **data da notificação do lançamento** (que é o que o motor compara).
11. **"Não houve interrupção ou suspensão do prazo decadencial".** Decadência, em regra, não se
    interrompe nem se suspende (ressalvado o art. 173, II). A frase foi mantida; confirmar a redação.
12. **Regra de decadência.** Com pagamento antecipado e **sem** dolo/fraude/simulação, vale o art. 150, § 4º
    (fato gerador + 5 anos); **sem** pagamento antecipado (ou com dolo, fraude ou simulação **imputado**), vale o
    art. 173, I. **Atualizado:** o marco do art. 173, I passou a ser o **1º de janeiro do ano seguinte ao
    ano do VENCIMENTO** (e não do fato gerador) + 5 anos — ver o item 6 da seção "Modelos novos". O sistema compara
    com a **notificação do lançamento** (não com o ajuizamento) e considera decaído se a notificação for
    **posterior** ao termo final (mesma convenção da prescrição). Se os documentos não permitem saber se houve
    pagamento antecipado, o sistema **não decide**: bloqueia a peça e pede análise manual. Crédito **declarado**
    pelo contribuinte (DCTF etc.) **não gera** peça de decadência (Súmula 436/STJ), e lançamento anterior **anulado
    por vício formal** (art. 173, II) também bloqueia.
13. **Eventos antes da notificação.** Parcelamento, compensação ou protesto antes da notificação do
    lançamento **bloqueiam** a peça (podem ser confissão/constituição do crédito). Pagamento aparece só
    como aviso (é o próprio pagamento antecipado que define a regra do art. 150, § 4º).

---

## Modelos novos (Revisão por decadência e EPE por prescrição intercorrente)

Em português simples, na ordem do que mais importa. As minutas já renderizadas, com dados fictícios, estão em
`templates/pecas/minutas-para-revisao/`.

1. **São minutas redigidas sem a sua revisão.** O texto jurídico dos dois modelos veio integralmente do prompt de
   requisitos; o sistema só montou o documento e ligou os campos, **sem corrigir nem reescrever nada**. É preciso
   validar o texto inteiro antes de liberar para clientes.
2. **Honorários na prescrição intercorrente (Tema 1.229/STJ).** No julgamento de 09/10/2024 (REsp 2.046.269/PR,
   2.050.597/RO e 2.076.321/SP), o STJ fixou que não cabem honorários quando a exceção de pré-executividade é
   acolhida para extinguir a execução por prescrição intercorrente. Por isso a EPE intercorrente **não pede
   honorários** (há teste automático garantindo isso). **Atenção:** a nota de rodapé da EPE de prescrição
   ordinária cita decisão do TRF1 (2024) que condenou a União em honorários num caso de *prescrição
   intercorrente*. Avaliar se a nota deve ser trocada por precedente de prescrição ordinária.
3. **Requerimento de constrição no motor de intercorrente.** Hoje o sistema trata qualquer *pedido* de
   penhora/Sisbajud dentro do prazo como interrupção. O REsp 1.340.553/RS (item 4.3) diz que só a constrição
   **efetiva** ou a citação interrompem; o pedido só interrompe se der resultado, e aí retroage à data do protocolo.
   O comportamento atual é conservador: pode deixar de reconhecer uma prescrição que existe, mas nunca afirma uma
   que não existe. **Decidir se o motor deve mudar** (esta tarefa não alterou `_motor-prazos.js`).
4. **Tema 163/STJ (REsp 973.733/SC)** foi incluído na Revisão por decadência. Avaliar incluí-lo também na EPE de
   decadência (que não o cita).
5. **Revisão: base legal federal só para a União.** Lei 10.522/2002 (arts. 20-B e 20-C) e Portaria PGFN 33/2018
   (arts. 15 a 20) só aparecem quando o credor é a União. Para Estados e Municípios a peça fica só com CF, CTN e
   Súmula 473. Confirmar se deve haver base estadual/municipal específica, e se cabe pedido de suspensão dos atos
   de cobrança (protesto, ajuizamento) enquanto o pedido é analisado. **Não foi incluído.** Observação: a
   qualificação da Revisão por prescrição (modelo original) **não** cita a Lei 10.522; a da decadência cita (só
   para a União), conforme o prompt.
6. **Marco do art. 173, I no motor.** O sistema conta a partir de 1º de janeiro do ano seguinte ao **vencimento**
   (quando o lançamento passou a ser possível), e não ao fato gerador. Faz diferença em fatos geradores de
   dezembro, como tributos anuais (ex.: fato gerador 31/12/2017, vencimento 31/01/2018 → marco 01/01/2019, termo
   01/01/2024). É a leitura conservadora: dá o marco mais tardio e nunca afirma decadência antes da hora. Sem a
   data de vencimento (com fonte), o sistema **não** conta pelo fato gerador: bloqueia com *"Vencimento não
   identificado: necessário para contar a decadência pelo art. 173, I"*. Confirmar se é a leitura que o escritório
   adota. **Vale também para a EPE de decadência já existente** — o resultado dela pode mudar em relação à versão
   anterior (que contava do fato gerador).
7. **Pedido de certidão.** Os modelos pedem "Certidão Negativa". Avaliar a alternativa de Certidão Positiva com
   Efeitos de Negativa quando houver outros débitos com exigibilidade suspensa.

**Pontos que o sistema notou ao montar os modelos e não alterou** (decisão sua):

8. **Súmula 555/STJ e dolo imputado.** Na Revisão, quando há dolo/fraude/simulação imputado, o texto manda para
   o art. 173, I "e pela Súmula 555/STJ". A Súmula 555 trata de quando "não houver o pagamento antecipado";
   aplicá-la ao caso do dolo é uma extensão do texto do prompt. Mantido como veio.
9. **Dolo "não consta".** Com art. 150, § 4º e sem informação sobre dolo/fraude/simulação no lançamento, a frase
   "Registre-se que não consta do lançamento qualquer imputação de dolo…" sai com `[CONFIRMAR: …]` em amarelo —
   o advogado precisa conferir o auto/notificação antes de manter a frase.
10. **Letras dos pedidos.** Na Revisão, o prompt numera protesto = c), CADIN = d), certidão = e) e manda renumerar
    em sequência quando algum condicional some. A numeração é feita pelo sistema (ex.: sem protesto, o CADIN vira c)).
    Na EPE intercorrente, a liberação de restrições é d) sem protesto e e) com protesto.
11. **"Doc. 01" do mandato.** O prompt escreve "(Doc. 01)"; o sistema usa o mesmo campo dos outros modelos
    (`[PREENCHER: nº do Doc. – mandato]`), para o número acompanhar a juntada real.
12. **Cabimento da EPE intercorrente.** O bloco "Do cabimento" é o mesmo da EPE de decadência (copiado idêntico),
    só trocando o final do último parágrafo para "fulminada pela **prescrição**", como pedido. Esse parágrafo diz que
    a execução "padece de nulidade"; conferir se a expressão serve para prescrição intercorrente.

---

## Trechos repetidos entre os modelos (para ajustar em mais de um arquivo)

A biblioteca de modelos (`docx-templates`) não permite "incluir" um trecho de outro arquivo Word sem
quebrar a formatação. Por isso os cinco modelos são **independentes**: os blocos marcados como
"compartilhados" no prompt dos modelos novos foram **copiados idênticos** (a identidade é verificada em teste,
parágrafo a parágrafo, contra os originais). Se o texto abaixo mudar, é preciso alterar o original
correspondente e rodar `scripts/templates-pecas/gerar_templates.py` de novo:

| Trecho | EPE prescrição | EPE decadência | Revisão PGFN prescrição | **EPE intercorrente** (novo) | **Revisão PGFN decadência** (novo) |
|---|---|---|---|---|---|
| Do cabimento da exceção de pré-executividade (Súmula 393, art. 803 CPC) | sim | sim | — | **sim (idêntico à EPE decadência)** | — |
| Do cabimento da presente petição (CF art. 5º LV e XXXIV, Súmula 473/STF) | — | — | sim | — | **sim (idêntico)** |
| Da prescrição do crédito tributário (conceito, Súmula 436, Tema 265, TRF1) | sim | — | sim (idêntico) | — | — |
| Da decadência (conceito, arts. 150 §4º / 173 I, Súmula 555) | — | sim | — | — | **sim (idêntico à EPE decadência)** |
| Bloco Decreto 20.910/32 + Lei 9.873/99 | sim | — | sim (idêntico) | — | — |
| Estrutura "Da prescrição da CDA nº…" (recibo, extrato, PAF, tabelas) | sim | — | sim (idêntico, com vocabulário administrativo) | — | — |
| Quadro sinóptico "Tese / Fundamento" (formatação) | sim | sim | — | sim | sim |
| Assinatura, fecho e "Documento assinado digitalmente" | sim | sim | sim | sim | sim |

---

## Limites desta versão

- Prints dos documentos **não** são recortados: no lugar de cada figura entra
  `[INSERIR FIGURA n – excerto de <documento>, fonte: <arquivo>]`, destacado em amarelo.
- A matriz de peças está completa (prescrição ordinária, decadência e prescrição intercorrente; EPE quando há
  execução, Revisão quando não há — exceto intercorrente, que só existe com execução).
- Se o caso comportar mais de uma peça (ex.: decadência de alguns períodos **e** prescrição intercorrente), o
  sistema lista as peças disponíveis, com um resumo de cada, e **você escolhe qual gerar**. Os modelos não são
  fundidos; o que ficar de fora precisa ser incluído à mão se for o caso.
- A minuta é sempre um rascunho: **revisão do advogado responsável é obrigatória antes do protocolo.**
