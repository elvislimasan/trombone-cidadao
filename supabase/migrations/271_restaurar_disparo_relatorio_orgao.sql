-- A migration do painel das prefeituras removeu por engano o EXECUTE da RPC
-- usada pelo botão "Gerar mensal agora". A função já valida internamente que
-- a sessão pertence a admin/master; restaurar o grant não abre o disparo para
-- usuários comuns e também preserva a execução pelo pg_cron sem sessão.

begin;

revoke all on function public.enviar_relatorios_do_orgao(text) from public, anon;
grant execute on function public.enviar_relatorios_do_orgao(text) to authenticated;

notify pgrst, 'reload schema';
commit;

