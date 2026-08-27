# TributÁgil

Plataforma web que usa IA (Google Gemini) para analisar documentos fiscais e
diagnosticar **prescrição**, **decadência** e **prescrição intercorrente** à luz do
CTN e da LEF.

- **Frontend:** React 18 + Vite 5 + Tailwind CSS v4
- **Auth:** Supabase
- **IA:** Google Gemini, atrás de uma Serverless Function (Edge) da Vercel
- **E-mail de suporte:** Serverless Function (Edge) + Resend

---

## Rodando localmente

```bash
yarn install
cp .env.example .env   # preencha os valores
yarn dev
```

> As rotas `/api/*` só funcionam com `vercel dev` (não com `yarn dev`). Para testar
> a IA e o formulário de suporte localmente: `npm i -g vercel && vercel dev`.

## Variáveis de ambiente

| Variável | Onde | Obrigatória | Descrição |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | browser | ✅ | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | browser | ✅ | Chave `anon` (pública, protegida por RLS) |
| `GEMINI_API_KEY` | servidor | ✅ | Chave da API do Gemini (`AIzaSy…` ou `AQ.…`) — **sem** prefixo `VITE_` |
| `GEMINI_MODEL` | servidor | — | Modelo. Padrão `gemini-2.5-flash-lite`; `gemini-flash-latest` para casos difíceis |
| `GEMINI_THINKING_BUDGET` | servidor | — | Orçamento de *thinking* (padrão `512`; `0` desliga) |
| `RESEND_API_KEY` | servidor | — | Sem ela, mensagens de suporte só vão para o log |
| `CONTATO_EMAIL_TO` | servidor | — | Destino do suporte (padrão `contato@tributagil.online`) |
| `CONTATO_EMAIL_FROM` | servidor | — | Remetente verificado no Resend |

Na Vercel: **Project Settings → Environment Variables** (defina para Production,
Preview e Development).

## Estrutura

### Envio de documentos à IA (Storage + Files API)

Fluxo:

1. O navegador comprime imagens (`canvas`) e **sobe cada arquivo direto para o
   Supabase Storage** (bucket `documentos`, pasta `<user_id>/<analise_id>/`).
   Os arquivos **não passam** pelo corpo de nenhuma Function → sem o teto de 4 MB.
2. `/api/gemini` (Node, `maxDuration` 300s) recebe só os *caminhos* + o token do
   usuário. Baixa cada arquivo do Storage **respeitando a RLS**, sobe para a
   **Files API do Gemini** e chama `streamGenerateContent` com os `file_uri`.
3. A resposta volta em streaming para a tela do Cérebro.

O `system instruction` "Motor TributÁgil" mora em `api/_motor-tributagil.js`.
A IA responde **somente** com base nos anexos; faltando dado essencial devolve
`{"alerta_dados_insuficientes": "..."}` e a tela mostra o aviso em vez de inventar.

**Limites:** 20 documentos, 30 MB por arquivo, 50 MB no total por análise
(PDF até 25 MB / imagem até 40 MB antes de comprimir). Sem novas variáveis de
ambiente — a URL e a anon key do Supabase (públicas) viajam no corpo da request;
o token do usuário garante o isolamento via RLS.

> Os arquivos ficam no Storage. Uma limpeza automática (cron) pode ser adicionada
> depois; hoje dá para apagá-los pelo painel do Supabase.

```
api/
  gemini.js             Node + streaming; Storage → Files API → Gemini
  _motor-tributagil.js  Texto do system instruction "Motor TributÁgil"
  contato.js            Envio de e-mail do "Central de Suporte" (Edge, honeypot, anexo)
src/
  lib/supabase.js          Cliente único do Supabase (+ exporta url/anonKey/bucket)
  lib/prepararDocumentos.js Compressão de imagens no browser
  lib/storageDocumentos.js  Upload/remoção no Supabase Storage
  lib/analises.js          Camada de dados do histórico (listar/salvar/excluir)
  components/ErrorBoundary  Impede que um erro de render derrube o app inteiro
  pages/                    Telas (Login, Histórico, NovaAnalise, Cérebro, Resultado)
```

## Banco de dados — tabela `analises`

O Histórico de Resultados lê e grava nesta tabela. Rode no **SQL Editor** do Supabase:

```sql
create table if not exists public.analises (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  titulo     text,
  resumo     text,
  payload    jsonb,
  resultado  jsonb
);

alter table public.analises enable row level security;

-- Cada usuário só enxerga e manipula as próprias análises.
create policy "analises: leitura própria"  on public.analises for select using  (auth.uid() = user_id);
create policy "analises: inserção própria" on public.analises for insert with check (auth.uid() = user_id);
create policy "analises: exclusão própria" on public.analises for delete using  (auth.uid() = user_id);
```

## Storage — bucket `documentos`

Onde os arquivos das análises são guardados. No painel do Supabase:

1. **Storage → New bucket** → nome `documentos`, **Private**.
2. **SQL Editor** → rode as policies (isolam cada usuário à própria pasta, cujo
   primeiro segmento do caminho é o `auth.uid()`):

```sql
create policy "docs: acesso à própria pasta"
on storage.objects for all
to authenticated
using (
  bucket_id = 'documentos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'documentos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

> Sem o bucket, o upload na tela "Nova Análise" mostra o erro
> `O bucket "documentos" não existe no Supabase`.

> Enquanto a tabela não existir, a tela de Histórico simplesmente mostra o estado
> "nenhuma análise ainda" — nada quebra.

## Testes (opcional)

O projeto já tem `vitest.config.ts` e `src/test/`. Para habilitar:

```bash
yarn add -D vitest jsdom @testing-library/react @testing-library/jest-dom
# e adicione  "test": "vitest run"  em package.json → scripts
```
