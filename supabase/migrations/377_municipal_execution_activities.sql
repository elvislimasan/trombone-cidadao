-- Secretaria escolhe atividade, mapa e categorias; funcionários recebem cargos.
begin;
alter table public.orgao_canais drop constraint department_execution_valid;
alter table public.orgao_canais add constraint department_execution_valid check(
  execution_specialties <@ array['eletricista','arborizacao','ruas','servicos_gerais']::text[] and array_position(execution_specialties,null) is null);
alter table public.orgao_canais add column execution_categories jsonb not null default '{}' check(jsonb_typeof(execution_categories)='object');
update public.orgao_canais set execution_categories=jsonb_build_object('eletricista',array['iluminacao']) where 'eletricista'=any(execution_specialties);
alter table public.orgao_membro_acessos drop constraint orgao_membro_acessos_especialidades_execucao_check;
alter table public.orgao_membro_acessos add constraint staff_execution_specialties_valid check(
  especialidades_execucao <@ array['eletricista','arborizacao','ruas','servicos_gerais']::text[] and array_position(especialidades_execucao,null) is null);

create function public.department_execution_categories(p_channel uuid,p_specialty text) returns text[]
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(array_agg(distinct oc.category_id),'{}'::text[]) from public.orgao_canais c
    join public.prefeituras p on p.city_id=c.city_id and p.status='ativa'
    join public.orgao_categorias oc on oc.canal_id=c.id and oc.category_id=any(p.categorias_habilitadas)
    where c.id=p_channel and p_specialty=any(c.execution_specialties)
      and coalesce(c.execution_categories->p_specialty ? oc.category_id,false)
      and case p_specialty when 'eletricista' then oc.category_id='iluminacao'
        when 'arborizacao' then 'arborization'=any(c.municipal_modules) and oc.category_id<>'iluminacao'
        when 'ruas' then 'urban_planning'=any(c.municipal_modules) and oc.category_id<>'iluminacao'
        when 'servicos_gerais' then oc.category_id<>'iluminacao' else false end
$$;
revoke all on function public.department_execution_categories(uuid,text) from public,anon,authenticated;

create or replace function public.derive_department_staff_access(p_roles text[],p_channel uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('cargos',coalesce(p_roles,'{}'),
    'atendimento',case when exists(select 1 from public.orgao_categorias oc where oc.canal_id=c.id and oc.category_id=any(p.categorias_habilitadas)) then
      case when 'gestor'=any(p_roles) then 'gestor' when 'atendente'=any(p_roles) then 'atendente' when 'leitura'=any(p_roles) then 'leitura' else 'nenhum' end else 'nenhum' end,
    'especialidades_execucao',case when 'executor'=any(p_roles) then array(select s from unnest(c.execution_specialties) s where cardinality(public.department_execution_categories(c.id,s))>0) else '{}'::text[] end,
    'inventario_iluminacao',coalesce(p_roles && array['gestor','inventario'] and 'lighting'=any(c.municipal_modules) and 'iluminacao'=any(p.categorias_habilitadas),false))
  from public.orgao_canais c join public.prefeituras p on p.city_id=c.city_id where c.id=p_channel
$$;

create function public.field_executor_can_work(p_user uuid,p_channel uuid,p_specialty text,p_category text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select p_user is not null and not public.is_admin(p_user) and not public.is_master(p_user)
    and p_category=any(public.department_execution_categories(p_channel,p_specialty))
    and exists(select 1 from public.orgao_membros m join public.orgao_membro_acessos a on a.membro_id=m.id
      join public.orgao_canais c on c.id=m.canal_id where m.user_id=p_user and m.canal_id=p_channel
      and m.ativo and 'executor'=any(a.cargos) and public.tree_management_membership(p_user,c.city_id,c.id))
$$;
revoke all on function public.field_executor_can_work(uuid,uuid,text,text) from public,anon;
grant execute on function public.field_executor_can_work(uuid,uuid,text,text) to authenticated;

-- O contrato anterior continua privado e é chamado apenas pelo salvamento novo.
do $migration$
declare definition text;
begin
  definition=pg_get_functiondef('public.salvar_secretaria_municipal(uuid,bigint,jsonb,text[],text[],text[],integer)'::regprocedure);
  if position('array[''eletricista'']::text[]' in definition)=0 then raise exception 'Contrato inesperado de secretaria'; end if;
  execute replace(definition,'array[''eletricista'']::text[]','array[''eletricista'',''arborizacao'',''ruas'',''servicos_gerais'']::text[]');
end $migration$;
revoke all on function public.salvar_secretaria_municipal(uuid,bigint,jsonb,text[],text[],text[],integer) from public,anon,authenticated;
create function public.salvar_secretaria_execucao(p_id uuid,p_city bigint,p_dados jsonb,p_categorias text[],p_modules text[],p_execution text[],p_execution_categories jsonb,p_version integer default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; specialty text; categories jsonb;
begin
  if not coalesce(public.pode_administrar_prefeitura(auth.uid(),p_city),false) then raise exception 'Sem acesso a esta prefeitura.' using errcode='42501'; end if;
  if p_execution_categories is null or jsonb_typeof(p_execution_categories)<>'object' then raise exception 'Informe as categorias de cada atividade.'; end if;
  if exists(select 1 from jsonb_object_keys(p_execution_categories) k where not(k=any(p_execution))) then raise exception 'Categoria associada a uma atividade desabilitada.'; end if;
  foreach specialty in array p_execution loop
    categories=p_execution_categories->specialty;
    if categories is null or jsonb_typeof(categories)<>'array' or jsonb_array_length(categories)=0 then raise exception 'Selecione categorias para cada atividade.'; end if;
    if exists(select 1 from jsonb_array_elements(categories) item where jsonb_typeof(item)<>'string' or not((item#>>'{}')=any(p_categorias))) then raise exception 'Atividade fora das categorias da secretaria.'; end if;
    if specialty='eletricista' and categories<>'["iluminacao"]'::jsonb then raise exception 'Eletricista atende somente iluminação.'; end if;
    if specialty<>'eletricista' and categories ? 'iluminacao' then raise exception 'Iluminação exige a atividade de eletricista.'; end if;
    if specialty='arborizacao' and not('arborization'=any(p_modules)) then raise exception 'Habilite o mapa de arborização.'; end if;
    if specialty='ruas' and not('urban_planning'=any(p_modules)) then raise exception 'Habilite o mapa de ruas.'; end if;
    if exists(select 1 from jsonb_each(p_execution_categories) e cross join lateral jsonb_array_elements_text(e.value) item(category) where e.key<>specialty and categories ? item.category) then raise exception 'Cada categoria deve ter uma única atividade de execução na secretaria.'; end if;
  end loop;
  v_id=public.salvar_secretaria_municipal(p_id,p_city,p_dados,p_categorias,p_modules,p_execution,p_version);
  update public.orgao_canais set execution_categories=p_execution_categories where id=v_id;
  insert into public.municipal_access_audit(canal_id,city_id,operation,next_access) values(v_id,p_city,'execution_scope',p_execution_categories);
  return v_id;
end $$;
revoke all on function public.salvar_secretaria_execucao(uuid,bigint,jsonb,text[],text[],text[],jsonb,integer) from public,anon;
grant execute on function public.salvar_secretaria_execucao(uuid,bigint,jsonb,text[],text[],text[],jsonb,integer) to authenticated;
create trigger refresh_department_execution_categories after update of execution_categories on public.orgao_canais for each row execute function public.refresh_department_staff();
update public.orgao_membro_acessos set cargos=cargos,versao=versao+1;

-- O frontend obtém as atividades e suas categorias do servidor, sem inferência
-- pelo nome da secretaria ou concessão de atendimento ao executor.
create function public.municipal_execution_workspace() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with base as(select public.municipal_workspace_access() value)
  select base.value||jsonb_build_object('execution_contract',1,
    'channels',coalesce((select jsonb_agg(j||jsonb_build_object('execution_categories',c.execution_categories)) from jsonb_array_elements(base.value->'channels') j join public.orgao_canais c on c.id=(j->>'id')::uuid),'[]'::jsonb),
    'execution_activities',coalesce((select jsonb_agg(jsonb_build_object('canal_id',m.canal_id,'city_id',c.city_id,'specialty',s,
      'category_ids',public.department_execution_categories(c.id,s)))
      from public.orgao_membros m join public.orgao_canais c on c.id=m.canal_id cross join lateral unnest(c.execution_specialties) s
      where m.user_id=auth.uid() and m.ativo and exists(select 1 from unnest(public.department_execution_categories(c.id,s)) cat where public.field_executor_can_work(auth.uid(),c.id,s,cat))),'[]'::jsonb),
    'execution_team',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'canal_id',m.canal_id,
      'especialidades_execucao',public.derive_department_staff_access(a.cargos,c.id)->'especialidades_execucao'))
      from public.orgao_membros m join public.orgao_membro_acessos a on a.membro_id=m.id join public.orgao_canais c on c.id=m.canal_id
      where m.ativo and public.municipal_channel_action(auth.uid(),c.id,'dispatch') and 'executor'=any(a.cargos)),'[]'::jsonb)) from base
$$;
revoke all on function public.municipal_execution_workspace() from public,anon;
grant execute on function public.municipal_execution_workspace() to authenticated;
notify pgrst,'reload schema';
commit;
