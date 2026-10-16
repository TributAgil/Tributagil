# Casos fictícios para teste (34 PDFs)

Um processo fictício por arquivo, cobrindo as respostas possíveis do motor para **prescrição ordinária**,
**decadência** e **prescrição intercorrente**. Partes, CPF/CNPJ, números e datas são inventados. Cada página
tem a tarja "DOCUMENTO FICTICIO PARA TESTE".

- **`GABARITO.md`**: o que o sistema deve fazer em cada caso (peça gerada, datas, bloqueios, avisos).
- `P01` a `P09`: prescrição ordinária. `D01` a `D14`: decadência. `I01` a `I09`: intercorrente.
  `C01` e `C02`: duas peças no mesmo caso (o modal lista as duas).

## Como testar

1. Crie uma análise nova com **um PDF** (cada caso é um processo) e gere o parecer.
2. Confira se o parecer concorda com a coluna "Parecer deve ser favorável a" do gabarito.
3. Clique em "Gerar peça" e compare o resultado com o gabarito do caso.
4. Se o parecer da IA discordar do motor, o sistema mostra a **divergência com o parecer**. Isso é um achado
   (a IA leu diferente do cálculo), não um defeito do caso.

## O que cada grupo exercita

| Grupo | Casos | Respostas cobertas |
|---|---|---|
| Prescrição ordinária | P01 a P09 | gera (total, parcial, sem execução); não prescreve (dentro do prazo, caso-limite do dia); bloqueia (parcelamento, protesto dentro do prazo, faltam datas) |
| Decadência | D01 a D14 | art. 173, I com e sem vencimento; art. 150, § 4º; dolo imputado e "não consta" (`[CONFIRMAR]`); crédito declarado (Súmula 436); vício formal; parcial; marco pelo vencimento; credor União × Estado; com e sem execução |
| Intercorrente | I01 a I09 | consumada; só bens; penhora efetiva e citação interrompem; dois ciclos; prazo em curso; pedido de penhora (conservador); inscrições com datas diferentes; parte das CDAs |
| Combinados | C01, C02 | duas peças no mesmo caso |

## Garantia automática

`tests/casos-ficticios.test.js` roda o motor em todos os casos e falha se o resultado mudar. A especificação
única está em `scripts/casos-ficticios/cenarios.py`; os PDFs e o gabarito são gerados dela:

```bash
python scripts/casos-ficticios/cenarios.py          # cenarios.json
python scripts/casos-ficticios/gerar_pdfs.py        # PDFs
node scripts/casos-ficticios/gerar-gabarito.mjs     # GABARITO.md
```

## Teste automático de ponta a ponta (3 camadas)

| Camada | O que confere | Precisa de chave? | Onde roda |
|---|---|---|---|
| 1. Motor | os 34 casos chegam ao resultado do gabarito (gera, bloqueia ou nenhuma peça) | não | `yarn test:pecas` |
| 2. Word | o `.docx` de cada peça possível sai sem marcador sobrando, com as datas, CDAs, pedidos (CADIN, protesto, retificação) e `[CONFIRMAR]` certos | não | `yarn test:pecas` |
| 3. Gemini de verdade | a IA lê os PDFs e acerta os fatos (datas, pagamento, dolo...) e o motor, com o que foi lido, chega ao gabarito | **sim** (`GEMINI_API_KEY`) | script abaixo |

Camada 3, na raiz do projeto (PowerShell):

```powershell
$env:GEMINI_API_KEY="sua-chave"
node scripts/casos-ficticios/rodar-com-gemini.mjs          # os 34
node scripts/casos-ficticios/rodar-com-gemini.mjs P01 D05   # só alguns
```

Grava `RESULTADO-GEMINI.md` aqui na pasta, com o que a IA leu diferente do documento (omitiu, inventou ou leu
errado) e se o resultado do motor mudou por causa disso. Usa o mesmo código de extração de produção
(`api/_extracao-peca.js`). Gasta uma chamada por caso, com PDFs pequenos.
