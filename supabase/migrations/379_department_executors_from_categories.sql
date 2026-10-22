-- Correção incremental: toda secretaria com categorias pode ter executores.
begin;
create or replace function public.field_executor_can_work(p_user uuid,p_channel uuid,p_specialty text,p_category text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.orgao_membros m join public.orgao_membro_acessos a on a.membro_id=m.id
      join public.orgao_canais c on c.id=m.canal_id where m.user_id=p_user and m.canal_id=p_channel
      and m.ativo and 'executor'=any(a.cargos) and public.tree_management_membership(p_user,c.city_id,c.id)
      and p_user is not null and not public.is_admin(p_user) and not public.is_master(p_user)
      and p_category=any(public.department_execution_categories(p_channel,p_specialty)))
$$;
revoke all on function public.field_executor_can_work(uuid,uuid,text,text) from public,anon;
grant execute on function public.field_executor_can_work(uuid,uuid,text,text) to authenticated;

revoke all on function public.salvar_secretaria_execucao(uuid,bigint,jsonb,text[],text[],text[],jsonb,integer) from public,anon,authenticated;
-- A categoria identifica a especialidade; outras categorias usam o fluxo comum.
create function public.department_execution_scope(p_categories text[],p_modules text[]) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
  select coalesce(jsonb_object_agg(specialty,categories),'{}'::jsonb) from (
    select specialty,jsonb_agg(category order by category) categories from (
      select distinct category,case when category='iluminacao' then 'eletricista'
        when category='poda' and 'arborization'=any(p_modules) then 'arborizacao'
        when category='buracos' and 'urban_planning'=any(p_modules) then 'ruas'
        else 'servicos_gerais' end specialty from unnest(p_categories) category where category is not null
    ) categories group by specialty
  ) grouped
$$;
revoke all on function public.department_execution_scope(text[],text[]) from public,anon,authenticated;
create function public.refresh_department_execution_scope(p_channel uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare scope jsonb;
begin
  select public.department_execution_scope(array(select category_id from public.orgao_categorias where canal_id=c.id),c.municipal_modules)
    into scope from public.orgao_canais c where c.id=p_channel;
  if scope is null then return; end if;
  update public.orgao_canais set execution_categories=scope,execution_specialties=array(select jsonb_object_keys(scope) order by 1)
    where id=p_channel and (execution_categories is distinct from scope or execution_specialties is distinct from array(select jsonb_object_keys(scope) order by 1));
end $$;
revoke all on function public.refresh_department_execution_scope(uuid) from public,anon,authenticated;
create function public.refresh_department_execution_trigger() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_table_name='orgao_canais' then perform public.refresh_department_execution_scope(new.id);
  else
    if tg_op<>'INSERT' then perform public.refresh_department_execution_scope(old.canal_id); end if;
    if tg_op<>'DELETE' then perform public.refresh_department_execution_scope(new.canal_id); end if;
  end if;
  return null;
end $$;
revoke all on function public.refresh_department_execution_trigger() from public,anon,authenticated;
create trigger derive_execution_categories after insert or update or delete on public.orgao_categorias for each row execute function public.refresh_department_execution_trigger();
create trigger derive_execution_modules after update of municipal_modules on public.orgao_canais for each row execute function public.refresh_department_execution_trigger();
select public.refresh_department_execution_scope(id) from public.orgao_canais;
update public.orgao_membro_acessos set cargos=cargos,versao=versao+1;

create function public.salvar_secretaria_execucao(p_id uuid,p_city bigint,p_dados jsonb,p_categorias text[],p_modules text[],p_version integer default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; scope jsonb;
begin
  scope=public.department_execution_scope(p_categorias,p_modules);
  v_id=public.salvar_secretaria_municipal(p_id,p_city,p_dados,p_categorias,p_modules,array(select jsonb_object_keys(scope) order by 1),p_version);
  perform public.refresh_department_execution_scope(v_id);
  insert into public.municipal_access_audit(canal_id,city_id,operation,next_access) values(v_id,p_city,'execution_scope',scope);
  return v_id;
end $$;
revoke all on function public.salvar_secretaria_execucao(uuid,bigint,jsonb,text[],text[],integer) from public,anon;
grant execute on function public.salvar_secretaria_execucao(uuid,bigint,jsonb,text[],text[],integer) to authenticated;

-- O aceite do convite valida o contrato derivado, inclusive fora da iluminação.
create or replace function public.validate_staff_access(p_access jsonb,p_channel uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare roles text[]; expected jsonb;
begin
  if jsonb_typeof(p_access->'cargos') is distinct from 'array' then raise exception 'Atualize o convite para o contrato de cargos.'; end if;
  roles=array(select jsonb_array_elements_text(p_access->'cargos'));
  perform public.validate_staff_roles(roles,p_channel);
  expected=public.derive_department_staff_access(roles,p_channel);
  if expected is null or p_access is distinct from expected then raise exception 'Os acessos do convite mudaram. Gere o convite novamente.'; end if;
end $$;
revoke all on function public.validate_staff_access(jsonb,uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
