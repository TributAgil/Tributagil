# TributÁgil

Plataforma web que usa IA (Google Gemini) para analisar documentos fiscais e
diagnosticar **prescrição**, **decadência** e **prescrição intercorrente** à luz do
CTN e da LEF.

- **Frontend:** React 18 + Vite 5 + Tailwind CSS v4
- **Auth:** Supabase
- **IA:** Google Gemini, atrás de uma Serverless Function (Edge) da Vercel
- **E-mail de suporte:** Serverless Function (Edge) + Resend
- **Chatbot "Lu":** RAG restrito por caso (pgvector no Supabase + embeddings Gemini) — ver seção própria abaixo

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
| `SUPABASE_URL` | servidor | — | Idem, mas para o `/api/gemini` não depender do valor vindo do cliente. Recomendado. Cai para `VITE_SUPABASE_URL` / corpo da request se ausente. |
| `SUPABASE_ANON_KEY` | servidor | — | Idem `VITE_SUPABASE_ANON_KEY`, lado servidor. Recomendado. |
| `GEMINI_API_KEY` | servidor | ✅ | Chave da API do Gemini (`AIzaSy…` ou `AQ.…`) — **sem** prefixo `VITE_` |
| `GEMINI_MODEL` | servidor | — | Modelo. Padrão `gemini-3.5-flash`. Use `gemini-3.1-pro-preview` **após ativar o billing** no Google Cloud (o Pro dá HTTP 429 no free tier) |
| `GEMINI_TEMPERATURE` | servidor | — | Temperatura da geração (padrão `0.3`) |
| `GEMINI_THINKING_LEVEL` | servidor | — | Nível de *thinking* dos modelos 3.x: `high` (padrão), `low` ou `off`. Para a forma numérica dos modelos 2.5: `budget` + `GEMINI_THINKING_BUDGET` |
| `GEMINI_THINKING_BUDGET` | servidor | — | Orçamento numérico de *thinking* (só vale com `GEMINI_THINKING_LEVEL=budget`) |
| `VITE_HCAPTCHA_SITEKEY` | browser | — | Sitekey (pública) da hCaptcha do login. Tem fallback no código; o **secret key** correspondente vai no painel do Supabase (Authentication → Attack Protection), nunca aqui. |
| `VITE_SENTRY_LOADER_SRC` | browser | — | URL do *Loader Script* do Sentry (rastreamento de erros). Sem ela, nenhum código do Sentry carrega. |
| `RESEND_API_KEY` | servidor | — | Sem ela, mensagens de suporte só vão para o log |
| `CONTATO_EMAIL_TO` | servidor | — | Destino do suporte (padrão `contato@tributagil.online`) |
| `CONTATO_EMAIL_FROM` | servidor | — | Remetente verificado no Resend |
| `GEMINI_EMBEDDING_MODEL` | servidor | — | Modelo de embedding do chatbot "Lu" (padrão `text-embedding-004`, 768 dimensões) |
| `LU_LIMIAR_SIMILARIDADE` | servidor | — | Limiar de similaridade (0–1) do Lu antes de responder "não sei" (padrão `0.6`) |
| `SUPABASE_SERVICE_ROLE_KEY` | só local | — | Usada apenas por `scripts/seed-legislacao.mjs`. Nunca configurar na Vercel |

Na Vercel: **Project Settings → Environment Variables** (defina para Production,
Preview e Development).

## Estrutura

### Envio de documentos à IA (Storage + Files API)

Fluxo:

1. O navegador comprime imagens (`canvas`) e **sobe cada arquivo direto para o
   Supabase Storage** (bucket `documentos`, pasta `<user_id>/<analise_id>/`).
   Os arquivos **não passam** pelo corpo de nenhuma Function → sem o teto de 4 MB.
2. `/api/gemini` (Node, `maxDuration` 300s) recebe só os *caminhos* + o token do
   usuário. Baixa cada arquivo do Storage **respeitando a RLS** e os embute como
   `inline_data` na chamada `streamGenerateContent` (auth via `?key=` na URL).
3. A resposta volta em streaming para a tela do Cérebro.

> Como o `inline_data` tem teto de ~20 MB de request, o limite prático hoje é
> **~12 MB de documentos por análise**. Para processos maiores, migrar para a
> **Files API do Gemini** (pendente de acerto de credencial — a chave da conta
> deu 401 no endpoint de upload).

O `system instruction` "Motor TributÁgil" mora em `api/_motor-tributagil.js`.
A IA responde **somente** com base nos anexos; faltando dado essencial devolve
`{"alerta_dados_insuficientes": "..."}` e a tela mostra o aviso em vez de inventar.

**Limites:** 20 documentos, **30 MB por arquivo** (alinhado ao limite do bucket
no Supabase), 45–50 MB no total por análise. Sem novas variáveis de ambiente —
a URL e a anon key do Supabase (públicas) viajam no corpo da request; o token
do usuário garante o isolamento via RLS.

> Os arquivos ficam no Storage. Uma limpeza automática (cron) pode ser adicionada
> depois; hoje dá para apagá-los pelo painel do Supabase.

```
api/
  gemini.js               Node + streaming; Storage → Files API → Gemini
  _motor-tributagil.js    Texto do system instruction "Motor TributÁgil"
  contato.js              Envio de e-mail do "Central de Suporte" (Edge, honeypot, anexo)
  lu.js                   Chat do Lu: retrieval (documentos do caso + legislação) + geração
  indexar-caso.js         Extrai texto, chunka e grava embeddings dos documentos de um caso
  _embeddings.js          Helper de embedding (Gemini text-embedding-004), usado por lu.js e indexar-caso.js
  _legislacao-tributagil.js  Corpus curado de legislação/jurisprudência (ver scripts/seed-legislacao.mjs)
scripts/
  seed-legislacao.mjs     Roda uma vez, localmente: embeda e grava o corpus de legislação no Supabase
src/
  lib/supabase.js          Cliente único do Supabase (+ exporta url/anonKey/bucket)
  lib/prepararDocumentos.js Compressão de imagens no browser
  lib/storageDocumentos.js  Upload/remoção no Supabase Storage
  lib/analises.js          Camada de dados do histórico (listar/salvar/excluir), com versionamento (caso_id/versao)
  lib/creditos.js          Leitura do saldo de créditos (tabela `perfis`)
  lib/casos.js             Agrupamento de versões (casos) e documentos acumulados (documentos_caso)
  lib/lu.js                Cliente do chatbot Lu (/api/lu) e disparo de indexação (/api/indexar-caso)
  components/BarraCreditos.jsx      Créditos restantes + bloqueio quando zerado
  components/ModalConfirmarUpload.jsx  Confirmação obrigatória ao anexar doc complementar a um caso
  components/BotaoSinalizarErro.jsx    "Sinalização Automática de Erro" -> e-mail de suporte c/ logs (estorno)
  components/ChatLu.jsx                Painel de chat do Lu (aba "Perguntar ao Lu" no Resultado da Análise)
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

## Créditos de análise, versionamento de casos e antifraude

Três funcionalidades novas, todas dependentes de tabelas/funções adicionais no
Supabase. Rode os blocos abaixo no **SQL Editor**, depois do bloco da tabela
`analises` acima (a ordem importa: `analises` precisa existir antes do `alter
table` que adiciona `caso_id`/`versao`).

### 1. Créditos (plano + saldo)

```sql
create table if not exists public.perfis (
  id                    uuid primary key references auth.users (id) on delete cascade,
  plano                 text not null default 'gratuito',
  creditos_disponiveis  integer not null default 3,
  creditos_bonus        integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.perfis enable row level security;

-- Só leitura pelo próprio usuário: o saldo só muda via RPC consumir_credito()
-- (chamada pelo backend) ou manualmente pelo suporte — nunca por UPDATE
-- direto do cliente. É a barreira antifraude do saldo de créditos.
create policy "perfis: leitura própria" on public.perfis for select using (auth.uid() = id);

-- Cria o perfil (3 créditos gratuitos) automaticamente no cadastro.
create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_perfil on auth.users;
create trigger on_auth_user_created_perfil
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- Backfill para usuários já cadastrados antes desta migração.
insert into public.perfis (id) select id from auth.users on conflict (id) do nothing;

-- Consome 1 crédito de forma atômica (bônus primeiro, depois o plano).
-- SECURITY DEFINER: roda com privilégio elevado, mas só enxerga/altera a
-- própria linha do usuário chamador (auth.uid() vem do JWT). Chamada pelo
-- backend (/api/gemini) autenticado com o token do usuário — nunca pelo
-- cliente diretamente.
create or replace function public.consumir_credito()
returns table (creditos_restantes integer, plano text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_perfil  public.perfis%rowtype;
begin
  if v_user_id is null then
    raise exception 'NAO_AUTENTICADO';
  end if;

  select * into v_perfil from public.perfis where id = v_user_id for update;
  if not found then
    raise exception 'PERFIL_NAO_ENCONTRADO';
  end if;

  if (v_perfil.creditos_bonus + v_perfil.creditos_disponiveis) <= 0 then
    raise exception 'SEM_CREDITOS';
  end if;

  if v_perfil.creditos_bonus > 0 then
    update public.perfis set creditos_bonus = creditos_bonus - 1, updated_at = now() where id = v_user_id;
  else
    update public.perfis set creditos_disponiveis = creditos_disponiveis - 1, updated_at = now() where id = v_user_id;
  end if;

  select * into v_perfil from public.perfis where id = v_user_id;
  return query select (v_perfil.creditos_disponiveis + v_perfil.creditos_bonus), v_perfil.plano;
end;
$$;

grant execute on function public.consumir_credito() to authenticated;
```

**Estorno (crédito perdido por falha do sistema):** é sempre uma ação manual
do suporte, após avaliar o e-mail recebido pelo botão "Sinalização Automática
de Erro" — nunca automática:

```sql
update public.perfis
   set creditos_bonus = creditos_bonus + 1, updated_at = now()
 where id = '<user_id do e-mail recebido>';
```

### 2. Histórico versionado + antifraude (casos)

```sql
create table if not exists public.casos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  titulo      text,
  criado_em   timestamptz not null default now()
);

alter table public.casos enable row level security;
create policy "casos: leitura própria"  on public.casos for select using (auth.uid() = user_id);
create policy "casos: inserção própria" on public.casos for insert with check (auth.uid() = user_id);

-- Cada análise passa a pertencer a um "caso" (agrupador de versões) e carrega
-- seu próprio número de versão. O parecer de uma versão anterior NUNCA é
-- sobrescrito — reanalisar sempre insere uma linha nova em `analises`.
alter table public.analises
  add column if not exists caso_id uuid references public.casos (id) on delete set null,
  add column if not exists versao integer not null default 1;

-- Documentos acumulados de um caso (todas as versões). IMPORTANTE: só há
-- policies de SELECT e INSERT — nenhuma de UPDATE nem DELETE para o usuário
-- autenticado. Isso impede, a nível de banco, que um documento já anexado
-- seja removido ou substituído para forçar reprocessamento gratuito: o
-- usuário só consegue ADICIONAR arquivos a um caso existente.
create table if not exists public.documentos_caso (
  id             uuid primary key default gen_random_uuid(),
  caso_id        uuid not null references public.casos (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  nome           text,
  mime_type      text,
  categoria      text,
  storage_path   text not null,
  tamanho_bytes  bigint,
  adicionado_em  timestamptz not null default now()
);

alter table public.documentos_caso enable row level security;
create policy "documentos_caso: leitura própria"  on public.documentos_caso for select using (auth.uid() = user_id);
create policy "documentos_caso: inserção própria" on public.documentos_caso for insert with check (auth.uid() = user_id);
```

> **Nota sobre o Storage:** como os documentos de um caso precisam continuar
> disponíveis para uma futura reanálise, a limpeza automática "LGPD /
> minimização" (que antes apagava os arquivos do Storage logo após cada
> análise) só roda para análises **sem** `caso_id` (fallback enquanto esta
> migração não for aplicada). Uma vez migrado, os documentos de um caso só
> saem do Storage pela exclusão total do histórico ("Excluir meus
> dados/histórico", no Histórico).

Sem essas tabelas, o app **não quebra**: a barra de créditos simplesmente não
aparece, `/api/gemini` segue sem bloquear por créditos, e cada análise nova é
salva sem versionamento (como antes desta funcionalidade).

## Chatbot "Lu" (RAG restrito por caso)

Assistente jurídico que abre depois que o parecer de um caso é emitido.
Responde **somente** com base em duas fontes, sempre escopadas por
`caso_id` (nunca mistura casos de usuários diferentes):

1. Os documentos daquele caso específico (chunks + embeddings gerados por
   `/api/indexar-caso`, disparado em segundo plano assim que a primeira
   versão do caso é salva, ou quando um documento complementar é
   confirmado numa reanálise).
2. Uma base de legislação/jurisprudência tributária curada (dispositivos do
   CTN, CF/88, LEF, LC 118/2005, súmulas do STF/STJ e o REsp 1.340.553/RS),
   indexada uma única vez pelo script `scripts/seed-legislacao.mjs`.

Se a busca não retornar nada com boa correspondência em nenhuma das duas
bases, o Lu responde um "não sei" explícito — **sem** chamar o modelo de
geração, então essa regra não depende só do prompt.

### 1. Extensão + tabelas + funções

Rode no **SQL Editor** do Supabase (precisa da tabela `casos`, da seção
"Créditos de análise..." acima, já criada):

```sql
create extension if not exists vector;

-- Chunks dos documentos de cada caso.
create table if not exists public.documento_chunks (
  id             uuid primary key default gen_random_uuid(),
  caso_id        uuid not null references public.casos (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  documento_nome text,
  storage_path   text,
  pagina         integer,
  conteudo       text not null,
  embedding      vector(768),
  criado_em      timestamptz not null default now()
);

alter table public.documento_chunks enable row level security;
create policy "documento_chunks: leitura própria" on public.documento_chunks for select using (auth.uid() = user_id);
-- Sem policy de INSERT para o client: só a função abaixo (SECURITY DEFINER,
-- chamada por /api/indexar-caso) grava, e só no caso do PRÓPRIO usuário.

create index if not exists documento_chunks_embedding_idx
  on public.documento_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function public.inserir_documento_chunk(
  p_caso_id uuid, p_documento_nome text, p_storage_path text,
  p_pagina integer, p_conteudo text, p_embedding vector(768)
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'NAO_AUTENTICADO'; end if;
  if not exists (select 1 from public.casos where id = p_caso_id and user_id = v_user_id) then
    raise exception 'CASO_NAO_ENCONTRADO';
  end if;
  insert into public.documento_chunks (caso_id, user_id, documento_nome, storage_path, pagina, conteudo, embedding)
  values (p_caso_id, v_user_id, p_documento_nome, p_storage_path, p_pagina, p_conteudo, p_embedding);
end;
$$;
grant execute on function public.inserir_documento_chunk to authenticated;

create or replace function public.buscar_documento_chunks(
  p_caso_id uuid, p_query_embedding vector(768), p_limite integer default 6
) returns table (documento_nome text, storage_path text, pagina integer, conteudo text, similaridade float)
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'NAO_AUTENTICADO'; end if;
  return query
    select dc.documento_nome, dc.storage_path, dc.pagina, dc.conteudo,
           1 - (dc.embedding <=> p_query_embedding) as similaridade
    from public.documento_chunks dc
    where dc.caso_id = p_caso_id and dc.user_id = v_user_id
    order by dc.embedding <=> p_query_embedding
    limit p_limite;
end;
$$;
grant execute on function public.buscar_documento_chunks to authenticated;

-- Legislação: corpus curado, GLOBAL (não pertence a um usuário/caso) —
-- leitura liberada a qualquer usuário autenticado; escrita só via
-- service_role (scripts/seed-legislacao.mjs), nunca pelo cliente.
create table if not exists public.legislacao_chunks (
  id             uuid primary key default gen_random_uuid(),
  norma          text not null,
  identificador  text not null,
  texto_integral text not null,
  embedding      vector(768),
  criado_em      timestamptz not null default now()
);
alter table public.legislacao_chunks enable row level security;
create policy "legislacao_chunks: leitura autenticada" on public.legislacao_chunks for select to authenticated using (true);

create index if not exists legislacao_chunks_embedding_idx
  on public.legislacao_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 50);

create or replace function public.buscar_legislacao_chunks(
  p_query_embedding vector(768), p_limite integer default 6
) returns table (norma text, identificador text, texto_integral text, similaridade float)
language sql stable as $$
  select lc.norma, lc.identificador, lc.texto_integral,
         1 - (lc.embedding <=> p_query_embedding) as similaridade
  from public.legislacao_chunks lc
  order by lc.embedding <=> p_query_embedding
  limit p_limite;
$$;
grant execute on function public.buscar_legislacao_chunks to authenticated;
```

### 2. Popular a base de legislação (uma vez)

```bash
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
GEMINI_API_KEY=AQ.... \
node scripts/seed-legislacao.mjs
```

A `SUPABASE_SERVICE_ROLE_KEY` só é usada localmente por este script (bypassa
a RLS para popular a tabela) — **nunca** deve ir para a Vercel nem para
nenhuma variável com prefixo `VITE_`. Rode de novo sempre que o corpus em
`api/_legislacao-tributagil.js` mudar (o script limpa e recria tudo).

### 3. Como funciona em produção

- `/api/indexar-caso` roda em segundo plano (fire-and-forget, não bloqueia a
  tela do parecer) logo após a primeira análise de um caso ser salva, e de
  novo — só para o(s) arquivo(s) novo(s) — quando um documento complementar é
  confirmado numa reanálise.
- `/api/lu` recebe a pergunta, gera o embedding, busca nas duas bases (RPCs
  acima), e só chama o Gemini se houver contexto com similaridade ≥
  `LU_LIMIAR_SIMILARIDADE` (padrão 0.6) em pelo menos uma delas.
- Sem as tabelas/funções acima (migração pendente), o Lu simplesmente sempre
  responde "não sei" em vez de quebrar — nada no resto do app depende delas.

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
