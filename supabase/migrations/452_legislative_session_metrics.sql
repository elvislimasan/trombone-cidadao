begin;

-- Aggregate the entire selected period, independently of the archive's pagination.
create function public.legislative_session_metrics(p_run uuid,p_filters jsonb) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with sessions as materialized(
    select * from public.legislative_records(p_run,'sessions')
    where (not p_filters?'start' or payload->>'date'>=p_filters->>'start')
      and (not p_filters?'end' or payload->>'date'<=p_filters->>'end')
  )
  select jsonb_build_object('total',(select count(*) from sessions),
    'finished',(select count(*) from sessions where payload->>'finished'='true'),
    'minutes',(select count(*) from sessions where nullif(payload->>'minutes_url','') is not null),
    'videos',(select count(*) from sessions where nullif(payload->>'video_url','') is not null),
    'types',coalesce((select jsonb_agg(to_jsonb(t) order by t.total desc,t.label) from(
      select ss.payload->>'type_id' id,coalesce(nullif(st.payload->>'name',''),'Tipo não informado') label,count(*) total
      from sessions ss left join public.legislative_records(p_run,'session_types')st on st.external_id=(ss.payload->>'type_id')::bigint
      group by ss.payload->>'type_id',st.payload->>'name'
    )t),'[]'),
    'months',coalesce((select jsonb_agg(jsonb_build_object('month',m.month_key,'total',m.total) order by m.month_key) from(
      select left(payload->>'date',7) as month_key,count(*) total from sessions where payload->>'date' is not null group by left(payload->>'date',7)
    )m),'[]'))
$$;
revoke all on function public.legislative_session_metrics(uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public.legislative_public(p_city bigint,p_view text default 'overview',p_filters jsonb default '{}') returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with response as materialized(select case when p_view in ('overview','matters','councilor','parliamentarian') then public.legislative_summary(p_city,p_view,p_filters)
    when p_view='recurrences' then public.legislative_recurrences(p_city,p_filters)
    else public.legislative_public_details(p_city,p_view,p_filters) end data),
  enriched as(select case when p_view='sessions' and data->>'state'='ready' then data||jsonb_build_object('session_metrics',public.legislative_session_metrics((data->'source'->>'run_id')::uuid,p_filters)) else data end data from response)
  select case when data?'source' then jsonb_set(data,'{source,method}','"legislative-2"') else data end from enriched
$$;

notify pgrst,'reload schema';
commit;
