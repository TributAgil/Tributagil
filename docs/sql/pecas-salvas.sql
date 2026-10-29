-- docs/sql/pecas-salvas.sql
--
-- Salvar a PEÇA no banco, com versões: rodar UMA vez no SQL Editor do Supabase (é idempotente: rodar de novo não
-- duplica nada). Ainda NÃO aplicado em produção.
--
-- O QUE FICA SALVO
--   pecas          uma linha por peça gerada (análise + tese). O .docx ORIGINAL que /api/gerar-peca devolveu fica no
--                  bucket `pecas`; com ele, reabrir a peça não chama o Gemini de novo. Guarda também o resumo, a lista
--                  de figuras e o resultado da busca das figuras (para não repetir a busca, que custa IA).
--   pecas_versoes  cada "Aplicar/Salvar" do editor vira uma versão numerada (1, 2, 3…): as alterações de texto
--                  (o mesmo JSON que o editor já usa) e as imagens confirmadas (caminhos no bucket `pecas`). A peça
--                  revisada é remontada no navegador a partir do original + versão — o Word final não é guardado.
--   bucket pecas   privado; cada usuário só enxerga a própria pasta (primeiro segmento do caminho = auth.uid()).
--                  Caminhos: <user_id>/<analise_id>/<peca_id>/original.docx
--                            <user_id>/<analise_id>/<peca_id>/figuras/<numero>-<carimbo>.png
--
-- REGRAS
--   * Versão é histórico: o app só insere e lê (sem update/delete pelo app). Some junto com a peça.
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

create index if not exists pecas_analise_tese_idx on public.pecas (analise_id, tese, created_at desc);
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

-- versão só de peça PRÓPRIA; sem policy de update/delete: versão é histórico
drop policy if exists "pecas_versoes: inserção própria" on public.pecas_versoes;
create policy "pecas_versoes: inserção própria" on public.pecas_versoes for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.pecas p where p.id = peca_id and p.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------------------------------------------------
-- RPC: salvar uma versão (numeração sem buraco nem repetição, mesmo com dois cliques ao mesmo tempo)
-- ---------------------------------------------------------------------------------------------------------------------
-- SECURITY INVOKER: roda com as permissões do próprio usuário, sob a RLS acima (não precisa de privilégio extra).
-- O UPDATE trava a linha da peça até o fim da transação: duas gravações simultâneas viram 1 e 2, nunca 1 e 1.
create or replace function public.salvar_versao_peca(
  p_peca_id uuid,
  p_alteracoes jsonb,
  p_imagens jsonb,
  p_total_alteracoes integer,
  p_figuras_confirmadas integer
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_numero integer;
begin
  if auth.uid() is null then raise exception 'NAO_AUTENTICADO'; end if;

  update public.pecas
     set versao_atual = versao_atual + 1
   where id = p_peca_id and user_id = auth.uid()
  returning versao_atual into v_numero;
  if v_numero is null then raise exception 'PECA_NAO_ENCONTRADA'; end if;

  insert into public.pecas_versoes (peca_id, user_id, numero, alteracoes, imagens, total_alteracoes, figuras_confirmadas)
  values (
    p_peca_id, auth.uid(), v_numero,
    coalesce(p_alteracoes, '{}'::jsonb), coalesce(p_imagens, '{}'::jsonb),
    greatest(coalesce(p_total_alteracoes, 0), 0), greatest(coalesce(p_figuras_confirmadas, 0), 0)
  );
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
--   * o app passa a gravar a peça ao gerar (original no bucket + linha em `pecas`) e cada "Aplicar" vira
--     salvar_versao_peca(); ao abrir a análise, a última peça salva é carregada sem chamar o Gemini;
--   * "Excluir meus dados" também apaga a pasta <user_id>/<analise_id>/ do bucket `pecas`, e a limpeza diária
--     (scripts/limpar-orfaos-storage.mjs) passa a remover arquivos de `pecas` sem linha correspondente;
--   * scripts/teste-rls-isolamento.mjs ganha o caso "B não lê a peça de A".
--
-- Para desfazer (apaga TODAS as peças salvas):
--   drop function if exists public.salvar_versao_peca(uuid, jsonb, jsonb, integer, integer);
--   drop table if exists public.pecas_versoes; drop table if exists public.pecas;
--   -- e, no painel do Storage, esvaziar e apagar o bucket `pecas`; depois, as 4 policies "pecas: … pasta".
-- ---------------------------------------------------------------------------------------------------------------------
