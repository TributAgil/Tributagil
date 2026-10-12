# Casos fictícios de teste: gabarito

Tudo é inventado (partes, CPF/CNPJ, números de CDA e de processo, datas). Cada PDF tem a tarja "DOCUMENTO FICTICIO PARA TESTE".
Os resultados abaixo vêm do **mesmo motor do sistema** (`api/_motor-peca.js`, `api/_motor-prazos.js`), com "hoje" = **12/10/2026**.
Casos sem execução (Revisão) dependem da data em que você gera a peça: depois de 12/10/2026 as datas só avançam.

## Como usar

1. Suba **um PDF por análise** (cada caso é um processo). 2. Veja o parecer: ele deve concordar com a coluna "Parecer deve ser".
3. Clique em "Gerar peça" e compare o que aparece no modal com o gabarito do caso. Se o parecer discordar do motor, o sistema mostra a **divergência**: é um achado, não um erro do teste.

## Resumo

| Caso | Situação | Parecer deve ser favorável a | Resultado esperado |
|---|---|---|---|
| P01 | Prescrição ordinária total, execução ajuizada (EPE) | Prescrição ordinária | **EPE de prescrição ordinária** |
| P02 | Prescrição parcial: 2 períodos prescritos e 1 dentro do prazo (EPE) | Prescrição ordinária | **EPE de prescrição ordinária** |
| P03 | Prescrição ordinária sem execução (Revisão PGFN) | Prescrição ordinária | **Revisão PGFN de prescrição ordinária** |
| P04 | Sem prescrição: ajuizamento dentro do prazo | nenhuma tese (desfavorável) | nenhuma peça |
| P05 | Caso-limite: ajuizamento NO DIA da consumação (não prescreve) | nenhuma tese (desfavorável) | nenhuma peça |
| P06 | Bloqueio: parcelamento dentro do prazo | Prescrição ordinária | bloqueada (Prescrição ordinária) |
| P07 | Bloqueio: faltam datas de vencimento e de entrega | Prescrição ordinária | bloqueada (Prescrição ordinária) |
| P08 | Bloqueio: protesto DENTRO do prazo (pode interromper) | Prescrição ordinária | bloqueada (Prescrição ordinária) |
| P09 | Sem execução e ainda dentro do prazo (nada a pedir) | nenhuma tese (desfavorável) | nenhuma peça |
| D01 | Decadência pelo art. 173, I, com execução (EPE decadência) | Decadência | **EPE de decadência** |
| D02 | Decadência sem execução, União, com protesto (Revisão PGFN) | Decadência | **Revisão de débito fiscal (decadência)** |
| D03 | Decadência de ICMS, credor ESTADO (Revisão sem base federal) | Decadência | **Revisão de débito fiscal (decadência)** |
| D04 | Art. 150, § 4º: pagamento antecipado, sem dolo | Decadência | **Revisão de débito fiscal (decadência)** |
| D05 | Art. 150, § 4º com dolo "não consta": a frase sai com [CONFIRMAR] | Decadência | **Revisão de débito fiscal (decadência)** |
| D06 | Pagamento antecipado + dolo imputado: força o art. 173, I | Decadência | **Revisão de débito fiscal (decadência)** |
| D07 | Bloqueio: art. 173, I sem data de vencimento | Decadência | bloqueada (Decadência) |
| D08 | Crédito DECLARADO (DCTF): decadência não se aplica (Súmula 436) | Decadência | bloqueada (Decadência) |
| D09 | Bloqueio: lançamento anterior anulado por vício formal (art. 173, II) | Decadência | bloqueada (Decadência) |
| D10 | Decadência PARCIAL: um período decaído e outro não (pedido de retificação) | Decadência | **Revisão de débito fiscal (decadência)** |
| D11 | Sem decadência: notificação dentro do prazo | nenhuma tese (desfavorável) | nenhuma peça |
| D12 | Bloqueio: parcelamento antes da notificação (pode ser confissão) | Decadência | bloqueada (Decadência) |
| D13 | Marco pelo VENCIMENTO: fato gerador 31/12/2017, vencimento 31/01/2018 | Decadência | **Revisão de débito fiscal (decadência)** |
| D14 | Bloqueio: "não consta" se houve pagamento antecipado | Decadência | bloqueada (Decadência) |
| I01 | Intercorrente consumada: ciência 10/03/2017, sem eventos (EPE intercorrente) | Prescrição intercorrente | **EPE de prescrição intercorrente** |
| I02 | Intercorrente: não localizados só os BENS | Prescrição intercorrente | **EPE de prescrição intercorrente** |
| I03 | Penhora EFETIVA dentro do prazo: interrompe, não gera | nenhuma tese (desfavorável) | nenhuma peça |
| I04 | Dois ciclos: o 1º interrompido por citação, o 2º consumado | Prescrição intercorrente | **EPE de prescrição intercorrente** |
| I05 | Prazo ainda em curso: ciência em 15/06/2023 | nenhuma tese (desfavorável) | nenhuma peça |
| I06 | Requerimento (pedido) de penhora dentro do prazo: tratamento conservador | nenhuma tese (desfavorável) | nenhuma peça |
| I07 | Bloqueio: duas inscrições com prescrição reconhecida em datas diferentes | Prescrição intercorrente | bloqueada (Prescrição intercorrente) |
| I08 | Intercorrente só para PARTE das CDAs (aviso) | Prescrição intercorrente | **EPE de prescrição intercorrente** |
| I09 | Citação efetiva depois da suspensão e dentro do prazo: interrompe | nenhuma tese (desfavorável) | nenhuma peça |
| C01 | Prescrição ordinária + intercorrente no mesmo caso (2 peças) | Prescrição ordinária e Prescrição intercorrente | **EPE de prescrição ordinária** + **EPE de prescrição intercorrente** |
| C02 | Decadência + intercorrente no mesmo caso (2 peças) | Decadência e Prescrição intercorrente | **EPE de decadência** + **EPE de prescrição intercorrente** |

## Detalhe de cada caso

### P01: Prescrição ordinária total, execução ajuizada (EPE)

DIRPF 2018 (entrega depois do vencimento) e 2019 (vencimento depois da entrega). Ajuizamento depois das duas consumações. Protesto posterior vira só aviso.

- Arquivo: `P01.pdf`
- Credor: União · execução 1000001-10.2025.4.01.3300 ajuizada em 20/09/2025
- Parte: MARTA EXEMPLO LIMA
- **Prescrição ordinária:** gera a **EPE de prescrição ordinária**
  - CDA 50.100.001-1, período 2018: termo inicial 27/01/2020, consumação 27/01/2025, **prescrito**
  - CDA 50.100.001-1, período 2019: termo inicial 30/06/2020, consumação 30/06/2025, **prescrito**
  - aviso: 50.100.001-1 / 2018: protesto em 03/07/2025 é posterior à consumação do prazo e, em tese, não o interrompe — conferir.
  - aviso: 50.100.001-1 / 2019: protesto em 03/07/2025 é posterior à consumação do prazo e, em tese, não o interrompe — conferir.

### P02: Prescrição parcial: 2 períodos prescritos e 1 dentro do prazo (EPE)

GFIP: competências 01/2012 e 02/2012 prescritas; 06/2014 não. A peça sai só com as prescritas e avisa do período que ficou de fora.

- Arquivo: `P02.pdf`
- Credor: União · execução 1000002-10.2019.4.01.3300 ajuizada em 12/03/2019
- Parte: SABOR DA TERRA REFEICOES INDUSTRIAIS LTDA
- **Prescrição ordinária:** gera a **EPE de prescrição ordinária**
  - CDA 50.100.002-1, período 01/2012: termo inicial 20/02/2012, consumação 20/02/2017, **prescrito**
  - CDA 50.100.002-1, período 02/2012: termo inicial 20/03/2012, consumação 20/03/2017, **prescrito**
  - CDA 50.100.002-1, período 06/2014: termo inicial 21/07/2014, consumação 21/07/2019, ainda dentro do prazo (fica de fora)
  - aviso: 1 período(s) não estão prescritos e ficaram fora da peça.

### P03: Prescrição ordinária sem execução (Revisão PGFN)

Só inscrição em dívida ativa, sem execução. Aferida até a data de geração da peça (12/10/2026). Protesto posterior à consumação vira aviso.

- Arquivo: `P03.pdf`
- Credor: União · sem execução ajuizada
- Parte: MARTA EXEMPLO LIMA
- **Prescrição ordinária:** gera a **Revisão PGFN de prescrição ordinária**
  - CDA 50.100.003-1, período 2016: termo inicial 30/04/2017, consumação 30/04/2022, **prescrito**
  - CDA 50.100.003-1, período 2017: termo inicial 10/05/2018, consumação 10/05/2023, **prescrito**
  - aviso: Sem execução fiscal ajuizada: a prescrição foi aferida até a data de geração da peça.
  - aviso: 50.100.003-1 / 2016: protesto em 15/09/2023 é posterior à consumação do prazo e, em tese, não o interrompe — conferir.
  - aviso: 50.100.003-1 / 2017: protesto em 15/09/2023 é posterior à consumação do prazo e, em tese, não o interrompe — conferir.

### P04: Sem prescrição: ajuizamento dentro do prazo

Termo inicial em 22/06/2021 e consumação em 22/06/2026; execução ajuizada em 10/05/2024. O parecer deve ser DESFAVORÁVEL e não há peça.

- Arquivo: `P04.pdf`
- Credor: União · execução 1000004-10.2024.4.01.3300 ajuizada em 10/05/2024
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Resultado:** nenhuma peça. O modal deve dizer *"Os documentos não indicam prescrição, decadência ou prescrição intercorrente consumada."*

### P05: Caso-limite: ajuizamento NO DIA da consumação (não prescreve)

Termo inicial em 15/02/2017, consumação em 15/02/2022; ajuizamento em 15/02/2022. Só é prescrito se o ajuizamento for POSTERIOR.

- Arquivo: `P05.pdf`
- Credor: União · execução 1000005-10.2022.4.01.3300 ajuizada em 15/02/2022
- Parte: MARTA EXEMPLO LIMA
- **Resultado:** nenhuma peça. O modal deve dizer *"Os documentos não indicam prescrição, decadência ou prescrição intercorrente consumada."*

### P06: Bloqueio: parcelamento dentro do prazo

Prescrição aparente, mas há parcelamento em 15/05/2020 (dentro do prazo). O sistema não gera a peça e manda para análise manual.

- Arquivo: `P06.pdf`
- Credor: União · execução 1000006-10.2025.4.01.3300 ajuizada em 20/09/2025
- Parte: MARTA EXEMPLO LIMA
- **Prescrição ordinária:** **bloqueada**
  - CDA 50.100.006-1, período 2017: termo inicial 10/03/2018, consumação 10/03/2023, **prescrito**
  - motivo: 50.100.006-1 / 2017: parcelamento em 15/05/2020 dentro do prazo prescricional (10/03/2018 a 10/03/2023) — pode interromper ou suspender o prazo; o caso exige análise manual.

### P07: Bloqueio: faltam datas de vencimento e de entrega

O documento não traz o vencimento nem a entrega da declaração. Sem as datas o sistema não calcula (é o caso do processo real da J E J).

- Arquivo: `P07.pdf`
- Credor: União · execução 1000007-10.2019.4.01.3300 ajuizada em 12/03/2019
- Parte: SABOR DA TERRA REFEICOES INDUSTRIAIS LTDA
- **Prescrição ordinária:** **bloqueada**
  - motivo: 50.100.007-1 / 03/2012: faltam dados para o cálculo da prescrição (data de vencimento e data de entrega da declaração).

### P08: Bloqueio: protesto DENTRO do prazo (pode interromper)

Termo inicial 10/03/2018; protesto em 20/08/2020, dentro dos 5 anos. O sistema bloqueia e pede análise manual.

- Arquivo: `P08.pdf`
- Credor: União · execução 1000008-10.2025.4.01.3300 ajuizada em 20/09/2025
- Parte: MARTA EXEMPLO LIMA
- **Prescrição ordinária:** **bloqueada**
  - CDA 50.100.008-1, período 2017: termo inicial 10/03/2018, consumação 10/03/2023, **prescrito**
  - motivo: 50.100.008-1 / 2017: protesto em 20/08/2020 dentro do prazo prescricional (10/03/2018 a 10/03/2023) — pode interromper ou suspender o prazo; o caso exige análise manual.

### P09: Sem execução e ainda dentro do prazo (nada a pedir)

Inscrição sem execução; termo inicial 20/03/2023, consumação 20/03/2028. Não há prescrição até 12/10/2026.

- Arquivo: `P09.pdf`
- Credor: União · sem execução ajuizada
- Parte: MARTA EXEMPLO LIMA
- **Resultado:** nenhuma peça. O modal deve dizer *"Os documentos não indicam prescrição, decadência ou prescrição intercorrente consumada."*

### D01: Decadência pelo art. 173, I, com execução (EPE decadência)

Auto de infração IRPJ: fato gerador 30/06/2016, vencimento 31/07/2016, sem pagamento, sem dolo. Marco 01/01/2017, termo 01/01/2022, notificação 22/08/2023: decaído.

- Arquivo: `D01.pdf`
- Credor: União · execução 2000001-10.2024.4.01.3300 ajuizada em 10/10/2024
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Decadência:** gera a **EPE de decadência**
  - CDA 50.200.001-1, período 2016: art. 173, I, marco 01/01/2017, termo final 01/01/2022, notificação 22/08/2023, **decaído**
  - Pedido de **cancelamento integral** da inscrição

### D02: Decadência sem execução, União, com protesto (Revisão PGFN)

Mesmo auto de infração; sem execução. Sai a Revisão com base legal federal, pedido de cancelamento do protesto e baixa no CADIN.

- Arquivo: `D02.pdf`
- Credor: União · sem execução ajuizada
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Decadência:** gera a **Revisão de débito fiscal (decadência)**
  - CDA 50.200.002-1, período 2016: art. 173, I, marco 01/01/2017, termo final 01/01/2022, notificação 22/08/2023, **decaído**
  - Pedido de **cancelamento integral** da inscrição

### D03: Decadência de ICMS, credor ESTADO (Revisão sem base federal)

PGE: a peça não cita Lei 10.522/2002 nem Portaria PGFN e não pede baixa no CADIN.

- Arquivo: `D03.pdf`
- Credor: Estado · sem execução ajuizada
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Decadência:** gera a **Revisão de débito fiscal (decadência)**
  - CDA 50.200.003-1, período 02/2016: art. 173, I, marco 01/01/2017, termo final 01/01/2022, notificação 10/06/2023, **decaído**
  - Pedido de **cancelamento integral** da inscrição

### D04: Art. 150, § 4º: pagamento antecipado, sem dolo

Fato gerador 31/03/2016, pagamento antecipado comprovado; termo 31/03/2021; notificação 15/09/2022: decaído.

- Arquivo: `D04.pdf`
- Credor: União · sem execução ajuizada
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Decadência:** gera a **Revisão de débito fiscal (decadência)**
  - CDA 50.200.004-1, período 1T/2016: art. 150, § 4º, marco 31/03/2016, termo final 31/03/2021, notificação 15/09/2022, **decaído**
  - Pedido de **cancelamento integral** da inscrição

### D05: Art. 150, § 4º com dolo "não consta": a frase sai com [CONFIRMAR]

O auto de infração não diz se imputa dolo, fraude ou simulação. A peça sai, mas o advogado precisa conferir a frase destacada.

- Arquivo: `D05.pdf`
- Credor: União · sem execução ajuizada
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Decadência:** gera a **Revisão de débito fiscal (decadência)**
  - CDA 50.200.005-1, período 1T/2016: art. 150, § 4º, marco 31/03/2016, termo final 31/03/2021, notificação 15/09/2022, **decaído** (frase com [CONFIRMAR])
  - Pedido de **cancelamento integral** da inscrição

### D06: Pagamento antecipado + dolo imputado: força o art. 173, I

Multa qualificada de 150% (intuito de fraude). Mesmo com pagamento, vale o art. 173, I: marco 01/01/2017, termo 01/01/2022, notificação 15/09/2023.

- Arquivo: `D06.pdf`
- Credor: União · sem execução ajuizada
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Decadência:** gera a **Revisão de débito fiscal (decadência)**
  - CDA 50.200.006-1, período 1T/2016: art. 173, I, marco 01/01/2017, termo final 01/01/2022, notificação 15/09/2023, **decaído** (dolo imputado)
  - Pedido de **cancelamento integral** da inscrição

### D07: Bloqueio: art. 173, I sem data de vencimento

Sem vencimento não se conta pelo fato gerador: "Vencimento não identificado: necessário para contar a decadência pelo art. 173, I".

- Arquivo: `D07.pdf`
- Credor: União · sem execução ajuizada
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Decadência:** **bloqueada**
  - Pedido de **cancelamento integral** da inscrição
  - motivo: 50.200.007-1 / 2016: Vencimento não identificado: necessário para contar a decadência pelo art. 173, I.

### D08: Crédito DECLARADO (DCTF): decadência não se aplica (Súmula 436)

A declaração constitui o crédito. O sistema bloqueia com o aviso da Súmula 436. Datas recentes, para não haver prescrição.

- Arquivo: `D08.pdf`
- Credor: União · sem execução ajuizada
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Decadência:** **bloqueada**
  - Pedido de **cancelamento integral** da inscrição
  - motivo: Crédito constituído por declaração do contribuinte: a tese de decadência não se aplica ao valor declarado.
  - aviso: Crédito constituído por declaração do contribuinte: a tese de decadência não se aplica ao valor declarado.

### D09: Bloqueio: lançamento anterior anulado por vício formal (art. 173, II)

Há decisão anulando o primeiro lançamento por vício formal: o prazo reabre e o caso exige análise manual.

- Arquivo: `D09.pdf`
- Credor: União · sem execução ajuizada
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Decadência:** **bloqueada**
  - Pedido de **cancelamento integral** da inscrição
  - motivo: 50.200.009-1 / 2016: consta lançamento anterior anulado por vício formal — o art. 173, II, do CTN reabre o prazo decadencial; o caso exige análise manual.

### D10: Decadência PARCIAL: um período decaído e outro não (pedido de retificação)

Período 2016 decaído; período 2019 ainda dentro do prazo (termo 01/01/2025, notificação 22/08/2023). O pedido é de retificação, não de cancelamento integral.

- Arquivo: `D10.pdf`
- Credor: União · sem execução ajuizada
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Decadência:** gera a **Revisão de débito fiscal (decadência)**
  - CDA 50.200.010-1, período 2016: art. 173, I, marco 01/01/2017, termo final 01/01/2022, notificação 22/08/2023, **decaído**
  - CDA 50.200.010-1, período 2019: art. 173, I, marco 01/01/2020, termo final 01/01/2025, notificação 22/08/2023, **dentro do prazo**
  - Pedido de **retificação** da inscrição (decadência parcial)
  - aviso: 1 período(s) estão dentro do prazo decadencial: a peça pede a retificação parcial da inscrição.

### D11: Sem decadência: notificação dentro do prazo

Fato gerador 30/06/2019, termo 01/01/2025; notificação em 22/08/2023. Nada decaiu.

- Arquivo: `D11.pdf`
- Credor: União · sem execução ajuizada
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Resultado:** nenhuma peça. O modal deve dizer *"Os documentos não indicam prescrição, decadência ou prescrição intercorrente consumada."*

### D12: Bloqueio: parcelamento antes da notificação (pode ser confissão)

Parcelamento em 10/03/2018, entre o fato gerador e a notificação. O sistema bloqueia.

- Arquivo: `D12.pdf`
- Credor: União · sem execução ajuizada
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Decadência:** **bloqueada**
  - CDA 50.200.012-1, período 2016: art. 173, I, marco 01/01/2017, termo final 01/01/2022, notificação 22/08/2023, **decaído**
  - Pedido de **cancelamento integral** da inscrição
  - motivo: 50.200.012-1 / 2016: parcelamento em 10/03/2018 antes da notificação do lançamento — pode configurar confissão/constituição do crédito; o caso exige análise manual.

### D13: Marco pelo VENCIMENTO: fato gerador 31/12/2017, vencimento 31/01/2018

Marco 01/01/2019 (ano do vencimento + 1), termo 01/01/2024, notificação 15/03/2024: decaído. Contar do fato gerador daria 01/01/2023: é o caso que prova a regra.

- Arquivo: `D13.pdf`
- Credor: União · sem execução ajuizada
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Decadência:** gera a **Revisão de débito fiscal (decadência)**
  - CDA 50.200.013-1, período 2017: art. 173, I, marco 01/01/2019, termo final 01/01/2024, notificação 15/03/2024, **decaído**
  - Pedido de **cancelamento integral** da inscrição

### D14: Bloqueio: "não consta" se houve pagamento antecipado

O documento não diz se houve pagamento. O sistema não presume: bloqueia.

- Arquivo: `D14.pdf`
- Credor: União · sem execução ajuizada
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Decadência:** **bloqueada**
  - Pedido de **cancelamento integral** da inscrição
  - motivo: 50.200.014-1 / 2016: faltam dados para o cálculo da decadência (confirmação de pagamento antecipado (consta como "não consta")).

### I01: Intercorrente consumada: ciência 10/03/2017, sem eventos (EPE intercorrente)

Fim da suspensão 10/03/2018; consumação 10/03/2023. Sem citação nem constrição efetiva.

- Arquivo: `I01.pdf`
- Credor: União · execução 3000001-10.2015.4.01.3300 ajuizada em 15/05/2015
- Parte: SABOR DA TERRA REFEICOES INDUSTRIAIS LTDA
- **Prescrição intercorrente:** gera a **EPE de prescrição intercorrente**
  - Ciência em 10/03/2017, fim da suspensão em 10/03/2018, consumação em 10/03/2023; objeto: devedor_e_bens
  - CDAs cobertas: 50.300.001-1

### I02: Intercorrente: não localizados só os BENS

Ciência 18/09/2016 sobre a não localização de bens penhoráveis. A peça diz "de bens penhoráveis".

- Arquivo: `I02.pdf`
- Credor: União · execução 3000002-10.2015.4.01.3300 ajuizada em 15/05/2015
- Parte: SABOR DA TERRA REFEICOES INDUSTRIAIS LTDA
- **Prescrição intercorrente:** gera a **EPE de prescrição intercorrente**
  - Ciência em 18/09/2016, fim da suspensão em 18/09/2017, consumação em 18/09/2022; objeto: bens
  - CDAs cobertas: 50.300.002-1

### I03: Penhora EFETIVA dentro do prazo: interrompe, não gera

Ciência 10/03/2017 e penhora efetivada em 20/05/2020 (dentro do prazo): o ciclo é interrompido.

- Arquivo: `I03.pdf`
- Credor: União · execução 3000003-10.2015.4.01.3300 ajuizada em 15/05/2015
- Parte: SABOR DA TERRA REFEICOES INDUSTRIAIS LTDA
- **Resultado:** nenhuma peça. O modal deve dizer *"Os documentos não indicam prescrição, decadência ou prescrição intercorrente consumada."*

### I04: Dois ciclos: o 1º interrompido por citação, o 2º consumado

Ciências em 10/03/2010 e 10/03/2017; citação em 15/05/2011 interrompeu o 1º. A peça traz o parágrafo "episódio anterior".

- Arquivo: `I04.pdf`
- Credor: União · execução 3000004-10.2009.4.01.3300 ajuizada em 05/02/2009
- Parte: SABOR DA TERRA REFEICOES INDUSTRIAIS LTDA
- **Prescrição intercorrente:** gera a **EPE de prescrição intercorrente**
  - Ciência em 10/03/2017, fim da suspensão em 10/03/2018, consumação em 10/03/2023; objeto: devedor_e_bens
  - Ciclo anterior interrompido: ciência 10/03/2010, interrompido em 15/05/2011 (citação do executado)
  - CDAs cobertas: 50.300.004-1

### I05: Prazo ainda em curso: ciência em 15/06/2023

Fim da suspensão 15/06/2024; consumação 15/06/2029. Ainda não prescreveu.

- Arquivo: `I05.pdf`
- Credor: União · execução 3000005-10.2022.4.01.3300 ajuizada em 10/01/2022
- Parte: SABOR DA TERRA REFEICOES INDUSTRIAIS LTDA
- **Resultado:** nenhuma peça. O modal deve dizer *"Os documentos não indicam prescrição, decadência ou prescrição intercorrente consumada."*

### I06: Requerimento (pedido) de penhora dentro do prazo: tratamento conservador

Pedido de Sisbajud em 12/08/2019, sem resultado informado. O motor atual o trata como interrupção (conservador): não gera. É o item 3 do REVISAO_JURIDICA.md.

- Arquivo: `I06.pdf`
- Credor: União · execução 3000006-10.2015.4.01.3300 ajuizada em 15/05/2015
- Parte: SABOR DA TERRA REFEICOES INDUSTRIAIS LTDA
- **Resultado:** nenhuma peça. O modal deve dizer *"Os documentos não indicam prescrição, decadência ou prescrição intercorrente consumada."*

### I07: Bloqueio: duas inscrições com prescrição reconhecida em datas diferentes

CDA A com ciência em 10/03/2017 e CDA B com ciência em 22/09/2018. O modelo trata um único episódio, então o sistema não escolhe por conta própria.

- Arquivo: `I07.pdf`
- Credor: União · execução 3000007-10.2015.4.01.3300 ajuizada em 15/05/2015
- Parte: SABOR DA TERRA REFEICOES INDUSTRIAIS LTDA
- **Prescrição intercorrente:** **bloqueada**
  - motivo: Há prescrição intercorrente reconhecida com datas diferentes entre inscrições (50.300.007-1: ciência em 10/03/2017; 50.300.007-2: ciência em 22/09/2018) — o modelo trata um único episódio; o caso exige análise manual.

### I08: Intercorrente só para PARTE das CDAs (aviso)

Só a CDA A tem ciência de não localização (10/03/2017); a CDA B não. A peça sai e avisa que cobre apenas parte das CDAs.

- Arquivo: `I08.pdf`
- Credor: União · execução 3000008-10.2015.4.01.3300 ajuizada em 15/05/2015
- Parte: SABOR DA TERRA REFEICOES INDUSTRIAIS LTDA
- **Prescrição intercorrente:** gera a **EPE de prescrição intercorrente**
  - Ciência em 10/03/2017, fim da suspensão em 10/03/2018, consumação em 10/03/2023; objeto: devedor_e_bens
  - CDAs cobertas: 50.300.008-1
  - aviso: A peça cobre apenas parte das CDAs: não há prescrição intercorrente reconhecida para 50.300.008-2.

### I09: Citação efetiva depois da suspensão e dentro do prazo: interrompe

Ciência 10/03/2017 e citação (por edital) em 15/08/2021, dentro do prazo prescricional. A citação efetiva interrompe.

- Arquivo: `I09.pdf`
- Credor: União · execução 3000009-10.2015.4.01.3300 ajuizada em 15/05/2015
- Parte: SABOR DA TERRA REFEICOES INDUSTRIAIS LTDA
- **Resultado:** nenhuma peça. O modal deve dizer *"Os documentos não indicam prescrição, decadência ou prescrição intercorrente consumada."*

### C01: Prescrição ordinária + intercorrente no mesmo caso (2 peças)

GFIP: 3 CDAs prescritas (ajuizamento 12/03/2019) e ciência da não localização em 10/03/2020 (consumada em 10/03/2026). O modal lista as 2 peças.

- Arquivo: `C01.pdf`
- Credor: União · execução 4000001-10.2019.4.01.3300 ajuizada em 12/03/2019
- Parte: SABOR DA TERRA REFEICOES INDUSTRIAIS LTDA
- **Prescrição ordinária:** gera a **EPE de prescrição ordinária**
  - CDA 50.400.001-1, período 01/2012: termo inicial 20/02/2012, consumação 20/02/2017, **prescrito**
  - CDA 50.400.001-2, período 02/2012: termo inicial 20/03/2012, consumação 20/03/2017, **prescrito**
  - CDA 50.400.001-3, período 13/2012: termo inicial 18/01/2013, consumação 18/01/2018, **prescrito**
- **Prescrição intercorrente:** gera a **EPE de prescrição intercorrente**
  - Ciência em 10/03/2020, fim da suspensão em 10/03/2021, consumação em 10/03/2026; objeto: devedor_e_bens
  - CDAs cobertas: 50.400.001-1, 50.400.001-2, 50.400.001-3

### C02: Decadência + intercorrente no mesmo caso (2 peças)

Auto de infração decaído (art. 173, I) e execução com ciência de não localização em 10/03/2017. O modal lista a EPE de decadência e a EPE de intercorrente.

- Arquivo: `C02.pdf`
- Credor: União · execução 4000002-10.2015.4.01.3300 ajuizada em 15/05/2015
- Parte: COMERCIAL HORIZONTE DISTRIBUIDORA LTDA
- **Decadência:** gera a **EPE de decadência**
  - CDA 50.400.002-1, período 2016: art. 173, I, marco 01/01/2017, termo final 01/01/2022, notificação 22/08/2023, **decaído**
  - Pedido de **cancelamento integral** da inscrição
- **Prescrição intercorrente:** gera a **EPE de prescrição intercorrente**
  - Ciência em 10/03/2017, fim da suspensão em 10/03/2018, consumação em 10/03/2023; objeto: devedor_e_bens
  - CDAs cobertas: 50.400.002-1
