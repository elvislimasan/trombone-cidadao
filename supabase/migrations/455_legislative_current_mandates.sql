begin;

-- A registration marked active is not evidence of a mandate in the current period.
create function public.legislative_directory_membership(p_run uuid,p_directory jsonb,p_on date)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with legislatures as materialized(
    select * from public.legislative_records(p_run,'legislatures')
    where (payload->>'started_on')::date<=p_on and (payload->>'ended_on')::date>=p_on
  ), coverage as (
    select (select count(*)=1 from legislatures) and not exists(
      select 1 from unnest(array['legislatures','mandates']) required(kind)
      where not exists(select 1 from public.legislative_jobs j where j.run_id=p_run and j.kind=required.kind and j.status='done')
        or exists(select 1 from public.legislative_jobs j where j.run_id=p_run and j.kind=required.kind and j.status<>'done')
    ) complete
  ), people as (
    select person.value||jsonb_build_object('current_mandate',case when c.complete then
      coalesce((person.value->'data'->>'active')::boolean,false) and exists(
        select 1 from public.legislative_records(p_run,'mandates')m join legislatures l on l.external_id=(m.payload->>'legislature_id')::bigint
        where m.payload->>'parliamentarian_id'=person.value->>'id'
          and coalesce((m.payload->>'started_on')::date,(l.payload->>'started_on')::date)<=p_on
          and coalesce((m.payload->>'ended_on')::date,(l.payload->>'ended_on')::date)>=p_on
      ) else null end) value,person.ordinality
    from jsonb_array_elements(coalesce(p_directory->'parliamentarians','[]')) with ordinality person cross join coverage c
  )
  select p_directory||jsonb_build_object('membership',jsonb_build_object('complete',c.complete,'as_of',p_on,
    'legislature',case when c.complete then (select jsonb_build_object('id',external_id,'number',payload->'number','start',payload->'started_on','end',payload->'ended_on') from legislatures) end),
    'parliamentarians',coalesce((select jsonb_agg(value order by ordinality) from people),'[]')) from coverage c
$$;
revoke all on function public.legislative_directory_membership(uuid,jsonb,date) from public,anon,authenticated,service_role;

alter function public.legislative_public(bigint,text,jsonb) rename to legislative_public_without_membership;
revoke all on function public.legislative_public_without_membership(bigint,text,jsonb) from public,anon,authenticated,service_role;
create function public.legislative_public(p_city bigint,p_view text default 'overview',p_filters jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;run uuid;
begin
  result=public.legislative_public_without_membership(p_city,p_view,p_filters);
  if p_view='directory' and result->>'state'='ready' then
    select published_run_id into run from public.legislative_sources where city_id=p_city and enabled;
    return public.legislative_directory_membership(run,result,(now() at time zone 'America/Fortaleza')::date);
  end if;
  return result;
end $$;
revoke all on function public.legislative_public(bigint,text,jsonb) from public;
grant execute on function public.legislative_public(bigint,text,jsonb) to anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
