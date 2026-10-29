-- docs/sql/pecas-salvas.sql
--
-- Salvar a PEÇA no banco, com versões: rodar UMA vez no SQL Editor do Supabase (é idempotente: rodar de novo não
-- duplica nada). Ainda NÃO aplicado em produção.
--
-- O QUE FICA SALVO
--   pecas          UMA peça por análise e tese. O .docx ORIGINAL que /api/gerar-peca devolveu fica no bucket `pecas`;
--                  com ele, reabrir a peça não chama o Gemini de novo. Guarda também o resumo, a lista de figuras e o
--                  resultado da busca das figuras (para não repetir a busca, que custa IA).
--   pecas_versoes  cada "Aplicar/Salvar" do editor vira uma versão numerada (1, 2, 3…): as alterações de texto
--                  (o mesmo JSON que o editor já usa) e as imagens confirmadas (caminhos no bucket `pecas`). Ficam só
--                  as 3 ÚLTIMAS: salvar a 4ª apaga a mais antiga. A peça revisada é remontada no navegador a partir do
--                  original + versão — o Word final não é guardado.
--   bucket pecas   privado; cada usuário só enxerga a própria pasta (primeiro segmento do caminho = auth.uid()).
--                  Caminhos: <user_id>/<analise_id>/<peca_id>/original.docx
--                            <user_id>/<analise_id>/<peca_id>/figuras/<numero>-<carimbo>.png
--
-- REGRAS
--   * Gerar a peça de novo SUBSTITUI a anterior: a peça antiga e as versões dela são apagadas de vez (o app apaga a
--     linha antes de gravar a nova; o índice único (analise_id, tese) garante que nunca ficam duas).
--   * Versão só é criada pela RPC salvar_versao_peca (que numera e mantém as 3 últimas); o app lê, mas não insere,
--     altera nem apaga versão diretamente. Some junto com a peça.
--   * Peça é rascunho do advogado (não é prova, ao contrário de documentos_caso): o dono pode apagar a peça e os
--     arquivos dela.
--   * Apagar a análise (inclusive pelo "Excluir meus dados", RPC excluir_caso_completo) apaga as peças e as versões
--     em cascata. Os ARQUIVOS no bucket `pecas` não somem sozinhos: o app (ou a limpeza diária) precisa removê-los
--     (ver o fim deste arquivo).

begin;

-- ---------------------------------------------------------------------------------------------------------------------
-- Tabela: pecas
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.pecas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  analise_id    uuid not null references public.analises(id) on delete cascade,
  tese          text not null check (tese in ('prescricao_ordinaria', 'decadencia', 'prescricao_intercorrente')),
  template      text not null check (template ~ '^[A-Za-z0-9_]{1,80}$'),
  titulo        text check (char_length(titulo) <= 200),
  -- o .docx original, no bucket `pecas`, sempre dentro da pasta do próprio usuário
  original_path text not null check (char_length(original_path) <= 400),
  nome_arquivo  text check (char_length(nome_arquivo) <= 200),
  resumo        jsonb not null default '{}'::jsonb check (jsonb_typeof(resumo) = 'object'),
  figuras       jsonb not null default '[]'::jsonb check (jsonb_typeof(figuras) = 'array'),
  -- resultado da busca das figuras nos documentos (/api/localizar-figuras); null = ainda não buscou
  localizacao   jsonb check (localizacao is null or jsonb_typeof(localizacao) = 'object'),
  versao_atual  integer not null default 0 check (versao_atual >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- teto de tamanho dos JSON (o normal é poucos KB): barra abuso sem atrapalhar o uso real
  constraint pecas_tamanho_json check (
    pg_column_size(resumo) <= 512000 and pg_column_size(figuras) <= 512000
    and (localizacao is null or pg_column_size(localizacao) <= 512000)
  )
);

-- uma peça por análise e tese: gerar de novo substitui (apaga a anterior), nunca acumula
create unique index if not exists pecas_analise_tese_unq on public.pecas (analise_id, tese);
create index if not exists pecas_user_idx on public.pecas (user_id);

drop trigger if exists pecas_updated_at on public.pecas;
create trigger pecas_updated_at before update on public.pecas
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------------------------------------------------
-- Tabela: pecas_versoes
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.pecas_versoes (
  id                  uuid primary key default gen_random_uuid(),
  peca_id             uuid not null references public.pecas(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  numero              integer not null check (numero >= 1),
  -- estado do editor: { "<id do parágrafo>": { trechos?, removido?, novos? } } (src/lib/edicaoTexto.js)
  alteracoes          jsonb not null default '{}'::jsonb check (jsonb_typeof(alteracoes) = 'object'),
  -- imagens confirmadas: { "<nº da figura>": { path, origem, documento, pagina, caixa } }
  imagens             jsonb not null default '{}'::jsonb check (jsonb_typeof(imagens) = 'object'),
  total_alteracoes    integer not null default 0 check (total_alteracoes >= 0),
  figuras_confirmadas integer not null default 0 check (figuras_confirmadas >= 0),
  criada_em           timestamptz not null default now(),
  unique (peca_id, numero),
  constraint pecas_versoes_tamanho_json check (pg_column_size(alteracoes) <= 2097152 and pg_column_size(imagens) <= 262144)
);

create index if not exists pecas_versoes_peca_idx on public.pecas_versoes (peca_id, numero desc);

-- ---------------------------------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.pecas enable row level security;
alter table public.pecas_versoes enable row level security;

drop policy if exists "pecas: leitura própria" on public.pecas;
create policy "pecas: leitura própria" on public.pecas for select to authenticated
  using (auth.uid() = user_id);

-- só cria peça de análise PRÓPRIA, com o arquivo na PRÓPRIA pasta
drop policy if exists "pecas: inserção própria" on public.pecas;
create policy "pecas: inserção própria" on public.pecas for insert to authenticated
  with check (
    auth.uid() = user_id
    and split_part(original_path, '/', 1) = auth.uid()::text
    and exists (select 1 from public.analises a where a.id = analise_id and a.user_id = auth.uid())
  );

-- atualização: guardar a busca das figuras e avançar a versão (a RPC abaixo); não troca de dono nem de análise
drop policy if exists "pecas: atualização própria" on public.pecas;
create policy "pecas: atualização própria" on public.pecas for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and split_part(original_path, '/', 1) = auth.uid()::text
    and exists (select 1 from public.analises a where a.id = analise_id and a.user_id = auth.uid())
  );

drop policy if exists "pecas: exclusão própria" on public.pecas;
create policy "pecas: exclusão própria" on public.pecas for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "pecas_versoes: leitura própria" on public.pecas_versoes;
create policy "pecas_versoes: leitura própria" on public.pecas_versoes for select to authenticated
  using (auth.uid() = user_id);

-- sem policy de insert/update/delete: versão só nasce pela RPC abaixo (que numera e mantém as 3 últimas)
drop policy if exists "pecas_versoes: inserção própria" on public.pecas_versoes;

-- ---------------------------------------------------------------------------------------------------------------------
-- RPC: salvar uma versão e manter só as 3 últimas
-- ---------------------------------------------------------------------------------------------------------------------
-- SECURITY DEFINER (como excluir_caso_completo): é o único caminho que cria e apaga versão, então precisa passar por
-- cima da falta de policy de insert/delete; a dona da peça é conferida aqui dentro, com auth.uid().
-- O SELECT … FOR UPDATE trava a linha da peça até o fim da transação: duas gravações simultâneas viram N e N+1, nunca
-- o mesmo número. O número sai da maior versão já gravada (não de versao_atual, que o app consegue alterar).
create or replace function public.salvar_versao_peca(
  p_peca_id uuid,
  p_alteracoes jsonb,
  p_imagens jsonb,
  p_total_alteracoes integer,
  p_figuras_confirmadas integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_numero integer;
  v_manter constant integer := 3; -- versões guardadas por peça
begin
  if v_user_id is null then raise exception 'NAO_AUTENTICADO'; end if;

  perform 1 from public.pecas where id = p_peca_id and user_id = v_user_id for update;
  if not found then raise exception 'PECA_NAO_ENCONTRADA'; end if;

  select coalesce(max(numero), 0) + 1 into v_numero from public.pecas_versoes where peca_id = p_peca_id;

  insert into public.pecas_versoes (peca_id, user_id, numero, alteracoes, imagens, total_alteracoes, figuras_confirmadas)
  values (
    p_peca_id, v_user_id, v_numero,
    coalesce(p_alteracoes, '{}'::jsonb), coalesce(p_imagens, '{}'::jsonb),
    greatest(coalesce(p_total_alteracoes, 0), 0), greatest(coalesce(p_figuras_confirmadas, 0), 0)
  );

  -- só as 3 últimas: a mais antiga sai (as imagens que só ela usava viram arquivo órfão, para a limpeza do bucket)
  delete from public.pecas_versoes where peca_id = p_peca_id and numero <= v_numero - v_manter;

  update public.pecas set versao_atual = v_numero where id = p_peca_id;
  return v_numero;
end;
$$;

revoke all on function public.salvar_versao_peca(uuid, jsonb, jsonb, integer, integer) from public, anon;
grant execute on function public.salvar_versao_peca(uuid, jsonb, jsonb, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Storage: bucket `pecas` (privado) + policies na própria pasta
-- ---------------------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pecas', 'pecas', false, 8388608, -- 8 MB por arquivo (o .docx tem ~200 KB; um print grande, alguns MB)
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "pecas: leitura própria pasta" on storage.objects;
create policy "pecas: leitura própria pasta" on storage.objects for select to authenticated
  using (bucket_id = 'pecas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pecas: upload própria pasta" on storage.objects;
create policy "pecas: upload própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'pecas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pecas: atualização própria pasta" on storage.objects;
create policy "pecas: atualização própria pasta" on storage.objects for update to authenticated
  using (bucket_id = 'pecas' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pecas' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pecas: exclusão própria pasta" on storage.objects;
create policy "pecas: exclusão própria pasta" on storage.objects for delete to authenticated
  using (bucket_id = 'pecas' and (storage.foldername(name))[1] = auth.uid()::text);

commit;

-- ---------------------------------------------------------------------------------------------------------------------
-- Depois de aplicar (código, não SQL):
--   * o app passa a gravar a peça ao gerar (original no bucket + linha em `pecas`; gerar de novo apaga antes a peça
--     anterior da mesma tese e os arquivos dela) e cada "Aplicar" vira salvar_versao_peca(); ao abrir a análise, a
--     peça salva é carregada sem chamar o Gemini;
--   * "Excluir meus dados" também apaga a pasta <user_id>/<analise_id>/ do bucket `pecas`, e a limpeza diária
--     (scripts/limpar-orfaos-storage.mjs) passa a remover arquivos de `pecas` que nenhuma peça ou versão usa mais
--     (inclusive as imagens das versões que saíram pelo limite de 3);
--   * scripts/teste-rls-isolamento.mjs ganha o caso "B não lê a peça de A".
--
-- Para desfazer (apaga TODAS as peças salvas):
--   drop function if exists public.salvar_versao_peca(uuid, jsonb, jsonb, integer, integer);
--   drop table if exists public.pecas_versoes; drop table if exists public.pecas;
--   -- e, no painel do Storage, esvaziar e apagar o bucket `pecas`; depois, as 4 policies "pecas: … pasta".
-- ---------------------------------------------------------------------------------------------------------------------
