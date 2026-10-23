-- Lu: resumo da última peça gerada e cota de 5 perguntas com IA por consulta.
-- Rodar em produção SÓ com autorização expressa do Luan.
alter table public.analises add column if not exists peca_resumo jsonb;
alter table public.analises alter column perguntas_lu_disponiveis set default 5;
-- consultas antigas com mais de 5 perguntas sobrando passam a ter no máximo 5
-- (o código já limita a 5; isto só alinha o banco)
update public.analises set perguntas_lu_disponiveis = 5 where perguntas_lu_disponiveis > 5;
