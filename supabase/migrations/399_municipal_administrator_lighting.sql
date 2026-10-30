-- O administrador da prefeitura também cuida do cadastro de postes da cidade.
-- Mantém a execução de campo e as permissões da equipe separadas do inventário.
begin;

create or replace function public.municipal_city_action(p_user uuid,p_city bigint,p_action text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select (p_action in ('read','receive','dispatch') and public.pode_administrar_prefeitura(p_user,p_city))
    or (p_action='lighting' and public.pode_administrar_prefeitura(p_user,p_city)
      and exists(select 1 from public.prefeituras p where p.city_id=p_city and p.status='ativa'
        and 'iluminacao'=any(p.categorias_habilitadas)))
    or exists(select 1 from public.orgao_canais c where c.city_id=p_city
      and public.municipal_channel_action(p_user,c.id,p_action))
$$;
revoke all on function public.municipal_city_action(uuid,bigint,text) from public,anon;
grant execute on function public.municipal_city_action(uuid,bigint,text) to authenticated;

notify pgrst,'reload schema';
commit;
