begin;

-- Resolve authors once per query, rather than rescanning the historical authorship
-- table for every person on every matter. Parent joins scope ignored SAPL filters.
create or replace function public.legislative_matter_rows(p_run uuid,p_filters jsonb default '{}')
returns table(id bigint,data jsonb,source_url text,hash text,type_data jsonb,annotation jsonb,authors jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
  with matters as materialized(select * from public.legislative_records(p_run,'matters')),
  author_records as materialized(select * from public.legislative_records(p_run,'authors')),
  edges as materialized(
    select m.external_id matter_id,a::bigint author_id from matters m cross join lateral jsonb_array_elements_text(m.payload->'author_ids') a
    union select (au.payload->>'matter_id')::bigint,(au.payload->>'author_id')::bigint
      from public.legislative_records(p_run,'authorships')au join matters m on m.external_id=(au.payload->>'matter_id')::bigint
  ),
  author_groups as materialized(
    select e.matter_id,jsonb_agg(distinct jsonb_build_object('id',a.external_id,'name',a.payload->>'name',
      'parliamentarian_id',a.payload->'parliamentarian_id','councilor_id',l.councilor_id,'slug',c.slug)) authors
    from edges e join author_records a on a.external_id=e.author_id join public.legislative_runs r on r.id=p_run
    left join public.legislative_identity_links l on l.source_id=r.source_id and l.parliamentarian_id=(a.payload->>'parliamentarian_id')::bigint
    left join public.councilors c on c.id=l.councilor_id group by e.matter_id
  )
  select m.external_id,m.payload,m.source_url,m.hash,t.payload,
    case when an.version_hash=m.hash then to_jsonb(an)-'reviewed_by' else null end,coalesce(ag.authors,'[]')
  from matters m join public.legislative_runs r on r.id=p_run
  join public.legislative_records(p_run,'matter_types') t on t.external_id=(m.payload->>'type_id')::bigint
  left join author_groups ag on ag.matter_id=m.external_id
  left join public.legislative_annotations an on an.source_id=r.source_id and an.matter_id=m.external_id
  where (not p_filters?'start' or m.payload->>'presented_on'>=p_filters->>'start')
    and (not p_filters?'end' or m.payload->>'presented_on'<=p_filters->>'end')
    and (coalesce(p_filters->>'search','')='' or m.payload->>'summary' ilike '%'||replace(replace(replace(left(p_filters->>'search',200),'\','\\'),'%','\%'),'_','\_')||'%'
      or concat(m.payload->>'number','/',m.payload->>'year')=p_filters->>'search')
    and (nullif(p_filters->>'type_id','') is null or m.payload->>'type_id'=p_filters->>'type_id')
    and (nullif(p_filters->>'topic','') is null or an.version_hash=m.hash and an.topic=p_filters->>'topic')
    and (nullif(p_filters->>'location','') is null or an.version_hash=m.hash and an.location_key=p_filters->>'location')
    and (nullif(p_filters->>'councilor_id','') is null or exists(select 1 from jsonb_array_elements(ag.authors)a where a->>'councilor_id'=p_filters->>'councilor_id'))
$$;
revoke all on function public.legislative_matter_rows(uuid,jsonb) from public,anon,authenticated;

create function public.legislative_activity(p_city bigint,p_councilor uuid,p_start date,p_end date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.legislative_sources;parliamentarian bigint;run uuid;votes jsonb;presence jsonb;ord_presence jsonb;result jsonb;begin
  if p_start is null or p_end is null or p_end<p_start then raise exception 'Período inválido.';end if;
  select * into s from public.legislative_sources where city_id=p_city and enabled;
  if s.id is null then return jsonb_build_object('state','unconfigured');end if;
  run=s.published_run_id;
  if run is null then return jsonb_build_object('state','pending');end if;
  select parliamentarian_id into parliamentarian from public.legislative_identity_links where source_id=s.id and councilor_id=p_councilor;
  if parliamentarian is null then return jsonb_build_object('state','unlinked');end if;
  with a as materialized(select * from public.legislative_records(run,'agenda')),
    e as materialized(select * from public.legislative_records(run,'expedient')),
    sessions as materialized(select * from public.legislative_records(run,'sessions') where (payload->>'date')::date between p_start and p_end),
    ballots as materialized(select * from public.legislative_records(run,'ballots')),
    selected as (
      select v.external_id id,v.payload->>'choice' choice,v.source_url,b.payload->'matter_id' matter_id,ss.external_id session_id,ss.payload->>'date' date
      from public.legislative_records(run,'votes')v join ballots b on b.external_id=(v.payload->>'ballot_id')::bigint
      left join a on a.external_id=(b.payload->>'agenda_id')::bigint left join e on e.external_id=(b.payload->>'expedient_id')::bigint
      join sessions ss on ss.external_id=coalesce((a.payload->>'session_id')::bigint,(e.payload->>'session_id')::bigint)
      where (v.payload->>'parliamentarian_id')::bigint=parliamentarian
    )
    select jsonb_build_object('total',(select count(*)from selected),'items',coalesce((select jsonb_agg(to_jsonb(q) order by q.date desc,q.id desc)from(select * from selected order by date desc,id desc limit 50)q),'[]')) into votes;
  with sessions as materialized(select * from public.legislative_records(run,'sessions') where (payload->>'date')::date between p_start and p_end),
    selected as(select distinct on(ss.external_id) ss.external_id session_id,ss.payload->>'date' date,ss.payload->>'label' label,a.source_url
      from public.legislative_records(run,'attendance')a join sessions ss on ss.external_id=(a.payload->>'session_id')::bigint
      where (a.payload->>'parliamentarian_id')::bigint=parliamentarian order by ss.external_id,a.external_id)
    select jsonb_build_object('total',(select count(*)from selected),'items',coalesce((select jsonb_agg(to_jsonb(q) order by q.date desc,q.session_id desc)from(select * from selected order by date desc,session_id desc limit 50)q),'[]')) into presence;
  select jsonb_build_object('total',count(distinct ss.external_id)) into ord_presence
    from public.legislative_records(run,'agenda_attendance')a join public.legislative_records(run,'sessions')ss on ss.external_id=(a.payload->>'session_id')::bigint
    where (a.payload->>'parliamentarian_id')::bigint=parliamentarian and (ss.payload->>'date')::date between p_start and p_end;
  return jsonb_build_object('state','ready','votes',votes,'attendance',presence,'agenda_attendance',ord_presence,
    'terms',coalesce((select jsonb_agg(jsonb_build_object('data',payload,'source_url',source_url)) from public.legislative_records(run,'mandates')where (payload->>'parliamentarian_id')::bigint=parliamentarian),'[]'));
end $$;
revoke all on function public.legislative_activity(bigint,uuid,date,date) from public;
grant execute on function public.legislative_activity(bigint,uuid,date,date) to anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
