begin;

-- Solicitações internas da própria prefeitura podem entrar em ordens, sem torná-las públicas.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)'::regprocedure);
  if position($old$coalesce(q.moderation_status,'approved')='approved'$old$ in definition)=0 then
    raise exception 'Definição inesperada de salvar_demanda_municipal'; end if;
  definition := replace(definition,
    $old$coalesce(q.moderation_status,'approved')='approved'$old$,
    $new$(coalesce(q.moderation_status,'approved')='approved' or
      (q.created_by_municipality=p_prefeitura and q.moderation_status='internal'))$new$);
  execute definition;
end $migration$;

create or replace function public.buscar_broncas_para_demanda(p_prefeitura uuid,p_busca text)
returns table(id uuid,title text,address text,neighborhood text,status text,category_id text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select city_id into v_city from public.prefeituras where prefeituras.id=p_prefeitura;
  if not public.pode_acessar_prefeitura(auth.uid(),v_city) then raise exception 'Sem acesso a esta prefeitura'; end if;
  return query select r.id,r.title,r.address,r.neighborhood,r.status,r.category_id from public.reports r
  where r.city_id=v_city and (coalesce(r.moderation_status,'approved')='approved'
    or (r.created_by_municipality=p_prefeitura and r.moderation_status='internal'))
    and not coalesce(r.is_petition,false)
    and r.status not in ('duplicate','resolved') and not exists(select 1 from public.demanda_broncas b where b.report_id=r.id)
    and concat_ws(' ',r.title,r.address,r.neighborhood,r.pole_number) ilike '%'||replace(replace(left(btrim(p_busca),120),'%','\%'),'_','\_')||'%'
  order by r.created_at desc,r.id limit 20;
end $$;

create or replace function public.vinculos_broncas_prefeitura(p_prefeitura uuid,p_reports uuid[])
returns table(report_id uuid,demanda_id uuid,protocolo text,status text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_city bigint;
begin
  select city_id into v_city from public.prefeituras where id=p_prefeitura;
  if not public.pode_acessar_prefeitura(auth.uid(),v_city) then raise exception 'Sem acesso a esta prefeitura'; end if;
  if cardinality(p_reports)>1000 then raise exception 'Consulte no máximo 1000 solicitações por vez'; end if;
  return query select b.report_id,case when public.pode_ver_demanda(auth.uid(),d.id) then d.id end,d.protocolo,d.status
  from public.demanda_broncas b join public.demandas_municipais d on d.id=b.demanda_id
  join public.reports r on r.id=b.report_id
  where d.prefeitura_id=p_prefeitura and b.report_id=any(p_reports)
    and (coalesce(r.moderation_status,'approved')='approved'
      or (r.created_by_municipality=p_prefeitura and r.moderation_status='internal'));
end $$;
revoke all on function public.buscar_broncas_para_demanda(uuid,text),public.vinculos_broncas_prefeitura(uuid,uuid[]) from public,anon;
grant execute on function public.buscar_broncas_para_demanda(uuid,text),public.vinculos_broncas_prefeitura(uuid,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
