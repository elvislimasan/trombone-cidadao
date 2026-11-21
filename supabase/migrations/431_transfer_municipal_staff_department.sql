begin;

-- Transfere o vínculo existente e recalcula seus acessos em uma única transação.
-- O ID e a data de criação permanecem; registros de atendimento não são movidos.
create function public.transfer_municipal_staff_department(
  p_member_id uuid,p_channel_id uuid,p_cargos text[],p_active boolean,p_version integer,p_disabled_modules text[]
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  m public.orgao_membros%rowtype;
  v_city bigint; v_pref uuid; v_version integer; v_previous_access jsonb;
begin
  select * into m from public.orgao_membros where id=p_member_id for update;
  select c.city_id,p.id into v_city,v_pref from public.orgao_canais c
    join public.prefeituras p on p.city_id=c.city_id and p.status='ativa' where c.id=m.canal_id;
  if not coalesce(public.pode_administrar_prefeitura(auth.uid(),v_city),false) then
    raise exception 'Somente o administrador desta prefeitura pode alterar a secretaria.' using errcode='42501';
  end if;
  -- Mantém o destino estável durante a validação e a transferência.
  perform 1 from public.orgao_canais where id=p_channel_id for share;
  perform public.validate_municipal_staff_modules(v_pref,p_channel_id,p_disabled_modules);
  perform public.validate_staff_roles(p_cargos,p_channel_id);
  select versao,to_jsonb(a) into v_version,v_previous_access
    from public.orgao_membro_acessos a where membro_id=m.id for update;
  if p_version is distinct from coalesce(v_version,0) then
    raise exception 'Os acessos mudaram. Reabra o funcionário.' using errcode='40001';
  end if;
  if p_channel_id is distinct from m.canal_id then
    if exists(select 1 from public.orgao_membros where canal_id=p_channel_id and user_id=m.user_id) then
      raise exception 'Este funcionário já está vinculado a esta secretaria. Edite o vínculo existente.' using errcode='23505';
    end if;
    update public.orgao_membros set canal_id=p_channel_id,updated_at=now() where id=m.id;
  end if;
  -- Reutiliza as validações de perfil, vínculo municipal, versão, cargos e módulos.
  perform public.set_municipal_staff_access(m.id,p_cargos,p_active,p_version,p_disabled_modules);
  if p_channel_id is distinct from m.canal_id then
    insert into public.municipal_access_audit(membro_id,user_id,canal_id,city_id,operation,previous_access,next_access)
      values(m.id,m.user_id,p_channel_id,v_city,'staff_department_transfer',
        jsonb_build_object('canal_id',m.canal_id,'ativo',m.ativo,'access',v_previous_access),
        jsonb_build_object('canal_id',p_channel_id,'ativo',p_active,'cargos',p_cargos,'disabled_modules',p_disabled_modules));
  end if;
end $$;
revoke all on function public.transfer_municipal_staff_department(uuid,uuid,text[],boolean,integer,text[]) from public,anon;
grant execute on function public.transfer_municipal_staff_department(uuid,uuid,text[],boolean,integer,text[]) to authenticated;

notify pgrst,'reload schema';
commit;
