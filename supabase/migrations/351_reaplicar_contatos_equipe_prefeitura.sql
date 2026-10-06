-- A versão 272 também foi usada por sewage_issue_types na main. A CLI pode
-- pular 272_contatos_equipe_prefeitura num banco com a antiga 272 aplicada.
-- Reinstalar a RPC em uma versão inédita atende ambos os históricos sem
-- alterar os registros de migrações já executadas.
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
