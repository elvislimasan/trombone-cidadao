begin;

create function public.legislative_vote_context(p_run uuid,p_activity jsonb) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with items as materialized(select value,ordinality from jsonb_array_elements(coalesce(p_activity->'votes'->'items','[]')) with ordinality),
  linked as materialized(
    select i.*,coalesce((i.value->>'matter_id')::bigint,(b.payload->>'matter_id')::bigint,(a.payload->>'matter_id')::bigint,(e.payload->>'matter_id')::bigint) matter_id
    from items i left join public.legislative_records(p_run,'votes')v on v.external_id=(i.value->>'id')::bigint
    left join public.legislative_records(p_run,'ballots')b on b.external_id=(v.payload->>'ballot_id')::bigint
    left join public.legislative_records(p_run,'agenda')a on a.external_id=(b.payload->>'agenda_id')::bigint
    left join public.legislative_records(p_run,'expedient')e on e.external_id=(b.payload->>'expedient_id')::bigint
  )
  select jsonb_set(p_activity,'{votes,items}',coalesce((select jsonb_agg(l.value||jsonb_build_object('matter_id',l.matter_id,
    'matter',case when m.external_id is not null then jsonb_build_object('id',m.external_id,'number',m.payload->'number','year',m.payload->'year','summary',m.payload->>'summary',
      'type_name',t.payload->>'name','type_abbreviation',t.payload->>'abbreviation','source_url',m.source_url) end,
    'matter_url',case when l.matter_id is not null then 'https://sapl.floresta.pe.leg.br/materia/'||l.matter_id::text end) order by l.ordinality)
    from linked l left join public.legislative_records(p_run,'matters')m on m.external_id=l.matter_id
    left join public.legislative_records(p_run,'matter_types')t on t.external_id=(m.payload->>'type_id')::bigint),'[]'))
$$;
revoke all on function public.legislative_vote_context(uuid,jsonb) from public,anon,authenticated,service_role;

alter function public.legislative_activity(bigint,uuid,date,date) rename to legislative_activity_without_context;
revoke all on function public.legislative_activity_without_context(bigint,uuid,date,date) from public,anon,authenticated,service_role;
create function public.legislative_activity(p_city bigint,p_councilor uuid,p_start date,p_end date) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with activity as materialized(select public.legislative_activity_without_context(p_city,p_councilor,p_start,p_end) data)
  select case when data->>'state'='ready' then public.legislative_vote_context((select published_run_id from public.legislative_sources where city_id=p_city and enabled),data) else data end from activity
$$;
revoke all on function public.legislative_activity(bigint,uuid,date,date) from public;
grant execute on function public.legislative_activity(bigint,uuid,date,date) to anon,authenticated,service_role;

alter function public.legislative_parliamentarian_activity(bigint,bigint,date,date) rename to legislative_parliamentarian_activity_without_context;
revoke all on function public.legislative_parliamentarian_activity_without_context(bigint,bigint,date,date) from public,anon,authenticated,service_role;
create function public.legislative_parliamentarian_activity(p_city bigint,p_person bigint,p_start date,p_end date) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with activity as materialized(select public.legislative_parliamentarian_activity_without_context(p_city,p_person,p_start,p_end) data)
  select case when data->>'state'='ready' then public.legislative_vote_context((select published_run_id from public.legislative_sources where city_id=p_city and enabled),data) else data end from activity
$$;
revoke all on function public.legislative_parliamentarian_activity(bigint,bigint,date,date) from public;
grant execute on function public.legislative_parliamentarian_activity(bigint,bigint,date,date) to anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
