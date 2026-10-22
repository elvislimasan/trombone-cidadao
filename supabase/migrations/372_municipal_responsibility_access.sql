-- Aplicar com o cliente compatível, após revisar o relatório de conversão.
-- Não altera concessões territoriais nem infere inventário exclusivo de leitura.
begin;

create table public.orgao_membro_acessos (
  membro_id uuid primary key references public.orgao_membros(id) on delete cascade,
  atendimento text not null default 'nenhum' check(atendimento in ('nenhum','leitura','atendente','gestor')),
  especialidades_execucao text[] not null default '{}' check(especialidades_execucao <@ array['eletricista']::text[] and array_position(especialidades_execucao,null) is null),
  inventario_iluminacao boolean not null default false,
  versao integer not null default 1,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table public.municipal_access_audit (
  id bigint generated always as identity primary key,
  membro_id uuid, user_id uuid, canal_id uuid, city_id bigint,
  actor_id uuid default auth.uid(), operation text not null,
  previous_access jsonb, next_access jsonb, created_at timestamptz not null default now()
);
alter table public.orgao_membro_acessos enable row level security;
alter table public.municipal_access_audit enable row level security;
revoke all on public.orgao_membro_acessos,public.municipal_access_audit from public,anon,authenticated;
grant select on public.orgao_membro_acessos,public.municipal_access_audit to authenticated;
create policy staff_access_read on public.orgao_membro_acessos for select to authenticated using(exists(
  select 1 from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id
  where m.id=membro_id and (m.user_id=auth.uid() or public.pode_administrar_prefeitura(auth.uid(),c.city_id))));
create policy staff_audit_read on public.municipal_access_audit for select to authenticated
  using(public.pode_administrar_prefeitura(auth.uid(),city_id));

insert into public.orgao_membro_acessos(membro_id,atendimento,especialidades_execucao,inventario_iluminacao)
select m.id,case m.papel when 'gestor' then 'gestor' when 'operador' then 'atendente' when 'leitura' then 'leitura' else 'nenhum' end,
  case when m.papel='eletricista' then array['eletricista'] else '{}'::text[] end,
  m.papel='gestor' and exists(select 1 from public.orgao_categorias oc where oc.canal_id=m.canal_id and oc.category_id='iluminacao')
from public.orgao_membros m;
insert into public.municipal_access_audit(membro_id,user_id,canal_id,city_id,operation,previous_access,next_access)
select m.id,m.user_id,m.canal_id,c.city_id,'legacy_conversion',jsonb_build_object('papel',m.papel),to_jsonb(a)
from public.orgao_membro_acessos a join public.orgao_membros m on m.id=a.membro_id join public.orgao_canais c on c.id=m.canal_id;

create function public.municipal_channel_action(p_user uuid,p_channel uuid,p_action text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select p_user is not null and exists(select 1 from public.orgao_canais c
    join public.prefeituras p on p.city_id=c.city_id and p.status='ativa'
    join public.prefeitura_membros pm on pm.prefeitura_id=p.id and pm.user_id=p_user and pm.ativo
    left join public.orgao_membros m on m.canal_id=c.id and m.user_id=p_user and m.ativo
    left join public.orgao_membro_acessos a on a.membro_id=m.id
    where c.id=p_channel and c.ativo and not c.canal_triagem
    and not public.is_admin(p_user) and not public.is_master(p_user)
    and case p_action
      when 'read' then pm.papel='administrador' or a.atendimento in ('leitura','atendente','gestor')
      when 'receive' then pm.papel='administrador' or a.atendimento in ('atendente','gestor')
      when 'dispatch' then pm.papel='administrador' or a.atendimento='gestor'
      when 'execute' then 'eletricista'=any(a.especialidades_execucao)
        and exists(select 1 from public.orgao_categorias oc where oc.canal_id=c.id and oc.category_id='iluminacao')
        and 'iluminacao'=any(p.categorias_habilitadas)
      when 'lighting' then a.inventario_iluminacao
        and exists(select 1 from public.orgao_categorias oc where oc.canal_id=c.id and oc.category_id='iluminacao')
        and 'iluminacao'=any(p.categorias_habilitadas)
      else false end)
$$;
revoke all on function public.municipal_channel_action(uuid,uuid,text) from public,anon;
grant execute on function public.municipal_channel_action(uuid,uuid,text) to authenticated;

create function public.municipal_city_action(p_user uuid,p_city bigint,p_action text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select (p_action in ('read','receive','dispatch') and public.pode_administrar_prefeitura(p_user,p_city))
    or exists(select 1 from public.orgao_canais c where c.city_id=p_city and public.municipal_channel_action(p_user,c.id,p_action))
$$;
revoke all on function public.municipal_city_action(uuid,bigint,text) from public,anon;
grant execute on function public.municipal_city_action(uuid,bigint,text) to authenticated;

-- Compatibilidade só projeta a configuração nova. Nunca lê o papel antigo.
create or replace function public.papel_no_orgao(p_user uuid,p_canal uuid)
returns text language sql stable security definer set search_path=public,pg_temp as $$
  select case when a.atendimento='gestor' then 'gestor' when a.atendimento='atendente' then 'operador'
    when public.municipal_channel_action(p_user,p_canal,'execute') then 'eletricista'
    when a.atendimento='leitura' then 'leitura' end
  from public.orgao_membro_acessos a join public.orgao_membros m on m.id=a.membro_id
    join public.orgao_canais c on c.id=m.canal_id
  where m.user_id=p_user and m.canal_id=p_canal and m.ativo
    and public.tree_management_membership(p_user,c.city_id,p_canal)
  -- c é resolvido pelo canal, nunca por um parâmetro de cidade do cliente.
$$;

create or replace function public.pode_ver_caso_do_orgao(p_user uuid,p_canal uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.municipal_channel_action(p_user,p_canal,'read') or exists(select 1 from public.orgao_canais c
    where c.id=p_canal and public.pode_administrar_prefeitura(p_user,c.city_id))
$$;
create or replace function public.pode_operar_caso_do_orgao(p_user uuid,p_canal uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.municipal_channel_action(p_user,p_canal,'receive')
$$;
create or replace function public.eletricista_ativo_municipio(p_user uuid,p_city bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.municipal_city_action(p_user,p_city,'execute')
$$;

create function public.municipal_workspace_access() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('memberships',coalesce((select jsonb_agg(jsonb_build_object('papel',m.papel,
    'prefeitura',to_jsonb(p)||jsonb_build_object('cidade',(select to_jsonb(ci) from public.cities ci where ci.id=p.city_id))))
    from public.prefeitura_membros m join public.prefeituras p on p.id=m.prefeitura_id
    where m.user_id=auth.uid() and m.ativo and p.status='ativa'
      and not public.is_admin(auth.uid()) and not public.is_master(auth.uid())),'[]'::jsonb),
    'channels',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome,'city_id',c.city_id,'ativo',c.ativo,'canal_triagem',c.canal_triagem))
      from public.orgao_canais c where c.ativo and not c.canal_triagem and (public.pode_administrar_prefeitura(auth.uid(),c.city_id)
        or public.tree_management_membership(auth.uid(),c.city_id,c.id))),'[]'::jsonb),
    'execution_team',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'canal_id',m.canal_id,'especialidades_execucao',a.especialidades_execucao))
      from public.orgao_membros m join public.orgao_membro_acessos a on a.membro_id=m.id join public.orgao_canais c on c.id=m.canal_id
      where public.municipal_channel_action(m.user_id,m.canal_id,'execute')
        and public.municipal_city_action(auth.uid(),c.city_id,'dispatch')),'[]'::jsonb),
    'inventories',coalesce((select jsonb_agg(j) from (
      select jsonb_build_object('city_id',a.city_id,'canal_id',a.municipal_canal_id,'module','urban_planning') j
      from public.urban_planner_cities a where a.user_id=auth.uid() and public.pode_gerenciar_mapa_ruas(a.city_id)
      union all select jsonb_build_object('city_id',a.city_id,'canal_id',a.canal_id,'module','arborization')
      from public.tree_manager_cities a where a.user_id=auth.uid() and public.pode_gerenciar_arborizacao(a.city_id)) inventories),'[]'::jsonb),
    'accesses',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('canal_id',m.canal_id,'city_id',c.city_id))
      from public.orgao_membro_acessos a join public.orgao_membros m on m.id=a.membro_id join public.orgao_canais c on c.id=m.canal_id
      where m.user_id=auth.uid() and m.ativo and public.tree_management_membership(auth.uid(),c.city_id,c.id)),'[]'::jsonb))
$$;
revoke all on function public.municipal_workspace_access() from public,anon;
grant execute on function public.municipal_workspace_access() to authenticated;

create function public.audit_municipal_access() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.orgao_membros%rowtype; v_city bigint;
begin
  select * into m from public.orgao_membros where id=new.membro_id;
  select city_id into v_city from public.orgao_canais where id=m.canal_id;
  insert into public.municipal_access_audit(membro_id,user_id,canal_id,city_id,operation,previous_access,next_access)
    values(m.id,m.user_id,m.canal_id,v_city,tg_op,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
  return new;
end $$;
create trigger audit_municipal_access after insert or update on public.orgao_membro_acessos
  for each row execute function public.audit_municipal_access();

create function public.validate_staff_access(p_access jsonb,p_channel uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_access is null or jsonb_typeof(p_access)<>'object' or p_access->>'atendimento' is null
    or p_access->>'atendimento' not in ('nenhum','leitura','atendente','gestor')
    or jsonb_typeof(p_access->'especialidades_execucao') is distinct from 'array'
    or jsonb_typeof(p_access->'inventario_iluminacao') is distinct from 'boolean' then
    raise exception 'Informe as responsabilidades completas.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_access->'especialidades_execucao') j where j is distinct from '"eletricista"'::jsonb)
    or jsonb_array_length(p_access->'especialidades_execucao')>1 then raise exception 'Especialidade inválida.'; end if;
  if (jsonb_array_length(p_access->'especialidades_execucao')>0 or (p_access->>'inventario_iluminacao')::boolean)
    and not exists(select 1 from public.orgao_categorias oc join public.orgao_canais c on c.id=oc.canal_id
      join public.prefeituras p on p.city_id=c.city_id and p.status='ativa'
      where c.id=p_channel and oc.category_id='iluminacao' and 'iluminacao'=any(p.categorias_habilitadas)) then
    raise exception 'Esta secretaria não está habilitada para iluminação.';
  end if;
end $$;
revoke all on function public.validate_staff_access(jsonb,uuid) from public,anon,authenticated;

create function public.set_municipal_staff_responsibilities(p_member_id uuid,p_access jsonb,p_active boolean,p_modules text[],p_version integer)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.orgao_membros%rowtype; v_city bigint; v_version integer; v_role text;
begin
  select * into m from public.orgao_membros where id=p_member_id for update;
  select city_id into v_city from public.orgao_canais where id=m.canal_id and ativo and not canal_triagem;
  if not coalesce(public.pode_administrar_prefeitura(auth.uid(),v_city),false) then
    raise exception 'Somente o administrador desta prefeitura pode definir os acessos.' using errcode='42501'; end if;
  perform 1 from public.profiles where id=m.user_id and not public.is_admin(id) and not public.is_master(id) for update;
  if not found or p_active is null then raise exception 'Funcionário inválido.'; end if;
  if not exists(select 1 from public.prefeitura_membros pm join public.prefeituras p on p.id=pm.prefeitura_id
    where pm.user_id=m.user_id and pm.ativo and p.city_id=v_city and p.status='ativa') then raise exception 'Vínculo municipal inativo.'; end if;
  perform public.validate_staff_access(p_access,m.canal_id);
  perform public.validate_municipal_asset_modules(p_modules);
  select versao into v_version from public.orgao_membro_acessos where membro_id=m.id for update;
  if p_version is distinct from coalesce(v_version,0) then raise exception 'Os acessos mudaram. Reabra o funcionário.' using errcode='40001'; end if;
  if ('urban_planning'=any(p_modules) and exists(select 1 from public.urban_planner_cities a where a.user_id=m.user_id and a.city_id=v_city and a.municipal_canal_id is distinct from m.canal_id))
    or ('arborization'=any(p_modules) and exists(select 1 from public.tree_manager_cities a where a.user_id=m.user_id and a.city_id=v_city and a.canal_id<>m.canal_id)) then
    raise exception 'O inventário já pertence a outra secretaria. Remova a concessão anterior antes de remanejar.'; end if;
  v_role=case p_access->>'atendimento' when 'gestor' then 'gestor' when 'atendente' then 'operador'
    else case when p_access->'especialidades_execucao' ? 'eletricista' then 'eletricista' else 'leitura' end end;
  update public.orgao_membros set papel=v_role,ativo=p_active,updated_at=now() where id=m.id;
  update public.profiles set user_type='public_official',city_id=coalesce(city_id,v_city) where id=m.user_id;
  delete from public.urban_planner_cities where user_id=m.user_id and city_id=v_city and municipal_canal_id=m.canal_id and not('urban_planning'=any(p_modules));
  delete from public.tree_manager_cities where user_id=m.user_id and city_id=v_city and canal_id=m.canal_id and not('arborization'=any(p_modules));
  perform public.grant_municipal_asset_modules(m.user_id,v_city,m.canal_id,p_modules);
  insert into public.orgao_membro_acessos(membro_id,atendimento,especialidades_execucao,inventario_iluminacao,versao,updated_by)
    values(m.id,p_access->>'atendimento',array(select jsonb_array_elements_text(p_access->'especialidades_execucao')),
      (p_access->>'inventario_iluminacao')::boolean,coalesce(v_version,0)+1,auth.uid())
    on conflict(membro_id) do update set atendimento=excluded.atendimento,especialidades_execucao=excluded.especialidades_execucao,
      inventario_iluminacao=excluded.inventario_iluminacao,versao=excluded.versao,updated_by=auth.uid(),updated_at=now();
  insert into public.municipal_access_audit(membro_id,user_id,canal_id,city_id,operation,previous_access,next_access)
    values(m.id,m.user_id,m.canal_id,v_city,'institutional_access',to_jsonb(m),jsonb_build_object('ativo',p_active,'asset_modules',p_modules));
end $$;
revoke all on function public.set_municipal_staff_responsibilities(uuid,jsonb,boolean,text[],integer) from public,anon;
grant execute on function public.set_municipal_staff_responsibilities(uuid,jsonb,boolean,text[],integer) to authenticated;

create function public.municipal_team_access(p_prefeitura uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select city_id into v_city from public.prefeituras where id=p_prefeitura and status='ativa';
  if not coalesce(public.pode_administrar_prefeitura(auth.uid(),v_city),false) then raise exception 'Sem permissão.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('membro_id',m.id,'access',to_jsonb(a),'asset_modules',array_remove(array[
    case when exists(select 1 from public.urban_planner_cities u where u.user_id=m.user_id and u.city_id=v_city and u.municipal_canal_id=m.canal_id) then 'urban_planning' end,
    case when exists(select 1 from public.tree_manager_cities t where t.user_id=m.user_id and t.city_id=v_city and t.canal_id=m.canal_id) then 'arborization' end],null)))
    from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id left join public.orgao_membro_acessos a on a.membro_id=m.id where c.city_id=v_city),'[]'::jsonb);
end $$;
revoke all on function public.municipal_team_access(uuid) from public,anon;
grant execute on function public.municipal_team_access(uuid) to authenticated;

alter table public.prefeitura_convites add column staff_access jsonb;
update public.prefeitura_convites set staff_access=jsonb_build_object('atendimento',case papel_orgao when 'gestor' then 'gestor' when 'operador' then 'atendente' when 'leitura' then 'leitura' else 'nenhum' end,
  'especialidades_execucao',case when papel_orgao='eletricista' then '["eletricista"]'::jsonb else '[]'::jsonb end,'inventario_iluminacao',false) where canal_id is not null;

create function public.convidar_responsavel_municipal(p_prefeitura uuid,p_canal uuid,p_email text,p_access jsonb,p_modules text[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; v_role text;
begin
  perform public.validate_staff_access(p_access,p_canal);
  v_role=case p_access->>'atendimento' when 'gestor' then 'gestor' when 'atendente' then 'operador'
    else case when p_access->'especialidades_execucao' ? 'eletricista' then 'eletricista' else 'leitura' end end;
  result=public.convidar_funcionario_municipal(p_prefeitura,p_canal,p_email,v_role,p_modules);
  update public.prefeitura_convites set staff_access=p_access where token=(result->>'token')::uuid;
  return result;
end $$;
revoke all on function public.convidar_responsavel_municipal(uuid,uuid,text,jsonb,text[]) from public,anon;
grant execute on function public.convidar_responsavel_municipal(uuid,uuid,text,jsonb,text[]) to authenticated;

alter function public.aceitar_convite_prefeitura(uuid) rename to aceitar_convite_prefeitura_v371;
revoke all on function public.aceitar_convite_prefeitura_v371(uuid) from public,anon,authenticated;
create function public.aceitar_convite_prefeitura(p_token uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare inv public.prefeitura_convites%rowtype; result jsonb; v_member uuid; v_city bigint;
begin
  select * into inv from public.prefeitura_convites where token=p_token for update;
  if inv.canal_id is not null and inv.status='pendente' then
    perform public.validate_staff_access(inv.staff_access,inv.canal_id);
    select city_id into v_city from public.prefeituras where id=inv.prefeitura_id;
    if ('urban_planning'=any(inv.asset_modules) and exists(select 1 from public.urban_planner_cities a where a.user_id=auth.uid() and a.city_id=v_city and a.municipal_canal_id is distinct from inv.canal_id))
      or ('arborization'=any(inv.asset_modules) and exists(select 1 from public.tree_manager_cities a where a.user_id=auth.uid() and a.city_id=v_city and a.canal_id<>inv.canal_id)) then
      raise exception 'Há uma concessão de inventário em outra secretaria. Solicite o remanejamento ao administrador.'; end if;
  end if;
  result=public.aceitar_convite_prefeitura_v371(p_token);
  if inv.status='pendente' and inv.canal_id is not null then
    select id into v_member from public.orgao_membros where canal_id=inv.canal_id and user_id=auth.uid();
    insert into public.orgao_membro_acessos(membro_id,atendimento,especialidades_execucao,inventario_iluminacao,updated_by)
      values(v_member,inv.staff_access->>'atendimento',array(select jsonb_array_elements_text(inv.staff_access->'especialidades_execucao')),
        (inv.staff_access->>'inventario_iluminacao')::boolean,inv.convidado_por)
      on conflict(membro_id) do update set atendimento=excluded.atendimento,especialidades_execucao=excluded.especialidades_execucao,
        inventario_iluminacao=excluded.inventario_iluminacao,versao=orgao_membro_acessos.versao+1,updated_by=excluded.updated_by,updated_at=now();
  end if;
  return result||jsonb_build_object('redirect_to','/prefeitura/visao-geral');
end $$;
revoke all on function public.aceitar_convite_prefeitura(uuid) from public,anon;
grant execute on function public.aceitar_convite_prefeitura(uuid) to authenticated;
-- A versão antiga não permite representar as responsabilidades completas.
revoke execute on function public.set_municipal_staff_access(uuid,text,boolean,text[]) from public,anon,authenticated;
revoke execute on function public.convidar_funcionario_municipal(uuid,uuid,text,text,text[]) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
