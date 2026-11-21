begin;

-- The overview previously resolved historical authorships separately for each
-- counter. Materialize the filtered matters once for the page and all metrics.
create function public.legislative_summary(p_city bigint,p_view text,p_filters jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.legislative_sources;r public.legislative_runs;result jsonb;content jsonb;page integer;begin
  if octet_length(p_filters::text)>4000 then raise exception 'Filtros inválidos.';end if;
  select * into s from public.legislative_sources where city_id=p_city and enabled;
  if s.id is null then return jsonb_build_object('state','unconfigured');end if;
  select * into r from public.legislative_runs where id=s.published_run_id;
  result=jsonb_build_object('state',case when r.id is null then 'pending' else 'ready' end,
    'source',jsonb_build_object('id',s.id,'name',s.name,'url',s.base_url,'first_year',s.first_year,
      'published_at',r.published_at,'collected_at',r.finished_at,'run_id',r.id,
      'stale',r.finished_at<now()-interval '36 hours','method','legislative-1'));
  if r.id is null then return result;end if;
  if p_view='councilor' and not exists(select 1 from public.legislative_identity_links where source_id=s.id and councilor_id::text=p_filters->>'councilor_id') then
    return result||jsonb_build_object('state','unlinked');
  end if;
  page=greatest(1,least(100000,coalesce(nullif(p_filters->>'page','')::integer,1)));
  with matters as materialized(select * from public.legislative_matter_rows(r.id,p_filters)),
    counters as(select count(*) total,
      count(*)filter(where type_data->>'abbreviation' in ('PLO','PLC','PELO','PLSUB','PRE','PRS','PDL')) normative,
      count(*)filter(where type_data->>'abbreviation' in ('PPROV','IND','REQ','REQU')) requests,
      count(*)filter(where annotation->>'topic' is not null) classified,
      count(*)filter(where annotation->>'topic'='homenagem') honorary from matters)
  select jsonb_build_object('total',c.total,'page',page,'page_size',20,
    'matters',coalesce((select jsonb_agg(to_jsonb(q) order by q.data->>'presented_on' desc,q.id desc)
      from(select * from matters order by data->>'presented_on' desc,id desc limit 20 offset (page-1)*20)q),'[]'),
    'metrics',jsonb_build_object('matters',c.total,'normative',c.normative,'requests',c.requests,'classified',c.classified,'honorary',c.honorary),
    'distribution',coalesce((select jsonb_agg(to_jsonb(d) order by d.total desc,d.id) from(
      select type_data->>'name' name,type_data->>'abbreviation' abbreviation,(data->>'type_id')::bigint id,count(*) total
      from matters group by type_data,data->>'type_id')d),'[]'),
    'types',coalesce((select jsonb_agg(jsonb_build_object('id',external_id,'data',payload) order by payload->>'name')
      from public.legislative_records(r.id,'matter_types')),'[]'),
    'councilors',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'parliamentarian_id',l.parliamentarian_id) order by c.name)
      from public.legislative_identity_links l join public.councilors c on c.id=l.councilor_id where l.source_id=s.id),'[]'))
    into content from counters c;
  return result||content;
end $$;
revoke all on function public.legislative_summary(bigint,text,jsonb) from public,anon,authenticated;

-- Existing detail/session views retain their bounded, publication-only contract.
alter function public.legislative_public(bigint,text,jsonb) rename to legislative_public_details;
revoke all on function public.legislative_public_details(bigint,text,jsonb) from public,anon,authenticated,service_role;
create function public.legislative_public(p_city bigint,p_view text default 'overview',p_filters jsonb default '{}') returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select case when p_view in ('overview','councilor') then public.legislative_summary(p_city,p_view,p_filters)
    else public.legislative_public_details(p_city,p_view,p_filters) end
$$;
revoke all on function public.legislative_public(bigint,text,jsonb) from public;
grant execute on function public.legislative_public(bigint,text,jsonb) to anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
