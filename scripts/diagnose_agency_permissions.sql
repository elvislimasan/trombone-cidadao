-- Read-only diagnostics for the production SQL editor. Does not send emails.
select version();
select n.nspname, p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'enviar_relatorios_do_orgao', 'preparar_envios_do_orgao',
  'disparar_envios_do_orgao', 'can_write', 'is_master'
);
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'public.permission_rules'::regclass;
select policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'public' and tablename in ('permission_rules', 'directory');
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'permission_rules';
select has_sequence_privilege('authenticated',
  pg_get_serial_sequence('public.permission_rules', 'id'), 'USAGE') as identity_usage;
select extname, extversion from pg_extension where extname in ('pg_net', 'http', 'pg_cron');
-- Do not select the integration secret or the full URL (which may contain credentials).
select id, function_url ~ '^https://[^/]+/functions/v1/send-agency-report/?$' as valid_function_url,
  nullif(btrim(secret), '') is not null as has_secret from public.integracao_orgao;
select status, periodo, count(*) from public.orgao_envios group by status, periodo;
