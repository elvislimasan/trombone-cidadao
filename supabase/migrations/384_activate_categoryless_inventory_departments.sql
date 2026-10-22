begin;

-- Sem categorias não há envio de solicitações para conferir. Deixe a secretaria
-- disponível para inventários; se categorias forem adicionadas depois, desligue
-- o recebimento para a conferência habitual do endereço.
create or replace function public.salvar_secretaria_execucao(p_id uuid,p_city bigint,p_dados jsonb,p_categorias text[],p_modules text[],p_version integer default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; scope jsonb; v_sem_categorias_antes boolean:=true;
begin
  if p_id is not null then
    select not exists(select 1 from public.orgao_categorias where canal_id=p_id)
      into v_sem_categorias_antes;
  end if;
  scope=public.department_execution_scope(p_categorias,p_modules);
  v_id=public.salvar_secretaria_municipal(p_id,p_city,p_dados,p_categorias,p_modules,array(select jsonb_object_keys(scope) order by 1),p_version);
  perform public.refresh_department_execution_scope(v_id);
  if cardinality(coalesce(p_categorias,'{}'::text[]))=0
    and coalesce(p_modules,'{}'::text[]) && array['urban_planning','arborization']::text[] then
    update public.orgao_canais set ativo=true where id=v_id;
  elsif cardinality(coalesce(p_categorias,'{}'::text[]))=0 then
    update public.orgao_canais set ativo=false where id=v_id;
  elsif v_sem_categorias_antes then
    update public.orgao_canais set ativo=false where id=v_id;
  end if;
  insert into public.municipal_access_audit(canal_id,city_id,operation,next_access) values(v_id,p_city,'execution_scope',scope);
  return v_id;
end $$;
revoke all on function public.salvar_secretaria_execucao(uuid,bigint,jsonb,text[],text[],integer) from public,anon;
grant execute on function public.salvar_secretaria_execucao(uuid,bigint,jsonb,text[],text[],integer) to authenticated;

-- Corrige secretarias sem categorias já cadastradas: elas não recebem broncas
-- e precisam estar ativas para aparecer no convite de responsáveis do inventário.
update public.orgao_canais c set ativo=true,
    ativado_por=coalesce(c.ativado_por,c.criado_por),
    ativado_em=coalesce(c.ativado_em,now())
  where not c.canal_triagem and not c.ativo
    and c.municipal_modules && array['urban_planning','arborization']::text[]
    and (c.ativado_por is not null or c.criado_por is not null)
    and not exists(select 1 from public.orgao_categorias oc where oc.canal_id=c.id);

notify pgrst,'reload schema';
commit;
