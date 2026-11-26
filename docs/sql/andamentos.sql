-- docs/sql/andamentos.sql
--
-- Acompanhamento do processo pelo DataJud (CNJ), 26/11/2026: a última consulta de cada CASO (movimentações já
-- classificadas por api/_datajud.js). Quem grava: o servidor (api/andamentos.js), com o token do próprio usuário,
-- via salvar_andamentos_caso (confere que o caso é dele). O navegador só lê (RLS). É idempotente.

begin;

create table if not exists public.andamentos_caso (
  caso_id             uuid primary key references public.casos(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  numero              text not null check (numero ~ '^\d{20}$'),
  tribunal            text not null default '',
  status              text not null check (status in ('ok', 'nao_encontrado', 'indisponivel', 'erro')),
  detalhe             text not null default '',
  classe              text not null default '',
  orgao               text not null default '',
  ultima_atualizacao  timestamptz,
  ultima_movimentacao timestamptz,
  movimentos          jsonb not null default '[]'::jsonb,
  consultado_em       timestamptz not null default now()
);
create index if not exists andamentos_caso_user_idx on public.andamentos_caso (user_id);

alter table public.andamentos_caso enable row level security;
drop policy if exists "andamentos_caso: leitura própria" on public.andamentos_caso;
create policy "andamentos_caso: leitura própria" on public.andamentos_caso for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.andamentos_caso from anon, authenticated;
revoke all on public.andamentos_caso from anon;

-- Grava a consulta. Uma consulta que falhou (indisponível/erro) NÃO apaga as movimentações da última que deu certo:
-- só atualiza status, detalhe e a hora.
create or replace function public.salvar_andamentos_caso(
  p_caso_id uuid, p_numero text, p_tribunal text, p_status text, p_detalhe text, p_dados jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'NAO_AUTENTICADO'; end if;
  if not exists (select 1 from public.casos c where c.id = p_caso_id and c.user_id = v_user) then
    raise exception 'CASO_NAO_ENCONTRADO';
  end if;
  if p_status in ('ok', 'nao_encontrado') then
    insert into public.andamentos_caso as a (caso_id, user_id, numero, tribunal, status, detalhe, classe, orgao,
                                             ultima_atualizacao, ultima_movimentacao, movimentos, consultado_em)
    values (p_caso_id, v_user, p_numero, coalesce(p_tribunal, ''), p_status, left(coalesce(p_detalhe, ''), 300),
            left(coalesce(p_dados->>'classe', ''), 120), left(coalesce(p_dados->>'orgao', ''), 160),
            (p_dados->>'ultima_atualizacao')::timestamptz, (p_dados->>'ultima_movimentacao')::timestamptz,
            coalesce(p_dados->'movimentos', '[]'::jsonb), now())
    on conflict (caso_id) do update set
      numero = excluded.numero, tribunal = excluded.tribunal, status = excluded.status, detalhe = excluded.detalhe,
      classe = excluded.classe, orgao = excluded.orgao, ultima_atualizacao = excluded.ultima_atualizacao,
      ultima_movimentacao = excluded.ultima_movimentacao, movimentos = excluded.movimentos, consultado_em = now()
    where a.user_id = v_user;
  else
    insert into public.andamentos_caso as a (caso_id, user_id, numero, tribunal, status, detalhe, consultado_em)
    values (p_caso_id, v_user, p_numero, coalesce(p_tribunal, ''), p_status, left(coalesce(p_detalhe, ''), 300), now())
    on conflict (caso_id) do update set
      numero = excluded.numero, tribunal = excluded.tribunal, status = excluded.status, detalhe = excluded.detalhe,
      consultado_em = now()
    where a.user_id = v_user;
  end if;
end;
$$;

revoke all on function public.salvar_andamentos_caso(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.salvar_andamentos_caso(uuid, text, text, text, text, jsonb) to authenticated;

commit;

-- Para desfazer:
--   drop function if exists public.salvar_andamentos_caso(uuid, text, text, text, text, jsonb);
--   drop table if exists public.andamentos_caso;
