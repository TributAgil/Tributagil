-- docs/sql/consumo-lu.sql
--
-- Limite diário do "Pedir ao Lu", em CRÉDITOS INFORMATIVOS: 1.000.000 de créditos = US$ 1,50 de Gemini por usuário por
-- dia (decisão do Luan, 30/10/2026). O servidor (api/lu-peca.js) converte os tokens que o Gemini informa em cada
-- resposta: 1 token de entrada = 1 crédito; 1 token de saída (inclusive o de raciocínio) = 6 créditos (preço de lista
-- do gemini-3.5-flash: US$ 1,50 e US$ 9,00 por milhão). O dia vira à meia-noite de Brasília.
--
-- Só o servidor grava (RPC registrar_consumo_lu, chamada com o token do próprio usuário depois de cada resposta do Lu);
-- o app só lê. APLICADO em produção em 30/10/2026 (migração consumo_lu). É idempotente.

begin;

create table if not exists public.consumo_lu (
  user_id       uuid not null references auth.users(id) on delete cascade,
  dia           date not null,
  creditos      bigint not null default 0 check (creditos >= 0),
  pedidos       integer not null default 0 check (pedidos >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, dia)
);

alter table public.consumo_lu enable row level security;

drop policy if exists "consumo_lu: leitura própria" on public.consumo_lu;
create policy "consumo_lu: leitura própria" on public.consumo_lu for select to authenticated
  using (auth.uid() = user_id);
-- sem policy de insert/update/delete: só as RPCs abaixo mexem no contador

-- O "hoje" do usuário: a data no fuso de Brasília.
create or replace function public.dia_do_lu() returns date
language sql stable set search_path = public
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Quanto o usuário já gastou hoje (0 se ainda não usou).
create or replace function public.consumo_lu_hoje()
returns table (creditos bigint, pedidos integer, dia date)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'NAO_AUTENTICADO'; end if;
  return query
    select coalesce(c.creditos, 0)::bigint, coalesce(c.pedidos, 0)::integer, public.dia_do_lu()
      from (select 1) um
      left join public.consumo_lu c on c.user_id = v_user_id and c.dia = public.dia_do_lu();
end;
$$;

-- Soma o gasto de UM pedido ao Lu e devolve o total do dia. Nunca subtrai; um pedido sozinho não passa de 500 mil
-- créditos (o servidor limita a saída do modelo, então um pedido real fica muito abaixo disso).
create or replace function public.registrar_consumo_lu(p_creditos integer)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_total bigint;
begin
  if v_user_id is null then raise exception 'NAO_AUTENTICADO'; end if;
  if p_creditos is null or p_creditos < 0 or p_creditos > 500000 then raise exception 'CREDITOS_INVALIDOS'; end if;
  insert into public.consumo_lu as c (user_id, dia, creditos, pedidos)
  values (v_user_id, public.dia_do_lu(), p_creditos, 1)
  on conflict (user_id, dia) do update
    set creditos = c.creditos + excluded.creditos, pedidos = c.pedidos + 1, atualizado_em = now()
  returning c.creditos into v_total;
  return v_total;
end;
$$;

revoke all on function public.consumo_lu_hoje() from public, anon;
revoke all on function public.registrar_consumo_lu(integer) from public, anon;
grant execute on function public.consumo_lu_hoje() to authenticated;
grant execute on function public.registrar_consumo_lu(integer) to authenticated;

commit;

-- Para desfazer:
--   drop function if exists public.registrar_consumo_lu(integer); drop function if exists public.consumo_lu_hoje();
--   drop function if exists public.dia_do_lu(); drop table if exists public.consumo_lu;
