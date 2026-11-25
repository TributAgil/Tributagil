-- docs/sql/seguranca-rpcs-fase2.sql
--
-- Segunda parte de docs/sql/seguranca-rpcs.sql: apaga as versões ANTIGAS (sem segredo) das RPCs de idempotência,
-- que eram a porta da falha de crédito. Rodar SÓ depois que o código que manda p_segredo estiver em produção e o
-- segredo estiver gravado em privado.segredos (senão a análise segue, mas sem estorno automático). É idempotente.

begin;

drop function if exists public.idempotencia_reclamar(text, uuid, integer);
drop function if exists public.idempotencia_liberar(text);
drop function if exists public.idempotencia_marcar_debitado(text);
drop function if exists public.idempotencia_confirmar_entrega(text);
drop function if exists public.idempotencia_falhar_e_estornar(text);

commit;
