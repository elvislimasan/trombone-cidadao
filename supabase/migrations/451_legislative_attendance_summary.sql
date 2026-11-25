begin;

-- Counts are published evidence, never total sessions minus registered presences.
create function public.legislative_attendance(p_city bigint,p_start date,p_end date,p_person bigint default null,p_councilor uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.legislative_sources;run uuid;person bigint:=p_person;
  presence_complete boolean;absence_complete boolean;result jsonb;
begin
  if p_start is null or p_end is null or p_end<p_start then raise exception 'Período inválido.';end if;
  select * into s from public.legislative_sources where city_id=p_city and enabled;
  if s.id is null then return jsonb_build_object('state','unconfigured');end if;
  run=s.published_run_id;
  if run is null then return jsonb_build_object('state','pending');end if;
  if p_councilor is not null then
    select parliamentarian_id into person from public.legislative_identity_links where source_id=s.id and councilor_id=p_councilor and (p_person is null or parliamentarian_id=p_person);
    if person is null then return jsonb_build_object('state','unlinked');end if;
  end if;
  select exists(select 1 from public.legislative_jobs where run_id=run and kind='attendance' and status='done')
    and not exists(select 1 from public.legislative_jobs where run_id=run and kind='attendance' and status<>'done') into presence_complete;
  select exists(select 1 from public.legislative_jobs where run_id=run and kind='absence_justifications' and status='done')
    and not exists(select 1 from public.legislative_jobs where run_id=run and kind='absence_justifications' and status<>'done') into absence_complete;
  with sessions as materialized(
    select * from public.legislative_records(run,'sessions') where (payload->>'date')::date between p_start and p_end
  ), presences as materialized(
    select distinct (a.payload->>'parliamentarian_id')::bigint person_id,ss.external_id session_id
    from public.legislative_records(run,'attendance')a join sessions ss on ss.external_id=(a.payload->>'session_id')::bigint
  ), justified as materialized(
    select distinct (a.payload->>'parliamentarian_id')::bigint person_id,ss.external_id session_id
    from public.legislative_records(run,'absence_justifications')a join sessions ss on ss.external_id=(a.payload->>'session_id')::bigint
    where a.payload->>'scope'='session'
  ), members as materialized(
    select p.external_id id,p.payload->>'name' full_name,coalesce(nullif(p.payload->>'parliamentary_name',''),p.payload->>'name') name,
      p.payload->>'photo_url' photo_url,p.source_url
    from public.legislative_records(run,'parliamentarians')p
    where (person is null or p.external_id=person) and (
      person is not null or exists(select 1 from presences a where a.person_id=p.external_id)
      or exists(select 1 from justified a where a.person_id=p.external_id)
      or exists(select 1 from public.legislative_records(run,'mandates')m where (m.payload->>'parliamentarian_id')::bigint=p.external_id
        and m.payload->>'started_on' is not null and (m.payload->>'started_on')::date<=p_end
        and (m.payload->>'ended_on' is null or (m.payload->>'ended_on')::date>=p_start))
      or (p.payload->>'active'='true' and not exists(select 1 from public.legislative_records(run,'mandates')m where (m.payload->>'parliamentarian_id')::bigint=p.external_id and m.payload->>'started_on' is not null))
    )
  ), counts as materialized(
    select m.*,
      case when presence_complete then (select count(*) from presences a where a.person_id=m.id) end presences,
      case when absence_complete then (select count(*) from justified j where j.person_id=m.id and not exists(select 1 from presences a where a.person_id=j.person_id and a.session_id=j.session_id)) end justified,
      null::bigint unexcused,
      (select count(*) from justified j join presences a using(person_id,session_id) where j.person_id=m.id) conflicts
    from members m
  )
  select jsonb_build_object('state','ready','run_id',run,'period',jsonb_build_object('start',p_start,'end',p_end),
    'collected_at',s.last_success_at,'presence_complete',presence_complete,'absence_complete',absence_complete,
    'sessions',(select count(*) from sessions),'people',coalesce((select jsonb_agg(to_jsonb(c) order by c.name,c.id) from counts c),'[]'),
    'totals',jsonb_build_object('presences',case when presence_complete then coalesce((select sum(presences) from counts),0) end,
      'justified',case when absence_complete then coalesce((select sum(justified) from counts),0) end,'unexcused',null,
      'conflicts',coalesce((select sum(conflicts) from counts),0)),
    'legislature_ids',coalesce((select jsonb_agg(id) from(select distinct (payload->>'legislature_id')::bigint id from sessions where payload->>'legislature_id' is not null)x),'[]')) into result;
  return result;
end $$;
revoke all on function public.legislative_attendance(bigint,date,date,bigint,uuid) from public;
grant execute on function public.legislative_attendance(bigint,date,date,bigint,uuid) to anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
