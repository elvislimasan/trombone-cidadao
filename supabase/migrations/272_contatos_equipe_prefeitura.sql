-- E-mails de autenticação ficam restritos aos administradores municipais
-- ativos, apenas para funcionários vinculados às suas próprias cidades.
begin;

create or replace function public.listar_emails_equipe_prefeitura()
returns table (membro_id uuid, email text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id as membro_id, u.email::text
  from public.orgao_membros m
  join public.orgao_canais c on c.id = m.canal_id
  join auth.users u on u.id = m.user_id
  where auth.uid() is not null
    and public.pode_administrar_prefeitura(auth.uid(), c.city_id)
$$;

revoke all on function public.listar_emails_equipe_prefeitura() from public, anon;
grant execute on function public.listar_emails_equipe_prefeitura() to authenticated;

commit;
