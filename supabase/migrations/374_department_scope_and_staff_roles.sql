-- Secretaria define as áreas; funcionário recebe somente cargos.
-- 369–373 são preservadas, inclusive para instalações que já as aplicaram.
begin;
alter table public.orgao_canais add column municipal_modules text[] not null default '{}',
  add column execution_specialties text[] not null default '{}',
  add column access_version integer not null default 1,
  add constraint department_modules_valid check(municipal_modules <@ array['urban_planning','arborization','lighting']::text[] and array_position(municipal_modules,null) is null),
  add constraint department_execution_valid check(execution_specialties <@ array['eletricista']::text[] and array_position(execution_specialties,null) is null);
alter table public.orgao_membro_acessos add column cargos text[] not null default '{}',
  add constraint staff_roles_valid check(cargos <@ array['gestor','atendente','leitura','inventario','executor']::text[] and array_position(cargos,null) is null);

-- Somente vínculos e categorias explícitos, nunca o nome da secretaria.
update public.orgao_canais c set municipal_modules=array_remove(array[
  case when exists(select 1 from public.urban_planner_cities a where a.municipal_canal_id=c.id) then 'urban_planning' end,
  case when exists(select 1 from public.tree_manager_cities a where a.canal_id=c.id) then 'arborization' end,
  case when exists(select 1 from public.orgao_categorias oc where oc.canal_id=c.id and oc.category_id='iluminacao') then 'lighting' end],null),
  execution_specialties=case when exists(select 1 from public.orgao_categorias oc where oc.canal_id=c.id and oc.category_id='iluminacao') then array['eletricista'] else '{}'::text[] end;
update public.orgao_membro_acessos a set cargos=array_remove(array[
  case a.atendimento when 'gestor' then 'gestor' when 'atendente' then 'atendente' when 'leitura' then 'leitura' end,
  case when cardinality(a.especialidades_execucao)>0 then 'executor' end,
  case when a.inventario_iluminacao or exists(select 1 from public.orgao_membros m where m.id=a.membro_id and (
    exists(select 1 from public.urban_planner_cities u where u.user_id=m.user_id and u.municipal_canal_id=m.canal_id)
    or exists(select 1 from public.tree_manager_cities t where t.user_id=m.user_id and t.canal_id=m.canal_id))) then 'inventario' end],null);

create function public.derive_department_staff_access(p_roles text[],p_channel uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('cargos',coalesce(p_roles,'{}'),
    'atendimento',case when exists(select 1 from public.orgao_categorias oc where oc.canal_id=c.id and oc.category_id=any(p.categorias_habilitadas)) then
      case when 'gestor'=any(p_roles) then 'gestor' when 'atendente'=any(p_roles) then 'atendente' when 'leitura'=any(p_roles) then 'leitura' else 'nenhum' end else 'nenhum' end,
    'especialidades_execucao',case when 'executor'=any(p_roles) and 'eletricista'=any(c.execution_specialties)
      and 'iluminacao'=any(p.categorias_habilitadas) and exists(select 1 from public.orgao_categorias oc where oc.canal_id=c.id and oc.category_id='iluminacao') then array['eletricista'] else '{}'::text[] end,
    'inventario_iluminacao',coalesce(p_roles && array['gestor','inventario'] and 'lighting'=any(c.municipal_modules) and 'iluminacao'=any(p.categorias_habilitadas),false))
  from public.orgao_canais c join public.prefeituras p on p.city_id=c.city_id where c.id=p_channel
$$;
revoke all on function public.derive_department_staff_access(text[],uuid) from public,anon,authenticated;

create function public.derive_staff_access_trigger() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_channel uuid; x jsonb;
begin
  select canal_id into v_channel from public.orgao_membros where id=new.membro_id;
  x=public.derive_department_staff_access(new.cargos,v_channel);
  new.atendimento=coalesce(x->>'atendimento','nenhum');
  new.especialidades_execucao=array(select jsonb_array_elements_text(x->'especialidades_execucao'));
  new.inventario_iluminacao=coalesce((x->>'inventario_iluminacao')::boolean,false);
  return new;
end $$;
create trigger derive_staff_access before insert or update on public.orgao_membro_acessos
  for each row execute function public.derive_staff_access_trigger();
update public.orgao_membro_acessos set cargos=cargos,versao=versao+1;

create or replace function public.municipal_channel_action(p_user uuid,p_channel uuid,p_action text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select p_user is not null and exists(select 1 from public.orgao_canais c
    join public.prefeituras p on p.city_id=c.city_id and p.status='ativa'
    join public.prefeitura_membros pm on pm.prefeitura_id=p.id and pm.user_id=p_user and pm.ativo
    left join public.orgao_membros m on m.canal_id=c.id and m.user_id=p_user and m.ativo
    left join public.orgao_membro_acessos a on a.membro_id=m.id
    cross join lateral (select public.derive_department_staff_access(a.cargos,c.id) value) effective
    where c.id=p_channel and c.ativo and not c.canal_triagem
      and not public.is_admin(p_user) and not public.is_master(p_user)
      and case p_action
        when 'read' then pm.papel='administrador' or effective.value->>'atendimento' in ('leitura','atendente','gestor')
        when 'receive' then pm.papel='administrador' or effective.value->>'atendimento' in ('atendente','gestor')
        when 'dispatch' then pm.papel='administrador' or effective.value->>'atendimento'='gestor'
        when 'execute' then coalesce(effective.value->'especialidades_execucao' ? 'eletricista',false)
        when 'lighting' then coalesce((effective.value->>'inventario_iluminacao')::boolean,false)
        else false end)
$$;

create function public.municipal_inventory_action(p_user uuid,p_city bigint,p_module text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.orgao_membros m join public.orgao_membro_acessos a on a.membro_id=m.id
    join public.orgao_canais c on c.id=m.canal_id
    where m.user_id=p_user and m.ativo and c.city_id=p_city and p_module=any(c.municipal_modules)
      and a.cargos && array['gestor','inventario'] and public.tree_management_membership(p_user,p_city,c.id)
      and public.territorial_rule_allows(p_user,p_module,true))
$$;
revoke all on function public.municipal_inventory_action(uuid,bigint,text) from public,anon;
grant execute on function public.municipal_inventory_action(uuid,bigint,text) to authenticated;
create or replace function public.pode_gerenciar_mapa_ruas(p_city_id bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select p_city_id is not null and (public.is_master(auth.uid()) or public.municipal_inventory_action(auth.uid(),p_city_id,'urban_planning')
    or exists(select 1 from public.urban_planner_cities a where a.user_id=auth.uid() and a.city_id=p_city_id and not a.municipal_enabled
      and public.territorial_rule_allows(auth.uid(),'urban_planning',false)))
$$;
create or replace function public.pode_gerenciar_arborizacao(p_city_id bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select p_city_id is not null and (public.is_master(auth.uid()) or public.municipal_inventory_action(auth.uid(),p_city_id,'arborization')
    or exists(select 1 from public.tree_manager_cities a where a.user_id=auth.uid() and a.city_id=p_city_id and not a.municipal_enabled
      and public.tree_management_membership(a.user_id,a.city_id,a.canal_id) and public.territorial_rule_allows(auth.uid(),'arborization',false)))
$$;
alter function public.can_write(uuid,text) rename to can_write_before_departments;
revoke all on function public.can_write_before_departments(uuid,text) from public,anon,authenticated;
create function public.can_write(p_user uuid,p_module text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select case when public.is_master(p_user) then true when p_module in ('urban_planning','arborization') then
    exists(select 1 from public.orgao_canais c where public.municipal_inventory_action(p_user,c.city_id,p_module))
    or case when p_module='urban_planning' then exists(select 1 from public.urban_planner_cities a where a.user_id=p_user and not a.municipal_enabled and public.territorial_rule_allows(p_user,p_module,false))
      else exists(select 1 from public.tree_manager_cities a where a.user_id=p_user and not a.municipal_enabled and public.tree_management_membership(p_user,a.city_id,a.canal_id) and public.territorial_rule_allows(p_user,p_module,false)) end
    else public.can_write_before_departments(p_user,p_module) end
$$;
revoke all on function public.can_write(uuid,text) from public,anon;
grant execute on function public.can_write(uuid,text) to authenticated;

create function public.department_inventory_assignments() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(x),'[]'::jsonb) from (
    select distinct jsonb_build_object('city_id',c.city_id,'canal_id',c.id,'secretaria',c.nome,'module',module) x
    from public.orgao_membros m join public.orgao_membro_acessos a on a.membro_id=m.id
    join public.orgao_canais c on c.id=m.canal_id cross join lateral unnest(c.municipal_modules) module
    where m.user_id=auth.uid() and m.ativo and a.cargos && array['gestor','inventario']
      and module in ('urban_planning','arborization') and public.tree_management_membership(auth.uid(),c.city_id,c.id)
      and public.municipal_inventory_action(auth.uid(),c.city_id,module)) assignments
$$;
revoke all on function public.department_inventory_assignments() from public,anon,authenticated;
alter function public.territorial_workspace() rename to territorial_workspace_before_departments;
revoke all on function public.territorial_workspace_before_departments() from public,anon,authenticated;
create function public.territorial_workspace() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('street_city_ids',coalesce((select jsonb_agg(distinct city_id) from (
    select a.city_id from public.urban_planner_cities a where a.user_id=auth.uid() and public.pode_gerenciar_mapa_ruas(a.city_id)
    union select (j->>'city_id')::bigint from jsonb_array_elements(public.department_inventory_assignments()) j where j->>'module'='urban_planning') cities),'[]'::jsonb),
    'tree_assignments',coalesce((select jsonb_agg(j) from (
      select jsonb_build_object('city_id',a.city_id,'canal_id',a.canal_id,'secretaria',c.nome) j from public.tree_manager_cities a
        join public.orgao_canais c on c.id=a.canal_id where a.user_id=auth.uid() and public.pode_gerenciar_arborizacao(a.city_id)
      union select j-'module' from jsonb_array_elements(public.department_inventory_assignments()) j where j->>'module'='arborization') trees),'[]'::jsonb),
    'municipalities',public.territorial_workspace_before_departments()->'municipalities')
$$;
revoke all on function public.territorial_workspace() from public,anon;
grant execute on function public.territorial_workspace() to authenticated;
alter function public.municipal_workspace_access() rename to municipal_workspace_access_before_departments;
revoke all on function public.municipal_workspace_access_before_departments() from public,anon,authenticated;
create function public.municipal_workspace_access() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select base.value||jsonb_build_object('access_contract',2,
    'category_channels',coalesce((select jsonb_agg(jsonb_build_object('city_id',oc.city_id,'canal_id',oc.canal_id,'category_id',oc.category_id))
      from public.orgao_categorias oc where exists(select 1 from jsonb_array_elements(base.value->'channels') j where j->>'id'=oc.canal_id::text)),'[]'::jsonb),
    'channels',coalesce((select jsonb_agg(j||jsonb_build_object('municipal_modules',c.municipal_modules,'execution_specialties',c.execution_specialties,'access_version',c.access_version))
    from jsonb_array_elements(base.value->'channels') j join public.orgao_canais c on c.id=(j->>'id')::uuid),'[]'::jsonb),
    'accesses',coalesce((select jsonb_agg(j||public.derive_department_staff_access(array(select jsonb_array_elements_text(j->'cargos')),(j->>'canal_id')::uuid)) from jsonb_array_elements(base.value->'accesses') j),'[]'::jsonb),
    'inventory_views',coalesce((select jsonb_agg(jsonb_build_object('city_id',c.city_id,'canal_id',c.id,'module',module))
      from public.orgao_membros m join public.orgao_membro_acessos a on a.membro_id=m.id join public.orgao_canais c on c.id=m.canal_id
      cross join lateral unnest(c.municipal_modules) module
      where m.user_id=auth.uid() and m.ativo and a.cargos && array['gestor','atendente','inventario','leitura']
        and module in ('urban_planning','arborization') and public.tree_management_membership(auth.uid(),c.city_id,c.id)),'[]'::jsonb),
    'inventories',(base.value->'inventories')||public.department_inventory_assignments())
  from (select public.municipal_workspace_access_before_departments() value) base
$$;
revoke all on function public.municipal_workspace_access() from public,anon;
grant execute on function public.municipal_workspace_access() to authenticated;

create function public.validate_staff_roles(p_roles text[],p_channel uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_roles is null or cardinality(p_roles)=0 or array_position(p_roles,null) is not null
    or not(p_roles <@ array['gestor','atendente','leitura','inventario','executor']::text[])
    or cardinality(p_roles)<>(select count(distinct x) from unnest(p_roles) x) then raise exception 'Selecione um cargo válido.'; end if;
  if 'executor'=any(p_roles) and not exists(select 1 from public.orgao_canais c where c.id=p_channel and cardinality(c.execution_specialties)>0) then
    raise exception 'A secretaria não possui execução de campo habilitada.'; end if;
end $$;
revoke all on function public.validate_staff_roles(text[],uuid) from public,anon,authenticated;

create function public.set_municipal_staff_roles(p_member_id uuid,p_cargos text[],p_active boolean,p_version integer)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.orgao_membros%rowtype; v_city bigint; v_version integer;
begin
  select * into m from public.orgao_membros where id=p_member_id for update;
  select city_id into v_city from public.orgao_canais where id=m.canal_id and ativo and not canal_triagem;
  if not coalesce(public.pode_administrar_prefeitura(auth.uid(),v_city),false) then raise exception 'Somente o administrador desta prefeitura pode definir cargos.' using errcode='42501'; end if;
  if p_active is null or public.is_admin(m.user_id) or public.is_master(m.user_id) then raise exception 'Funcionário inválido.'; end if;
  if p_active or p_cargos is distinct from (select cargos from public.orgao_membro_acessos where membro_id=m.id) then
    perform public.validate_staff_roles(p_cargos,m.canal_id);
  end if;
  select versao into v_version from public.orgao_membro_acessos where membro_id=m.id for update;
  if p_version is distinct from coalesce(v_version,0) then raise exception 'Os cargos mudaram. Reabra o funcionário.' using errcode='40001'; end if;
  if not public.pode_acessar_prefeitura(m.user_id,v_city) then raise exception 'Vínculo municipal inativo.'; end if;
  update public.profiles set user_type='public_official',city_id=coalesce(city_id,v_city) where id=m.user_id;
  update public.orgao_membros set ativo=p_active,papel=case when 'gestor'=any(p_cargos) then 'gestor' when 'atendente'=any(p_cargos) then 'operador' when 'executor'=any(p_cargos) then 'eletricista' else 'leitura' end,updated_at=now() where id=m.id;
  insert into public.orgao_membro_acessos(membro_id,cargos,versao,updated_by) values(m.id,p_cargos,coalesce(v_version,0)+1,auth.uid())
    on conflict(membro_id) do update set cargos=excluded.cargos,versao=excluded.versao,updated_by=auth.uid(),updated_at=now();
  insert into public.municipal_access_audit(membro_id,user_id,canal_id,city_id,operation,previous_access,next_access)
    values(m.id,m.user_id,m.canal_id,v_city,'staff_roles',to_jsonb(m),jsonb_build_object('cargos',p_cargos,'ativo',p_active));
end $$;
revoke all on function public.set_municipal_staff_roles(uuid,text[],boolean,integer) from public,anon;
grant execute on function public.set_municipal_staff_roles(uuid,text[],boolean,integer) to authenticated;
revoke all on function public.set_municipal_staff_responsibilities(uuid,jsonb,boolean,text[],integer) from public,anon,authenticated;
revoke all on function public.convidar_responsavel_municipal(uuid,uuid,text,jsonb,text[]) from public,anon,authenticated;

create function public.convidar_funcionario_secretaria(p_prefeitura uuid,p_canal uuid,p_email text,p_cargos text[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; v_role text;
begin
  perform public.validate_staff_roles(p_cargos,p_canal);
  v_role=case when 'gestor'=any(p_cargos) then 'gestor' when 'atendente'=any(p_cargos) then 'operador' when 'executor'=any(p_cargos) then 'eletricista' else 'leitura' end;
  result=public.convidar_funcionario_municipal(p_prefeitura,p_canal,p_email,v_role,'{}');
  update public.prefeitura_convites set staff_access=public.derive_department_staff_access(p_cargos,p_canal) where token=(result->>'token')::uuid;
  return result;
end $$;
revoke all on function public.convidar_funcionario_secretaria(uuid,uuid,text,text[]) from public,anon;
grant execute on function public.convidar_funcionario_secretaria(uuid,uuid,text,text[]) to authenticated;

-- Os convites anteriores conservam leitura e inventário quando ambos existiam.
update public.prefeitura_convites i set staff_access=coalesce(i.staff_access,'{}'::jsonb)||jsonb_build_object('cargos',array_remove(array[
  case i.staff_access->>'atendimento' when 'gestor' then 'gestor' when 'atendente' then 'atendente' when 'leitura' then 'leitura' end,
  case when i.staff_access->'especialidades_execucao' ? 'eletricista' then 'executor' end,
  case when cardinality(i.asset_modules)>0 then 'inventario' end],null)) where i.canal_id is not null;
alter function public.aceitar_convite_prefeitura(uuid) rename to aceitar_convite_prefeitura_before_departments;
revoke all on function public.aceitar_convite_prefeitura_before_departments(uuid) from public,anon,authenticated;
create function public.aceitar_convite_prefeitura(p_token uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare inv public.prefeitura_convites%rowtype; result jsonb; v_roles text[];
begin
  select * into inv from public.prefeitura_convites where token=p_token for update;
  if inv.status='pendente' and inv.canal_id is not null then
    v_roles=array(select jsonb_array_elements_text(inv.staff_access->'cargos'));
    perform public.validate_staff_roles(v_roles,inv.canal_id);
    update public.prefeitura_convites set staff_access=public.derive_department_staff_access(v_roles,inv.canal_id),asset_modules='{}' where id=inv.id;
  end if;
  result=public.aceitar_convite_prefeitura_before_departments(p_token);
  if inv.status='pendente' and inv.canal_id is not null then
    update public.orgao_membro_acessos set cargos=v_roles,versao=versao+1,updated_by=inv.convidado_por,updated_at=now()
      where membro_id=(select id from public.orgao_membros where user_id=auth.uid() and canal_id=inv.canal_id);
  end if;
  return result;
end $$;
revoke all on function public.aceitar_convite_prefeitura(uuid) from public,anon;
grant execute on function public.aceitar_convite_prefeitura(uuid) to authenticated;

create function public.refresh_department_staff() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_channel uuid;
begin
  if tg_table_name='orgao_canais' then v_channel=new.id;
  elsif tg_op='DELETE' then v_channel=old.canal_id;
  else v_channel=new.canal_id; end if;
  update public.orgao_membro_acessos a set cargos=a.cargos,versao=versao+1,updated_by=auth.uid(),updated_at=now()
    from public.orgao_membros m where m.id=a.membro_id and m.canal_id=v_channel;
  return null;
end $$;
create trigger refresh_department_modules after update of municipal_modules,execution_specialties on public.orgao_canais
  for each row execute function public.refresh_department_staff();
create trigger refresh_department_categories after insert or update or delete on public.orgao_categorias
  for each row execute function public.refresh_department_staff();

create function public.salvar_secretaria_municipal(p_id uuid,p_city bigint,p_dados jsonb,p_categorias text[],p_modules text[],p_execution text[],p_version integer default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid()); v_city bigint; v_version integer;
begin
  if not coalesce(public.pode_administrar_prefeitura(auth.uid(),p_city),false) then raise exception 'Sem acesso a esta prefeitura.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('department:'||p_city::text,0));
  if p_modules is null or not(p_modules <@ array['urban_planning','arborization','lighting']::text[]) or array_position(p_modules,null) is not null
    or p_execution is null or not(p_execution <@ array['eletricista']::text[]) or array_position(p_execution,null) is not null
    or p_categorias is null or array_position(p_categorias,null) is not null then raise exception 'Responsabilidades inválidas.'; end if;
  if ('lighting'=any(p_modules) or 'eletricista'=any(p_execution)) and not('iluminacao'=any(p_categorias)) then
    raise exception 'Selecione solicitações de iluminação para habilitar postes ou execução elétrica.'; end if;
  if p_id is not null then
    select city_id,access_version into v_city,v_version from public.orgao_canais where id=p_id and not canal_triagem for update;
    if v_city is distinct from p_city then raise exception 'A secretaria não pertence a esta cidade.' using errcode='42501'; end if;
    if p_version is distinct from v_version then raise exception 'A secretaria mudou. Reabra o cadastro.' using errcode='40001'; end if;
    update public.orgao_canais set nome=btrim(p_dados->>'nome'),email=lower(btrim(p_dados->>'email')),
      emails_copia=array(select jsonb_array_elements_text(coalesce(p_dados->'emails_copia','[]'))),reply_to=lower(btrim(p_dados->>'reply_to')),
      municipal_modules=p_modules,execution_specialties=p_execution,access_version=access_version+1 where id=p_id;
  else
    insert into public.orgao_canais(id,city_id,nome,email,emails_copia,reply_to,criado_por,ativo,municipal_modules,execution_specialties)
      values(v_id,p_city,btrim(p_dados->>'nome'),lower(btrim(p_dados->>'email')),array(select jsonb_array_elements_text(coalesce(p_dados->'emails_copia','[]'))),
        lower(btrim(p_dados->>'reply_to')),auth.uid(),false,p_modules,p_execution);
  end if;
  delete from public.orgao_categorias where canal_id=v_id;
  insert into public.orgao_categorias(canal_id,city_id,category_id) select v_id,p_city,category from unnest(p_categorias) category;
  insert into public.municipal_access_audit(canal_id,city_id,operation,next_access) values(v_id,p_city,'department_scope',
    jsonb_build_object('categorias',p_categorias,'municipal_modules',p_modules,'execution_specialties',p_execution));
  return v_id;
end $$;
revoke all on function public.salvar_secretaria_municipal(uuid,bigint,jsonb,text[],text[],text[],integer) from public,anon;
grant execute on function public.salvar_secretaria_municipal(uuid,bigint,jsonb,text[],text[],text[],integer) to authenticated;
notify pgrst,'reload schema';
commit;
