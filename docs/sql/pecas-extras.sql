-- docs/sql/pecas-extras.sql
--
-- Peças extras e novas teses (melhorias de 25/11/2026): a coluna `pecas.tese` deixa de aceitar só as três teses
-- originais. Passa a aceitar qualquer identificador simples (minúsculas e "_"), para as novas teses do motor
-- (ilegitimidade_passiva, nulidade_cda, cobranca_indevida) e as peças extras do modelo genérico (replica, embargos,
-- agravo, reconhecimento_intercorrente). Continua UMA peça por análise e tese (índice único pecas_analise_tese_unq).
-- É idempotente. APLICADO em produção em 25/11/2026 (migração pecas_extras).

begin;

alter table public.pecas drop constraint if exists pecas_tese_check;
alter table public.pecas add constraint pecas_tese_check check (tese ~ '^[a-z_]{3,40}$');

commit;
