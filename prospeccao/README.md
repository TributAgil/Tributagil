# Prospecção — leads de direito tributário e empresarial

Sistema de geração de leads para o TributÁgil: encontra **advogados e escritórios
de direito tributário e empresarial** de uma UF (começando pela **Bahia**) e
monta uma planilha com nome e pelo menos um contato de cada um: WhatsApp,
telefone, e-mail, site, Instagram ou LinkedIn.

Fica isolado do app: tem `package.json` próprio e não entra no build da Vercel.

## Como rodar

```bash
cd prospeccao
npm install

npm run cnpj          # 1. Receita Federal: sociedades de advogados da UF (baixa ~7 GB na 1ª vez)
npm run telelistas    # 2. TeleListas: categorias "advogado tributarista", "advogado empresarial"…
node src/fontes/analise-dna.mjs   # 3. Análise DNA: perfis listados em dados/entrada/analise-dna.txt
npm run places        # 4. Google Maps (só com GOOGLE_PLACES_API_KEY)
npm run enriquecer    # 5. visita os sites e extrai e-mail, WhatsApp, Instagram, LinkedIn…
npm run consolidar    # 6. junta, remove duplicados, classifica e gera a planilha
```

A planilha sai em `saida/leads-ba-direito-tributario.xlsx`, junto com um CSV por
aba. Atrás de um proxy corporativo, rode os comandos com `NODE_USE_ENV_PROXY=1`
(Node ≥ 22.21) para o `fetch` do Node usar o `HTTPS_PROXY`.

Para outra UF: `npm run cnpj -- --uf PE`, depois o resto com `--uf PE`.

## Fontes

| Fonte | O que traz | Como |
| --- | --- | --- |
| **Receita Federal — CNPJ** (`src/fontes/cnpj-receita.mjs`) | Todas as sociedades de advogados ativas da UF (CNAE 6911-7/01), com telefone, e-mail, endereço e sócios | Dados abertos oficiais, edição mensal mais recente. Filtra em streaming, sem descompactar tudo |
| **TeleListas** (`src/fontes/telelistas.mjs`) | Telefone, endereço e site de quem se cadastrou como tributarista/empresarial | Lista por município × categoria; abre os bairros quando a 1ª página vem cheia |
| **Análise DNA** (`src/fontes/analise-dna.mjs`) | Escritórios do anuário Análise Advocacia: telefone, endereço, especialidades | Lê os perfis listados em `dados/entrada/analise-dna.txt` |
| **Google Maps** (`src/fontes/google-places.mjs`) | Nome, telefone, site, nota e link do Maps | API oficial do Places (Text Search). Precisa de chave (ver abaixo) |
| **Sites dos escritórios** (`src/enriquecer.mjs`) | E-mail, WhatsApp (links `wa.me`), Instagram, LinkedIn, Facebook e o texto que confirma o foco tributário | Página inicial + até 5 páginas de contato/equipe/áreas |
| **Pesquisa web / manual** (`dados/entrada/*.csv`) | Qualquer lead achado à mão (busca, indicação, evento, LinkedIn) | Modelo em `config/modelo-entrada.csv`. Com `fonte` = `jusbrasil`, a área conta como sinal fraco (é autodeclarada) |

Uma pessoa vinda da pesquisa (coluna `tipo` = Advogado) que seja sócia de uma
sociedade do CNPJ na mesma cidade é unida a essa sociedade. O lead passa a ser
o escritório, e a pessoa vai para a coluna "Pessoa de contato".

### Google Maps (Places API)

1. No [Google Cloud Console](https://console.cloud.google.com/google/maps-apis),
   ative a **Places API (New)** e crie uma chave.
2. `GOOGLE_PLACES_API_KEY=... npm run places -- --max-cidades 40`

Cada página de 20 resultados é uma chamada do nível "Text Search Enterprise",
porque telefone e site estão nesse nível. Confira preço e franquia gratuita em
<https://developers.google.com/maps/billing-and-pricing/pricing>. As respostas
ficam em cache (`.cache/`), então repetir a coleta não cobra de novo.

### O que não é coletado, e por quê

- **LinkedIn**: os termos de uso proíbem raspagem e o conteúdo exige login. O
  sistema guarda o LinkedIn quando o próprio site do escritório o publica. Perfis
  achados em busca podem entrar pelo CSV manual.
- **Jusbrasil, ListaMais e outros diretórios com proteção anti-robô**: não são
  acessados. O sistema não tenta contornar bloqueios.
- **OAB (CNA)**: a consulta não traz contatos. Use para confirmar a inscrição.

## Como os leads são classificados

- **Foco**: soma sinais de *tributário* (tributário, fiscal, ICMS, PIS/COFINS,
  execução fiscal, CARF/CONSEF, reforma tributária…) e de *empresarial*
  (societário, contratos, recuperação judicial…) no nome, nas categorias da fonte,
  nas especialidades e no texto do site. Também conta o CNAE secundário 6920-6/02
  (consultoria e auditoria contábil e tributária). Ver `src/lib/classificar.mjs`.
  - Aba **Tributário**: foco tributário (forte, fraco ou tributário + empresarial)
  - Aba **Empresarial**: foco empresarial sem sinal tributário
  - Aba **Demais sociedades**: sociedades de advogados sem evidência de foco no
    nome ou no site. Muitas fazem tributário mesmo assim; vale uma triagem.
- **Prioridade** (0–100): o foco mais a qualidade dos canais (WhatsApp, e-mail,
  site, redes) e o número de fontes que confirmam o lead.
- **WhatsApp**: "link publicado" quando o escritório divulga um `wa.me`;
  "celular (provável WhatsApp)" quando o número é móvel.
- **Contato do contador**: o telefone/e-mail do CNPJ costuma ser do contador que
  registrou a empresa. Contatos repetidos em 3 ou mais CNPJs vão para
  "Observações" e não contam como contato do escritório.

A deduplicação usa CNPJ, domínio do site/e-mail, telefone, Instagram e nome +
cidade (`src/consolidar.mjs`).

## Dados pessoais e LGPD

- **Nada com contatos vai para o git** (o repositório é público): `dados/`,
  `saida/` e `.cache/` estão no `.gitignore`. Guarde a planilha em lugar privado.
- A base é de contatos **profissionais publicados pelos próprios escritórios** ou
  em registros públicos, para prospecção B2B. O fundamento é o legítimo interesse
  (art. 7º, IX, da LGPD). Em toda abordagem: diga de onde veio o contato, ofereça
  a opção de não receber mais mensagens e respeite quem pedir para sair.
- O Código de Ética da OAB limita a publicidade *dos advogados*, não o
  recebimento de oferta de software. Ainda assim, prefira mensagens individuais
  e relevantes, nada de disparo em massa.
- A coleta respeita `robots.txt`, faz no máximo uma requisição por segundo em
  cada site e se identifica como `ProspeccaoLeads/1.0`.

## Estrutura

```
prospeccao/
├── config/
│   ├── municipios-ba.json      # municípios da BA por nº de sociedades (gerado pelo passo cnpj)
│   └── modelo-entrada.csv      # modelo para leads manuais
├── src/
│   ├── fontes/                 # um coletor por fonte → dados/fontes/<fonte>.jsonl
│   ├── enriquecer.mjs          # sites → dados/sites.jsonl
│   ├── consolidar.mjs          # tudo → saida/*.xlsx e *.csv
│   └── lib/                    # http (cache/robots/limite), contatos, normalização, classificação
├── test/                       # node --test
├── dados/                      # (git-ignored) entradas e saídas intermediárias
└── saida/                      # (git-ignored) planilhas finais
```
