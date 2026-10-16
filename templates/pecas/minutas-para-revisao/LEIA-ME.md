# Minutas para revisão da advogada

Os dois modelos **novos** renderizados como saem do sistema, com **dados fictícios** (Maria Exemplo da
Silva, CDAs inventadas, advogadas "Um" e "Dois"):

| Arquivo | Modelo | O que o exemplo mostra |
|---|---|---|
| `Minuta_Revisao_PGFN_decadencia.docx` | Pedido de Revisão de Débito Fiscal — decadência | União; 2 períodos (um pelo art. 173, I e outro pelo art. 150, § 4º); com protesto, CADIN e certidão nos pedidos |
| `Minuta_EPE_prescricao_intercorrente.docx` | Exceção de Pré-Executividade — prescrição intercorrente | execução fiscal com 2 episódios de não localização (o 1º interrompido por citação); com protesto |

**São rascunhos redigidos sem a sua revisão.** O texto jurídico veio integralmente do prompt de
requisitos; o sistema só montou o modelo e ligou os campos. Leia o texto final e os itens da seção
"Modelos novos" de `../REVISAO_JURIDICA.md` antes de liberar para clientes.

- Trechos em **amarelo** são o que o advogado precisa preencher ou confirmar (aqui: o nº do Doc. do mandato e
  o espaço da figura).
- Os dados são do exemplo: números de CDA, datas e nomes **não** correspondem a nenhum caso real.
- Para gerar de novo: `node scripts/gerar-minutas-para-revisao.mjs` (usa as mesmas fixtures dos testes).
