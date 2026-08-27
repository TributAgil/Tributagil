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

### Envio de documentos à IA

Os arquivos são convertidos para base64 no browser (imagens são comprimidas via
`canvas`) e vão como `inline_data` na chamada ao Gemini, que faz o OCR nativo.
O `system instruction` "Motor TributÁgil" mora em `api/_motor-tributagil.js`.

**Limite:** ~3,6 MB no total de documentos por análise — a request roda em Edge
Function (teto de ~4 MB de corpo). Para processos grandes, o próximo passo é
subir os arquivos para o **Supabase Storage** e o backend ler de lá (ou usar a
**Files API do Gemini**). Hoje: fotografe as páginas em vez de escanear PDFs pesados.

A IA responde **somente** com base nos anexos. Faltando dado essencial, ela
devolve `{"alerta_dados_insuficientes": "..."}` e a tela do Cérebro mostra o
aviso em vez de inventar.

```
api/
  gemini.js             Proxy Edge + streaming; injeta o system instruction e os documentos
  _motor-tributagil.js  Texto do system instruction "Motor TributÁgil"
  contato.js     Envio de e-mail do "Central de Suporte" (Edge, honeypot, anexo)
src/
  lib/supabase.js          Cliente único do Supabase
  lib/analises.js          Camada de dados do histórico (listar/salvar/excluir)
  components/ErrorBoundary  Impede que um erro de render derrube o app inteiro
  pages/                    Telas (Login, Histórico, NovaAnalise, Cérebro, Resultado)
  components/               UI reutilizável (upload, modal de suporte, etc.)
  vite-env.d.ts             Tipagem de import.meta.env
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

> Enquanto a tabela não existir, a tela de Histórico simplesmente mostra o estado
> "nenhuma análise ainda" — nada quebra.

## Testes (opcional)

O projeto já tem `vitest.config.ts` e `src/test/`. Para habilitar:

```bash
yarn add -D vitest jsdom @testing-library/react @testing-library/jest-dom
# e adicione  "test": "vitest run"  em package.json → scripts
```
