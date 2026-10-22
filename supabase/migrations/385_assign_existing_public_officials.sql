begin;

create function public.municipal_public_official_candidates(p_prefeitura uuid)
returns table(user_id uuid,name text,phone text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select city_id into v_city from public.prefeituras where id=p_prefeitura and status='ativa';
  if not coalesce(public.pode_administrar_prefeitura(auth.uid(),v_city),false) then
    raise exception 'Sem permissao para consultar funcionarios desta prefeitura.' using errcode='42501';
  end if;
  return query
    select p.id,p.name,p.phone
    from public.profiles p
    where p.user_type='public_official'
      and not coalesce(p.is_admin,false) and not coalesce(p.is_master,false)
      and (p.city_id=v_city or exists(
        select 1 from public.prefeitura_membros pm join public.prefeituras pref on pref.id=pm.prefeitura_id
        where pm.user_id=p.id and pm.ativo and pref.city_id=v_city
      ))
    order by p.name nulls last,p.id;
end $$;
revoke all on function public.municipal_public_official_candidates(uuid) from public,anon;
grant execute on function public.municipal_public_official_candidates(uuid) to authenticated;

create function public.municipal_assign_existing_public_official(p_prefeitura uuid,p_canal uuid,p_user uuid,p_cargos text[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_city bigint; v_member uuid; v_version integer; v_papel text;
begin
  select city_id into v_city from public.prefeituras where id=p_prefeitura and status='ativa';
  if not coalesce(public.pode_administrar_prefeitura(auth.uid(),v_city),false) then
    raise exception 'Somente o administrador desta prefeitura pode vincular funcionarios.' using errcode='42501';
  end if;
  if not exists(select 1 from public.orgao_canais c where c.id=p_canal and c.city_id=v_city and c.ativo and not c.canal_triagem) then
    raise exception 'Selecione uma secretaria ativa desta prefeitura.';
  end if;
  if not exists(select 1 from public.profiles p
    where p.id=p_user and p.user_type='public_official'
      and not coalesce(p.is_admin,false) and not coalesce(p.is_master,false)
      and (p.city_id=v_city or exists(
        select 1 from public.prefeitura_membros pm join public.prefeituras pref on pref.id=pm.prefeitura_id
        where pm.user_id=p.id and pm.ativo and pref.city_id=v_city
      ))) then
    raise exception 'O usuario selecionado nao e um funcionario publico desta cidade.';
  end if;
  perform public.validate_staff_roles(p_cargos,p_canal);
  if not exists(select 1 from public.orgao_categorias where canal_id=p_canal)
    and p_cargos is distinct from array['inventario']::text[] then
    raise exception 'Secretarias sem categorias permitem somente o cargo de inventario.';
  end if;

  v_papel=case when 'gestor'=any(p_cargos) then 'gestor'
    when 'atendente'=any(p_cargos) then 'operador'
    when 'executor'=any(p_cargos) then 'eletricista' else 'leitura' end;
  insert into public.prefeitura_membros(prefeitura_id,user_id,papel,ativo,convidado_por)
    values(p_prefeitura,p_user,'colaborador',true,auth.uid())
    on conflict(prefeitura_id,user_id) do update set ativo=true,
      papel=case when prefeitura_membros.papel='administrador' then 'administrador' else 'colaborador' end,
      convidado_por=coalesce(prefeitura_membros.convidado_por,excluded.convidado_por),updated_at=now();
  insert into public.orgao_membros(canal_id,user_id,papel,ativo,convidado_por)
    values(p_canal,p_user,v_papel,true,auth.uid())
    on conflict(canal_id,user_id) do update set ativo=true,papel=excluded.papel,updated_at=now()
    returning id into v_member;
  select versao into v_version from public.orgao_membro_acessos where membro_id=v_member;
  perform public.set_municipal_staff_roles(v_member,p_cargos,true,coalesce(v_version,0));
  update public.profiles set city_id=coalesce(city_id,v_city) where id=p_user;
  return jsonb_build_object('member_id',v_member,'user_id',p_user);
end $$;
revoke all on function public.municipal_assign_existing_public_official(uuid,uuid,uuid,text[]) from public,anon;
grant execute on function public.municipal_assign_existing_public_official(uuid,uuid,uuid,text[]) to authenticated;

notify pgrst,'reload schema';
commit;
