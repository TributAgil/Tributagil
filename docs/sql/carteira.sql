-- docs/sql/carteira.sql
--
-- Carteira de casos com alerta de prazo (etapa 1 das melhorias de 25/11/2026).
--
-- carteira_casos: uma linha por CASO (todas as versões da análise): a fase em que o caso está (analisado, peça gerada,
--   protocolado, decidido, arquivado), o status de cada tese no último cálculo e quando foi calculado.
-- marcos_prazo: os marcos do último cálculo (api/_carteira.js): 'consumado' (já prescrito/decaído) e 'acompanhar'
--   (consuma numa data conhecida se nada interromper). O 'acompanhar' vira e-mail no dia seguinte à data
--   (api/alertas-prazo.js, cron diário da Vercel); alertado_em evita mandar o mesmo aviso duas vezes, inclusive depois
--   de recalcular.
--
-- Quem grava: o servidor (api/gerar-peca.js), com o token do próprio usuário, via salvar_prazos_caso; a fase, o
-- navegador via definir_fase_caso. O cron lê e marca os alertas via RPCs que exigem o segredo do servidor
-- (privado.servidor_autorizado, docs/sql/seguranca-rpcs.sql). Requer seguranca-rpcs.sql aplicado antes.
-- É idempotente. APLICADO em produção em 25/11/2026 (migração carteira).

begin;

create table if not exists public.carteira_casos (
  caso_id       uuid primary key references public.casos(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  analise_id    uuid references public.analises(id) on delete set null,
  fase          text not null default 'analisado'
                check (fase in ('analisado', 'peca_gerada', 'protocolado', 'decidido', 'arquivado')),
  fase_em       timestamptz not null default now(),
  ajuizada      boolean,
  teses         jsonb not null default '[]'::jsonb,
  calculado_em  timestamptz,
  atualizado_em timestamptz not null default now()
);
create index if not exists carteira_casos_user_idx on public.carteira_casos (user_id);

create table if not exists public.marcos_prazo (
  id          bigint generated always as identity primary key,
  caso_id     uuid not null references public.casos(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  chave       text not null,
  tese        text not null check (tese in ('prescricao_ordinaria', 'decadencia', 'prescricao_intercorrente')),
  cda         text not null default '',
  periodo     text not null default '',
  data        date not null,
  tipo        text not null check (tipo in ('consumado', 'acompanhar')),
  condicao    text not null default '',
  alertado_em timestamptz,
  unique (caso_id, chave)
);
create index if not exists marcos_prazo_user_idx on public.marcos_prazo (user_id);
create index if not exists marcos_prazo_pendentes_idx on public.marcos_prazo (data) where tipo = 'acompanhar' and alertado_em is null;

alter table public.carteira_casos enable row level security;
alter table public.marcos_prazo enable row level security;
drop policy if exists "carteira_casos: leitura própria" on public.carteira_casos;
create policy "carteira_casos: leitura própria" on public.carteira_casos for select to authenticated using (auth.uid() = user_id);
drop policy if exists "marcos_prazo: leitura própria" on public.marcos_prazo;
create policy "marcos_prazo: leitura própria" on public.marcos_prazo for select to authenticated using (auth.uid() = user_id);
-- sem insert/update/delete direto: só as RPCs abaixo escrevem
revoke insert, update, delete on public.carteira_casos from anon, authenticated;
revoke insert, update, delete on public.marcos_prazo from anon, authenticated;
revoke all on public.carteira_casos from anon;
revoke all on public.marcos_prazo from anon;

-- Grava o resultado de um cálculo (o servidor chama depois do motor, com o token do usuário). Troca os marcos do caso
-- pelos novos, mas o marco que continua igual (mesma chave) mantém alertado_em: recalcular não repete o e-mail.
-- p_peca_gerada: o caso passa de 'analisado' para 'peca_gerada' (as outras fases o advogado é quem muda).
create or replace function public.salvar_prazos_caso(
  p_analise_id uuid, p_ajuizada boolean, p_teses jsonb, p_marcos jsonb, p_peca_gerada boolean default false
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_caso  uuid;
  v_total integer;
begin
  if v_user is null then raise exception 'NAO_AUTENTICADO'; end if;
  select caso_id into v_caso from public.analises where id = p_analise_id and user_id = v_user;
  if v_caso is null then raise exception 'ANALISE_NAO_ENCONTRADA'; end if;
  if jsonb_typeof(coalesce(p_marcos, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_marcos, '[]'::jsonb)) > 300 then
    raise exception 'MARCOS_INVALIDOS';
  end if;

  insert into public.carteira_casos as c (caso_id, user_id, analise_id, fase, ajuizada, teses, calculado_em)
  values (v_caso, v_user, p_analise_id, case when p_peca_gerada then 'peca_gerada' else 'analisado' end, p_ajuizada,
          coalesce(p_teses, '[]'::jsonb), now())
  on conflict (caso_id) do update
    set analise_id = excluded.analise_id, ajuizada = excluded.ajuizada, teses = excluded.teses, calculado_em = now(),
        atualizado_em = now(),
        fase = case when p_peca_gerada and c.fase = 'analisado' then 'peca_gerada' else c.fase end,
        fase_em = case when p_peca_gerada and c.fase = 'analisado' then now() else c.fase_em end;

  delete from public.marcos_prazo m
   where m.caso_id = v_caso
     and m.chave not in (select left(coalesce(e ->> 'chave', ''), 300) from jsonb_array_elements(coalesce(p_marcos, '[]'::jsonb)) e);

  insert into public.marcos_prazo (caso_id, user_id, chave, tese, cda, periodo, data, tipo, condicao)
  select v_caso, v_user, left(e ->> 'chave', 300), e ->> 'tese', left(coalesce(e ->> 'cda', ''), 80),
         left(coalesce(e ->> 'periodo', ''), 80), (e ->> 'data')::date, e ->> 'tipo', left(coalesce(e ->> 'condicao', ''), 300)
    from jsonb_array_elements(coalesce(p_marcos, '[]'::jsonb)) e
  on conflict (caso_id, chave) do update
    set tipo = excluded.tipo, condicao = excluded.condicao, data = excluded.data;

  select count(*) into v_total from public.marcos_prazo where caso_id = v_caso;
  return v_total;
end;
$$;

-- A fase do caso, escolhida pelo advogado na carteira.
create or replace function public.definir_fase_caso(p_caso_id uuid, p_fase text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NAO_AUTENTICADO'; end if;
  if p_fase not in ('analisado', 'peca_gerada', 'protocolado', 'decidido', 'arquivado') then raise exception 'FASE_INVALIDA'; end if;
  if not exists (select 1 from public.casos where id = p_caso_id and user_id = v_user) then raise exception 'CASO_NAO_ENCONTRADO'; end if;
  insert into public.carteira_casos as c (caso_id, user_id, fase, fase_em)
  values (p_caso_id, v_user, p_fase, now())
  on conflict (caso_id) do update set fase = excluded.fase, fase_em = now(), atualizado_em = now()
   where c.user_id = v_user;
end;
$$;

-- Cron (sem usuário): os marcos 'acompanhar' cuja data já passou (dia de Brasília) e que ainda não viraram e-mail.
-- Caso decidido ou arquivado não recebe alerta.
create or replace function public.alertas_prazo_pendentes(p_segredo text)
returns table (id bigint, user_id uuid, email text, caso_id uuid, titulo text, tese text, cda text, periodo text,
               data date, condicao text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not privado.servidor_autorizado(p_segredo) then raise exception 'NAO_AUTORIZADO'; end if;
  return query
    select m.id, m.user_id, u.email::text, m.caso_id, coalesce(cs.titulo, 'Caso sem título'), m.tese, m.cda, m.periodo,
           m.data, m.condicao
      from public.marcos_prazo m
      join auth.users u on u.id = m.user_id
      left join public.casos cs on cs.id = m.caso_id
      left join public.carteira_casos c on c.caso_id = m.caso_id
     where m.tipo = 'acompanhar'
       and m.alertado_em is null
       and m.data < (now() at time zone 'America/Sao_Paulo')::date
       and coalesce(c.fase, 'analisado') not in ('decidido', 'arquivado')
     order by m.user_id, m.data
     limit 1000;
end;
$$;

create or replace function public.marcar_alertas_enviados(p_segredo text, p_ids bigint[])
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_total integer;
begin
  if not privado.servidor_autorizado(p_segredo) then raise exception 'NAO_AUTORIZADO'; end if;
  update public.marcos_prazo set alertado_em = now() where id = any(coalesce(p_ids, '{}')) and alertado_em is null;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.salvar_prazos_caso(uuid, boolean, jsonb, jsonb, boolean) from public, anon;
revoke all on function public.definir_fase_caso(uuid, text) from public, anon;
grant execute on function public.salvar_prazos_caso(uuid, boolean, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.definir_fase_caso(uuid, text) to authenticated;
-- o cron não tem usuário: chama com a chave anon, e quem barra é o segredo
revoke all on function public.alertas_prazo_pendentes(text) from public;
revoke all on function public.marcar_alertas_enviados(text, bigint[]) from public;
grant execute on function public.alertas_prazo_pendentes(text) to anon, authenticated;
grant execute on function public.marcar_alertas_enviados(text, bigint[]) to anon, authenticated;

commit;

-- Para desfazer:
--   drop function if exists public.marcar_alertas_enviados(text, bigint[]); drop function if exists public.alertas_prazo_pendentes(text);
--   drop function if exists public.definir_fase_caso(uuid, text);
--   drop function if exists public.salvar_prazos_caso(uuid, boolean, jsonb, jsonb, boolean);
--   drop table if exists public.marcos_prazo; drop table if exists public.carteira_casos;
