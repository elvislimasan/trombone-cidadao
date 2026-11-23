begin;

-- Aggregates over the published period, never over the 50-item activity preview.
create function public.legislative_profile_highlights(p_city bigint,p_start date,p_end date,p_person bigint default null,p_councilor uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.legislative_sources; person bigint:=p_person; run uuid; result jsonb; complete boolean;
begin
  if p_start is null or p_end is null or p_end<p_start then raise exception 'Período inválido.'; end if;
  select * into s from public.legislative_sources where city_id=p_city and enabled;
  if s.id is null then return jsonb_build_object('state','unconfigured'); end if;
  run=s.published_run_id;
  if run is null then return jsonb_build_object('state','pending'); end if;
  if p_councilor is not null then
    select parliamentarian_id into person from public.legislative_identity_links where source_id=s.id and councilor_id=p_councilor and (p_person is null or parliamentarian_id=p_person);
    if person is null then return jsonb_build_object('state','unlinked'); end if;
  end if;
  if person is null or not exists(select 1 from public.legislative_records(run,'parliamentarians') where external_id=person) then return jsonb_build_object('state','missing'); end if;
  select not exists(select 1 from unnest(array['votes','ballots','agenda','expedient','sessions']) required(kind)
    where not exists(select 1 from public.legislative_jobs j where j.run_id=run and j.kind=required.kind and j.status='done')
    or exists(select 1 from public.legislative_jobs j where j.run_id=run and j.kind=required.kind and j.status<>'done')) into complete;
  with sessions as materialized(select * from public.legislative_records(run,'sessions') where (payload->>'date')::date between p_start and least(p_end,current_date)),
    choices as materialized(
      select v.external_id,lower(trim(v.payload->>'choice')) choice
      from public.legislative_records(run,'votes')v
      join public.legislative_records(run,'ballots')b on b.external_id=(v.payload->>'ballot_id')::bigint
      left join public.legislative_records(run,'agenda')a on a.external_id=(b.payload->>'agenda_id')::bigint
      left join public.legislative_records(run,'expedient')e on e.external_id=(b.payload->>'expedient_id')::bigint
      join sessions ss on ss.external_id=coalesce((a.payload->>'session_id')::bigint,(e.payload->>'session_id')::bigint)
      where (v.payload->>'parliamentarian_id')::bigint=person
    )
    select jsonb_build_object('state','ready','votes_complete',complete,'votes',case when complete then jsonb_build_object(
      'total',count(*),'yes',count(*) filter(where choice='sim'),'no',count(*) filter(where choice in ('não','nao')),
      'abstentions',count(*) filter(where choice in ('abstenção','abstencao')),
      'other',count(*) filter(where choice is null or choice not in ('sim','não','nao','abstenção','abstencao'))) end,
      'party',(select jsonb_build_object('name',p.payload->>'name','abbreviation',p.payload->>'abbreviation','source_url',a.source_url)
        from public.legislative_records(run,'affiliations')a join public.legislative_records(run,'parties')p on p.external_id=(a.payload->>'party_id')::bigint
        where (a.payload->>'parliamentarian_id')::bigint=person and a.payload->>'started_on' is not null
        and (a.payload->>'started_on')::date<=least(p_end,current_date)
        and (a.payload->>'ended_on' is null or (a.payload->>'ended_on')::date>=least(p_end,current_date))
        order by (a.payload->>'started_on')::date desc,a.external_id desc limit 1)) into result from choices;
  return result;
end $$;
revoke all on function public.legislative_profile_highlights(bigint,date,date,bigint,uuid) from public;
grant execute on function public.legislative_profile_highlights(bigint,date,date,bigint,uuid) to anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
