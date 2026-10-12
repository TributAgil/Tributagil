# Pontos para revisão jurídica dos modelos de peça

Documento para a advogada responsável. O sistema **não alterou o texto jurídico**
dos três modelos originais — só trocou dados do caso (datas, CDA, PAF, nomes)
por campos preenchidos automaticamente. Abaixo, tudo o que o sistema notou e
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
6. **Várias CDAs/períodos.** Cada CDA gera um bloco "Da prescrição da CDA nº…" e as figuras são numeradas
   em sequência. A frase "entre os marcos citados, X e Y" lista os pares de datas de todos os períodos
   da CDA. Conferir se a redação fica adequada quando há mais de um período.
7. **Gênero.** "por intermédio de **sua advogada**" e "**Devedora**"/"inscrito(a)" estão como nos modelos
   (feminino) ou neutros. O cadastro de advogados não tem campo de gênero.

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
    (fato gerador + 5 anos); **sem** pagamento antecipado (ou com dolo, fraude ou simulação), vale o
    art. 173, I (1º de janeiro do exercício seguinte + 5 anos). O sistema compara com a **notificação do
    lançamento** (não com o ajuizamento) e considera decaído se a notificação for **posterior** ao termo
    final (mesma convenção da prescrição). Se os documentos não permitem saber se houve pagamento
    antecipado, o sistema **não decide**: bloqueia a peça e pede análise manual.
13. **Eventos antes da notificação.** Parcelamento, compensação ou protesto antes da notificação do
    lançamento **bloqueiam** a peça (podem ser confissão/constituição do crédito). Pagamento aparece só
    como aviso (é o próprio pagamento antecipado que define a regra do art. 150, § 4º).

---

## Trechos repetidos entre os modelos (para ajustar em mais de um arquivo)

A biblioteca de modelos (`docx-templates`) não permite "incluir" um trecho de outro arquivo Word sem
quebrar a formatação. Por isso os três modelos são **independentes**. Se o texto abaixo mudar, é preciso
alterar o original correspondente e rodar `scripts/templates-pecas/gerar_templates.py` de novo:

| Trecho | EPE prescrição | EPE decadência | Revisão PGFN |
|---|---|---|---|
| Do cabimento da exceção de pré-executividade (Súmula 393, art. 803 CPC) | sim | sim | — (tem "Do cabimento da presente petição", outro texto) |
| Da prescrição do crédito tributário (conceito, Súmula 436, Tema 265, TRF1) | sim | — | sim (idêntico) |
| Da decadência (conceito, arts. 150 §4º / 173 I, Súmula 555) | — | sim | — |
| Bloco Decreto 20.910/32 + Lei 9.873/99 | sim | — | sim (idêntico) |
| Estrutura "Da prescrição da CDA nº…" (recibo, extrato, PAF, tabelas) | sim | — | sim (idêntico, com vocabulário administrativo) |
| Assinatura, fecho e "Documento assinado digitalmente" | sim | sim | sim |

---

## Limites desta versão

- Prints dos documentos **não** são recortados: no lugar de cada figura entra
  `[INSERIR FIGURA n – excerto de <documento>, fonte: <arquivo>]`, destacado em amarelo.
- Combinações sem modelo: **decadência sem execução ajuizada** e **prescrição intercorrente** — o botão
  fica desabilitado com "Modelo de peça ainda não disponível para este cenário".
- Se houver créditos prescritos **e** decaídos na mesma execução, a peça sai com a tese que abrange
  **mais créditos**; os demais precisam ser incluídos à mão (o sistema avisa).
- A minuta é sempre um rascunho: **revisão do advogado responsável é obrigatória antes do protocolo.**
