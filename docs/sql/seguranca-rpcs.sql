-- docs/sql/seguranca-rpcs.sql
--
-- Fecha as funções SECURITY DEFINER do public que estavam abertas demais (revisão de 25/11/2026).
--
-- 1. FALHA DE CRÉDITO (a mais séria): as RPCs de idempotência da análise eram chamáveis por qualquer usuário logado,
--    direto pela API do Supabase com a chave anon (que é pública). A sequência
--      idempotencia_reclamar(chave nova, o próprio id) -> idempotencia_marcar_debitado -> idempotencia_falhar_e_estornar
--    devolvia 1 crédito sem nunca ter cobrado, quantas vezes quisesse. Também dava para estornar uma análise em
--    andamento e recebê-la de graça. Correção: as versões novas exigem p_segredo, um segredo que só o servidor
--    (api/gemini.js, variável SUPABASE_RPC_SEGREDO na Vercel) conhece; o valor fica em privado.segredos, numa schema
--    que a API do Supabase não expõe. idempotencia_reclamar passa a exigir login e o próprio id.
-- 2. EXECUTE para anon (aviso do Supabase): todas as funções SECURITY DEFINER do public deixam de ser chamáveis sem
--    login, menos rate_limit_checar, que o servidor chama ANTES de saber quem é o usuário (limite por IP).
--    criar_perfil_novo_usuario é gatilho: não precisa de EXECUTE para ninguém.
--
-- ORDEM (sem derrubar nada no meio):
--   a) rodar ESTE arquivo (cria as versões novas ao lado das antigas; o código atual continua usando as antigas);
--   b) gravar o segredo, o MESMO valor da variável SUPABASE_RPC_SEGREDO da Vercel (nunca no repositório):
--        insert into privado.segredos (nome, valor) values ('rpc_servidor', '<segredo>')
--        on conflict (nome) do update set valor = excluded.valor, criado_em = now();
--   c) publicar o código que manda p_segredo;
--   d) rodar docs/sql/seguranca-rpcs-fase2.sql (apaga as versões antigas, sem segredo).
-- É idempotente.

begin;

-- ---- Segredo do servidor ----------------------------------------------------------------------------------------------
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create table if not exists privado.segredos (
  nome      text primary key,
  valor     text not null check (length(valor) >= 32),
  criado_em timestamptz not null default now()
);
revoke all on privado.segredos from public, anon, authenticated;

-- true só se o segredo bate com o gravado. Sem segredo gravado, ninguém passa (fail-closed).
create or replace function privado.servidor_autorizado(p_segredo text) returns boolean
language sql stable security definer set search_path = privado
as $$
  select coalesce(length(p_segredo) >= 32 and exists (select 1 from privado.segredos where nome = 'rpc_servidor' and valor = p_segredo), false)
$$;
revoke all on function privado.servidor_autorizado(text) from public, anon, authenticated;

-- ---- Idempotência da análise: versões novas, com o segredo -----------------------------------------------------------
create or replace function public.idempotencia_reclamar(p_chave text, p_usuario_id uuid, p_janela_ms integer, p_segredo text)
returns table (acao text)
language plpgsql security definer set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_agora     timestamptz := clock_timestamp();
  v_janela_ms integer := least(greatest(coalesce(p_janela_ms, 60000), 1000), 3600000);
  v_janela    interval := (v_janela_ms || ' milliseconds')::interval;
  v_chave     text := left(coalesce(p_chave, ''), 200);
  v_existente public.idempotencia_analises%rowtype;
begin
  if not privado.servidor_autorizado(p_segredo) then raise exception 'NAO_AUTORIZADO'; end if;
  if v_user is null then raise exception 'NAO_AUTENTICADO'; end if;
  if p_usuario_id is distinct from v_user then raise exception 'USUARIO_DIVERGENTE'; end if;

  if v_chave = '' then
    return query select 'cobrar'::text;
    return;
  end if;

  select * into v_existente from public.idempotencia_analises where chave = v_chave for update;

  if not found then
    insert into public.idempotencia_analises (chave, usuario_id, status, criado_em) values (v_chave, v_user, 'em_andamento', v_agora);
    return query select 'cobrar'::text;
    return;
  end if;

  -- chave de outro usuário: nunca reaproveita nem muda o dono
  if v_existente.usuario_id is distinct from v_user then
    return query select 'bloquear'::text;
    return;
  end if;

  -- expirou: reabre do zero, como se fosse uma chave nova
  if v_existente.criado_em < v_agora - v_janela then
    update public.idempotencia_analises set status = 'em_andamento', criado_em = v_agora where chave = v_chave;
    return query select 'cobrar'::text;
    return;
  end if;

  -- já pago, ainda sem resultado: roda de novo SEM cobrar
  if v_existente.status = 'debitado' then
    return query select 'retomar'::text;
    return;
  end if;

  -- já estornado: uma tentativa nova é uma cobrança nova
  if v_existente.status = 'falhou' then
    update public.idempotencia_analises set status = 'em_andamento', criado_em = v_agora where chave = v_chave;
    return query select 'cobrar'::text;
    return;
  end if;

  -- 'em_andamento' (duplo clique) ou já entregue: bloqueia
  return query select 'bloquear'::text;
end;
$$;

create or replace function public.idempotencia_liberar(p_chave text, p_segredo text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not privado.servidor_autorizado(p_segredo) then raise exception 'NAO_AUTORIZADO'; end if;
  delete from public.idempotencia_analises
   where chave = left(coalesce(p_chave, ''), 200) and usuario_id = auth.uid() and status = 'em_andamento';
end;
$$;

create or replace function public.idempotencia_marcar_debitado(p_chave text, p_segredo text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not privado.servidor_autorizado(p_segredo) then raise exception 'NAO_AUTORIZADO'; end if;
  update public.idempotencia_analises set status = 'debitado', debitado_em = clock_timestamp()
   where chave = left(coalesce(p_chave, ''), 200) and usuario_id = auth.uid();
end;
$$;

create or replace function public.idempotencia_confirmar_entrega(p_chave text, p_segredo text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not privado.servidor_autorizado(p_segredo) then raise exception 'NAO_AUTORIZADO'; end if;
  update public.idempotencia_analises
     set status = 'entregue'
   where chave = left(coalesce(p_chave, ''), 200) and usuario_id = auth.uid() and status = 'debitado';
end;
$$;

create or replace function public.idempotencia_falhar_e_estornar(p_chave text, p_segredo text)
returns table (estornado boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_chave  text := left(coalesce(p_chave, ''), 200);
  v_linhas integer;
begin
  if not privado.servidor_autorizado(p_segredo) then raise exception 'NAO_AUTORIZADO'; end if;
  if v_user is null then raise exception 'NAO_AUTENTICADO'; end if;

  update public.idempotencia_analises
     set status = 'falhou'
   where chave = v_chave and usuario_id = v_user and status = 'debitado';
  get diagnostics v_linhas = row_count;

  if v_linhas = 0 then
    return query select false;
    return;
  end if;

  update public.perfis set creditos_bonus = creditos_bonus + 1, updated_at = now() where id = v_user;
  return query select true;
end;
$$;

-- ---- Permissões ---------------------------------------------------------------------------------------------------------
-- versões novas: só usuário logado (e, dentro, só com o segredo do servidor)
revoke all on function public.idempotencia_reclamar(text, uuid, integer, text) from public, anon;
revoke all on function public.idempotencia_liberar(text, text) from public, anon;
revoke all on function public.idempotencia_marcar_debitado(text, text) from public, anon;
revoke all on function public.idempotencia_confirmar_entrega(text, text) from public, anon;
revoke all on function public.idempotencia_falhar_e_estornar(text, text) from public, anon;
grant execute on function public.idempotencia_reclamar(text, uuid, integer, text) to authenticated;
grant execute on function public.idempotencia_liberar(text, text) to authenticated;
grant execute on function public.idempotencia_marcar_debitado(text, text) to authenticated;
grant execute on function public.idempotencia_confirmar_entrega(text, text) to authenticated;
grant execute on function public.idempotencia_falhar_e_estornar(text, text) to authenticated;

-- todas as funções SECURITY DEFINER do public: fora do anon; ficam para authenticated, que já tinha
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and p.proname <> 'rate_limit_checar'
  loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    if f.proname = 'criar_perfil_novo_usuario' then
      -- gatilho de auth.users: dispara sem precisar de EXECUTE; chamar à mão não faz sentido
      execute format('revoke execute on function %s from authenticated', f.assinatura);
    elsif f.proname <> 'idempotencia_estornar_presos' then
      execute format('grant execute on function %s to authenticated', f.assinatura);
    end if;
  end loop;
end;
$$;

commit;
