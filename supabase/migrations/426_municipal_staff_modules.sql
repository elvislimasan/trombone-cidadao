begin;

-- A lista vazia preserva a herança, inclusive para módulos adicionados depois.
alter table public.orgao_membro_acessos add column disabled_modules text[] not null default '{}'
  check(disabled_modules <@ array['arborization','water_supply','lighting','urban_planning']::text[]
    and array_position(disabled_modules,null) is null);

create function public.municipal_category_module(p_category text) returns text
language sql immutable set search_path=public,pg_temp as $$
  select case p_category when 'poda' then 'arborization' when 'iluminacao' then 'lighting' when 'buracos' then 'urban_planning' end
$$;
create function public.municipal_staff_module_allowed(p_user uuid,p_channel uuid,p_module text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select p_user is not null and (p_module is null
    or exists(select 1 from public.orgao_canais c where c.id=p_channel and public.pode_administrar_prefeitura(p_user,c.city_id))
    or not exists(select 1 from public.orgao_membros m join public.orgao_membro_acessos a on a.membro_id=m.id
      where m.user_id=p_user and m.canal_id=p_channel and p_module=any(a.disabled_modules)))
$$;
revoke all on function public.municipal_staff_module_allowed(uuid,uuid,text) from public,anon;
grant execute on function public.municipal_staff_module_allowed(uuid,uuid,text) to authenticated;

create function public.effective_municipal_staff_access(p_roles text[],p_channel uuid,p_disabled text[]) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select public.derive_department_staff_access(p_roles,p_channel)||jsonb_build_object(
    'disabled_modules',coalesce(p_disabled,'{}'::text[]),
    'atendimento',case when exists(select 1 from public.orgao_categorias oc join public.orgao_canais c on c.id=oc.canal_id
      join public.prefeituras p on p.city_id=c.city_id where oc.canal_id=p_channel and oc.category_id=any(p.categorias_habilitadas)
      and not coalesce(public.municipal_category_module(oc.category_id)=any(p_disabled),false))
      then public.derive_department_staff_access(p_roles,p_channel)->>'atendimento' else 'nenhum' end,
    'especialidades_execucao',array(select jsonb_array_elements_text(public.derive_department_staff_access(p_roles,p_channel)->'especialidades_execucao')
      except select case m when 'arborization' then 'arborizacao' when 'urban_planning' then 'ruas' when 'lighting' then 'eletricista' end from unnest(p_disabled) m),
    'inventario_iluminacao',coalesce((public.derive_department_staff_access(p_roles,p_channel)->>'inventario_iluminacao')::boolean,false)
      and not coalesce('lighting'=any(p_disabled),false))
$$;
revoke all on function public.effective_municipal_staff_access(text[],uuid,text[]) from public,anon,authenticated;
create or replace function public.derive_staff_access_trigger() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare x jsonb;
begin
  x=public.effective_municipal_staff_access(new.cargos,(select canal_id from public.orgao_membros where id=new.membro_id),new.disabled_modules);
  new.atendimento=coalesce(x->>'atendimento','nenhum');
  new.especialidades_execucao=array(select jsonb_array_elements_text(x->'especialidades_execucao'));
  new.inventario_iluminacao=coalesce((x->>'inventario_iluminacao')::boolean,false);
  return new;
end $$;

-- Conserva as verificações de vínculo, cargo, cidade e revogações anteriores.
-- Copia as implementações anteriores sem renomear seus OIDs: as políticas RLS
-- existentes precisam continuar vinculadas aos predicados que serão atualizados.
do $migration$
declare signature regprocedure; definition text; function_name text;
begin
  foreach signature in array array[
    'public.municipal_channel_action(uuid,uuid,text)'::regprocedure,
    'public.field_executor_can_work(uuid,uuid,text,text)'::regprocedure,
    'public.pipa_can(uuid,text)'::regprocedure,
    'public.pode_ver_demanda(uuid,uuid)'::regprocedure,
    'public.municipal_workspace_access()'::regprocedure] loop
    select proname into function_name from pg_proc where oid=signature;
    definition=pg_get_functiondef(signature);
    execute replace(definition,'FUNCTION public.'||function_name||'(','FUNCTION public.'||function_name||'_before_staff_modules(');
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated',
      function_name||'_before_staff_modules',pg_get_function_identity_arguments(signature));
  end loop;
end $migration$;
create or replace function public.municipal_channel_action(p_user uuid,p_channel uuid,p_action text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select public.municipal_channel_action_before_staff_modules(p_user,p_channel,p_action) and (
    exists(select 1 from public.orgao_canais c where c.id=p_channel and public.pode_administrar_prefeitura(p_user,c.city_id))
    or case when p_action in ('lighting','execute') then public.municipal_staff_module_allowed(p_user,p_channel,'lighting')
      when p_action in ('read','receive','dispatch') then exists(select 1 from public.orgao_categorias oc
        join public.orgao_canais c on c.id=oc.canal_id join public.prefeituras p on p.city_id=c.city_id
        where oc.canal_id=p_channel and oc.category_id=any(p.categorias_habilitadas)
          and public.municipal_staff_module_allowed(p_user,p_channel,public.municipal_category_module(oc.category_id)))
      else true end)
$$;
revoke all on function public.municipal_channel_action(uuid,uuid,text) from public,anon;
grant execute on function public.municipal_channel_action(uuid,uuid,text) to authenticated;

create or replace function public.municipal_inventory_action(p_user uuid,p_city bigint,p_module text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.orgao_membros m join public.orgao_membro_acessos a on a.membro_id=m.id
    join public.orgao_canais c on c.id=m.canal_id
    where m.user_id=p_user and m.ativo and c.city_id=p_city and p_module=any(c.municipal_modules)
      and public.municipal_staff_module_allowed(p_user,c.id,p_module)
      and a.cargos && array['gestor','inventario'] and public.tree_management_membership(p_user,p_city,c.id)
      and public.territorial_rule_allows(p_user,p_module,true))
$$;

create or replace function public.pode_gerenciar_arborizacao(p_city_id bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select p_city_id is not null and (public.is_master(auth.uid()) or public.municipal_inventory_action(auth.uid(),p_city_id,'arborization')
    or exists(select 1 from public.tree_manager_cities a where a.user_id=auth.uid() and a.city_id=p_city_id and not a.municipal_enabled
      and public.tree_management_membership(a.user_id,a.city_id,a.canal_id) and public.territorial_rule_allows(auth.uid(),'arborization',false)
      and public.municipal_staff_module_allowed(auth.uid(),a.canal_id,'arborization')))
$$;
create or replace function public.pode_gerenciar_mapa_ruas(p_city_id bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select p_city_id is not null and (public.is_master(auth.uid()) or public.municipal_inventory_action(auth.uid(),p_city_id,'urban_planning')
    or exists(select 1 from public.urban_planner_cities a where a.user_id=auth.uid() and a.city_id=p_city_id and not a.municipal_enabled
      and public.territorial_rule_allows(auth.uid(),'urban_planning',false)
      and public.municipal_staff_module_allowed(auth.uid(),a.municipal_canal_id,'urban_planning')))
$$;

create or replace function public.field_executor_can_work(p_user uuid,p_channel uuid,p_specialty text,p_category text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select public.field_executor_can_work_before_staff_modules(p_user,p_channel,p_specialty,p_category)
    and public.municipal_staff_module_allowed(p_user,p_channel,public.municipal_category_module(p_category))
$$;
revoke all on function public.field_executor_can_work(uuid,uuid,text,text) from public,anon;
grant execute on function public.field_executor_can_work(uuid,uuid,text,text) to authenticated;

create or replace function public.pipa_can(p_channel uuid,p_action text default 'read') returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select public.pipa_can_before_staff_modules(p_channel,p_action)
    and public.municipal_staff_module_allowed(auth.uid(),p_channel,'water_supply')
$$;
revoke all on function public.pipa_can(uuid,text) from public,anon;
grant execute on function public.pipa_can(uuid,text) to authenticated;

-- Categoria e secretaria precisam estar autorizadas no mesmo vínculo.
create or replace function public.municipal_report_access(p_user uuid,p_report uuid,p_action text default 'read') returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.reports r where r.id=p_report and (
    public.pode_administrar_prefeitura(p_user,r.city_id)
    or exists(select 1 from public.orgao_casos c where c.report_id=r.id and public.municipal_channel_action(p_user,c.canal_id,p_action)
      and public.municipal_staff_module_allowed(p_user,c.canal_id,public.municipal_category_module(r.category_id)))
    or (p_action='read' and exists(select 1 from public.demanda_broncas b where b.report_id=r.id and public.pode_ver_demanda(p_user,b.demanda_id)))
    or (not exists(select 1 from public.orgao_casos c where c.report_id=r.id)
      and exists(select 1 from public.orgao_categorias oc where oc.city_id=r.city_id and oc.category_id=r.category_id
        and public.municipal_channel_action(p_user,oc.canal_id,p_action)
        and public.municipal_staff_module_allowed(p_user,oc.canal_id,public.municipal_category_module(r.category_id))))))
$$;

-- A exceção de autoria usada no INSERT RETURNING não pode reabrir o módulo
-- privado após uma revogação. O escopo usa os campos da linha, sem depender
-- de enxergar a nova solicitação dentro do snapshot de uma função STABLE.
create function public.municipal_staff_report_module_scope(p_user uuid,p_city bigint,p_category text,p_report uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select not exists(select 1 from public.orgao_membros m join public.orgao_membro_acessos a on a.membro_id=m.id
    join public.orgao_canais c on c.id=m.canal_id where m.user_id=p_user and c.city_id=p_city
      and public.municipal_category_module(p_category)=any(a.disabled_modules))
    or public.municipal_report_access(p_user,p_report)
    or exists(select 1 from public.orgao_categorias oc where oc.city_id=p_city and oc.category_id=p_category
      and public.municipal_channel_action(p_user,oc.canal_id,'read')
      and public.municipal_staff_module_allowed(p_user,oc.canal_id,public.municipal_category_module(p_category)))
$$;
revoke all on function public.municipal_staff_report_module_scope(uuid,bigint,text,uuid) from public,anon;
grant execute on function public.municipal_staff_report_module_scope(uuid,bigint,text,uuid) to authenticated;
create policy municipal_staff_modules_scope on public.reports as restrictive for select to authenticated
  using(is_public or created_by_municipality is null
    or public.municipal_staff_report_module_scope(auth.uid(),city_id,category_id,id));
create or replace function public.pode_ver_demanda(p_user uuid,p_demanda uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select public.pode_ver_demanda_before_staff_modules(p_user,p_demanda)
    and exists(select 1 from public.demandas_municipais d where d.id=p_demanda
      and public.municipal_staff_module_allowed(p_user,d.canal_id,public.municipal_category_module(d.category_id)))
$$;
revoke all on function public.pode_ver_demanda(uuid,uuid) from public,anon;
grant execute on function public.pode_ver_demanda(uuid,uuid) to authenticated;

-- Escritas por RPC SECURITY DEFINER também respeitam o módulo da categoria.
create function public.enforce_staff_module_operation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare category text; previous_category text;
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name='demandas_municipais' then
    category=new.category_id;
    if tg_op='UPDATE' then previous_category=old.category_id; end if;
  else
    select category_id into category from public.reports where id=new.report_id;
    if tg_op='UPDATE' then select category_id into previous_category from public.reports where id=old.report_id; end if;
  end if;
  if not public.municipal_staff_module_allowed(auth.uid(),new.canal_id,public.municipal_category_module(category)) then
    raise exception 'Este módulo está desativado para você nesta secretaria.' using errcode='42501'; end if;
  if tg_op='UPDATE' and not public.municipal_staff_module_allowed(auth.uid(),old.canal_id,public.municipal_category_module(previous_category)) then
    raise exception 'Sem acesso ao módulo de origem.' using errcode='42501'; end if;
  return new;
end $$;
revoke all on function public.enforce_staff_module_operation() from public,anon,authenticated;
create trigger enforce_staff_module before insert or update on public.demandas_municipais
  for each row execute function public.enforce_staff_module_operation();
create trigger enforce_staff_module before update on public.orgao_casos
  for each row execute function public.enforce_staff_module_operation();
create trigger enforce_staff_module before insert or update on public.orgao_respostas
  for each row execute function public.enforce_staff_module_operation();

create function public.enforce_staff_report_module() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  -- O bloqueio é do atendimento; relatos comuns do cidadão seguem suas regras.
  if auth.uid() is null or new.created_by_municipality is null then return new; end if;
  if not public.pode_administrar_prefeitura(auth.uid(),new.city_id) and not exists(
    select 1 from public.orgao_categorias oc where oc.city_id=new.city_id and oc.category_id=new.category_id
      and public.municipal_channel_action(auth.uid(),oc.canal_id,'receive')
      and public.municipal_staff_module_allowed(auth.uid(),oc.canal_id,public.municipal_category_module(new.category_id))) then
    raise exception 'Sem acesso ao módulo desta solicitação.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.enforce_staff_report_module() from public,anon,authenticated;
create trigger enforce_staff_report_module before insert or update of category_id,created_by_municipality on public.reports
  for each row execute function public.enforce_staff_report_module();

-- O atendimento de árvores não ganha acesso pela categoria de outro módulo.
create or replace function public.can_manage_tree_adoption(p_city bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and (public.pode_gerenciar_arborizacao(p_city)
    or public.pode_administrar_prefeitura(auth.uid(),p_city)
    or exists(select 1 from public.orgao_categorias c where c.city_id=p_city and c.category_id='poda'
      and public.municipal_channel_action(auth.uid(),c.canal_id,'receive')
      and public.municipal_staff_module_allowed(auth.uid(),c.canal_id,'arborization')))
$$;
create or replace function public.can_dispatch_tree_adoption(p_city bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select auth.uid() is not null and (public.pode_gerenciar_arborizacao(p_city)
    or public.pode_administrar_prefeitura(auth.uid(),p_city)
    or exists(select 1 from public.orgao_categorias c where c.city_id=p_city and c.category_id='poda'
      and public.municipal_channel_action(auth.uid(),c.canal_id,'dispatch')
      and public.municipal_staff_module_allowed(auth.uid(),c.canal_id,'arborization')))
$$;

-- Avisos novos também respeitam a revogação, sem apagar o histórico anterior.
do $migration$
declare definition text;
begin
  if to_regprocedure('public.notify_tree_adoption_new_request()') is not null then
    definition=pg_get_functiondef('public.notify_tree_adoption_new_request()'::regprocedure);
    definition=replace(definition,
      'and public.territorial_rule_allows(p.id,''arborization'',false))',
      'and public.territorial_rule_allows(p.id,''arborization'',false) and public.municipal_staff_module_allowed(p.id,a.canal_id,''arborization''))');
    definition=replace(definition,
      'and public.municipal_channel_action(p.id,c.canal_id,''receive''))',
      'and public.municipal_channel_action(p.id,c.canal_id,''receive'') and public.municipal_staff_module_allowed(p.id,c.canal_id,''arborization''))');
    execute definition;
  end if;
end $migration$;

create or replace function public.municipal_workspace_access() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with base as(select public.municipal_workspace_access_before_staff_modules() value)
  select base.value||jsonb_build_object('staff_modules_contract',1,
    'accesses',coalesce((select jsonb_agg(j||public.effective_municipal_staff_access(
      array(select jsonb_array_elements_text(j->'cargos')),(j->>'canal_id')::uuid,
      array(select jsonb_array_elements_text(coalesce(j->'disabled_modules','[]'::jsonb)))))
      from jsonb_array_elements(base.value->'accesses') j),'[]'::jsonb),
    'category_channels',coalesce((select jsonb_agg(j) from jsonb_array_elements(base.value->'category_channels') j
      where public.municipal_staff_module_allowed(auth.uid(),(j->>'canal_id')::uuid,public.municipal_category_module(j->>'category_id'))),'[]'::jsonb),
    'inventory_views',coalesce((select jsonb_agg(j) from jsonb_array_elements(base.value->'inventory_views') j
      where public.municipal_staff_module_allowed(auth.uid(),(j->>'canal_id')::uuid,j->>'module')),'[]'::jsonb),
    'inventories',coalesce((select jsonb_agg(j) from jsonb_array_elements(base.value->'inventories') j
      where public.municipal_staff_module_allowed(auth.uid(),(j->>'canal_id')::uuid,j->>'module')),'[]'::jsonb)) from base
$$;
revoke all on function public.municipal_workspace_access() from public,anon;
grant execute on function public.municipal_workspace_access() to authenticated;

create function public.validate_municipal_staff_modules(p_prefeitura uuid,p_channel uuid,p_disabled_modules text[]) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select city_id into v_city from public.prefeituras where id=p_prefeitura and status='ativa';
  if not coalesce(public.pode_administrar_prefeitura(auth.uid(),v_city),false) then
    raise exception 'Somente o administrador desta prefeitura pode definir módulos.' using errcode='42501'; end if;
  if not exists(select 1 from public.orgao_canais where id=p_channel and city_id=v_city and ativo and not canal_triagem) then
    raise exception 'Secretaria indisponível nesta prefeitura.' using errcode='42501'; end if;
  if p_disabled_modules is null or array_position(p_disabled_modules,null) is not null
    or not(p_disabled_modules <@ array['arborization','water_supply','lighting','urban_planning']::text[])
    or cardinality(p_disabled_modules)<>(select count(distinct x) from unnest(p_disabled_modules) x) then
    raise exception 'Informe módulos válidos, sem repetições.' using errcode='22023'; end if;
end $$;
revoke all on function public.validate_municipal_staff_modules(uuid,uuid,text[]) from public,anon;
grant execute on function public.validate_municipal_staff_modules(uuid,uuid,text[]) to authenticated;

create function public.set_municipal_staff_access(p_member_id uuid,p_cargos text[],p_active boolean,p_version integer,p_disabled_modules text[]) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_channel uuid; v_pref uuid;
begin
  select m.canal_id,p.id into v_channel,v_pref from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id
    join public.prefeituras p on p.city_id=c.city_id where m.id=p_member_id for update of m;
  perform public.validate_municipal_staff_modules(v_pref,v_channel,p_disabled_modules);
  perform public.set_municipal_staff_roles(p_member_id,p_cargos,p_active,p_version);
  update public.orgao_membro_acessos set disabled_modules=p_disabled_modules,updated_by=auth.uid(),updated_at=now() where membro_id=p_member_id;
end $$;
revoke all on function public.set_municipal_staff_access(uuid,text[],boolean,integer,text[]) from public,anon;
grant execute on function public.set_municipal_staff_access(uuid,text[],boolean,integer,text[]) to authenticated;

create function public.municipal_assign_public_official_modules(p_prefeitura uuid,p_canal uuid,p_user uuid,p_cargos text[],p_disabled_modules text[]) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  perform public.validate_municipal_staff_modules(p_prefeitura,p_canal,p_disabled_modules);
  result=public.municipal_assign_existing_public_official(p_prefeitura,p_canal,p_user,p_cargos);
  update public.orgao_membro_acessos set disabled_modules=p_disabled_modules,updated_by=auth.uid(),updated_at=now()
    where membro_id=(result->>'member_id')::uuid;
  return result;
end $$;
revoke all on function public.municipal_assign_public_official_modules(uuid,uuid,uuid,text[],text[]) from public,anon;
grant execute on function public.municipal_assign_public_official_modules(uuid,uuid,uuid,text[],text[]) to authenticated;

create function public.provision_municipal_account_modules(p_user uuid,p_kind text,p_city bigint,p_name text,p_prefeitura uuid,p_channel uuid,p_roles text[],p_disabled_modules text[]) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if p_kind='staff' then perform public.validate_municipal_staff_modules(p_prefeitura,p_channel,p_disabled_modules); end if;
  result=public.provision_municipal_account(p_user,p_kind,p_city,p_name,p_prefeitura,p_channel,p_roles);
  if p_kind='staff' then
    update public.orgao_membro_acessos set disabled_modules=p_disabled_modules,updated_by=auth.uid(),updated_at=now()
      where membro_id=(select id from public.orgao_membros where user_id=p_user and canal_id=p_channel);
  end if;
  return result;
end $$;
revoke all on function public.provision_municipal_account_modules(uuid,text,bigint,text,uuid,uuid,text[],text[]) from public,anon;
grant execute on function public.provision_municipal_account_modules(uuid,text,bigint,text,uuid,uuid,text[],text[]) to authenticated;

notify pgrst,'reload schema';
commit;
