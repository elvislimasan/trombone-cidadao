begin;

create or replace function public.legislative_summary(p_city bigint,p_view text,p_filters jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.legislative_sources;r public.legislative_runs;result jsonb;content jsonb;page integer;person jsonb;begin
  if octet_length(p_filters::text)>4000 then raise exception 'Filtros inválidos.';end if;
  select * into s from public.legislative_sources where city_id=p_city and enabled;
  if s.id is null then return jsonb_build_object('state','unconfigured');end if;
  select * into r from public.legislative_runs where id=s.published_run_id;
  result=jsonb_build_object('state',case when r.id is null then 'pending' else 'ready' end,
    'source',jsonb_build_object('id',s.id,'name',s.name,'url',s.base_url,'first_year',s.first_year,
      'published_at',r.published_at,'collected_at',r.finished_at,'run_id',r.id,
      'stale',r.finished_at<now()-interval '36 hours','method','legislative-2'));
  if r.id is null then return result;end if;
  if p_view='councilor' and not exists(select 1 from public.legislative_identity_links where source_id=s.id and councilor_id::text=p_filters->>'councilor_id') then
    return result||jsonb_build_object('state','unlinked');
  end if;
  if p_view in ('parliamentarian','councilor') then
    select jsonb_build_object('id',p.external_id,'data',p.payload,'source_url',p.source_url,
      'author_ids',(select coalesce(jsonb_agg(a.external_id),'[]') from public.legislative_records(r.id,'authors')a where a.payload->>'parliamentarian_id'=p.external_id::text),
      'councilor',case when c.id is not null then jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name) end)
      into person from public.legislative_records(r.id,'parliamentarians')p
      left join public.legislative_identity_links l on l.source_id=s.id and l.parliamentarian_id=p.external_id
      left join public.councilors c on c.id=l.councilor_id where
        p_view='parliamentarian' and p.external_id::text=p_filters->>'parliamentarian_id'
        or p_view='councilor' and l.councilor_id::text=p_filters->>'councilor_id';
    if person is null then return jsonb_build_object('state','missing');end if;
    result=result||jsonb_build_object('parliamentarian',person);
  end if;
  page=greatest(1,least(100000,coalesce(nullif(p_filters->>'page','')::integer,1)));
  with matters as materialized(select * from public.legislative_matter_rows(r.id,p_filters)),
    counters as(select count(*) total,
      count(*)filter(where type_data->>'abbreviation' in ('PLO','PLC','PELO','PLSUB','PRE','PRS','PDL')) normative,
      count(*)filter(where type_data->>'abbreviation' in ('PPROV','IND','REQ','REQU')) requests,
      count(*)filter(where annotation->>'topic' is not null) classified,
      count(*)filter(where data->>'group_key'='melhorias') improvements,
      count(*)filter(where data->>'group_key'='cobrancas') oversight,
      count(*)filter(where data->>'group_key'='homenagens') honorary,
      count(*)filter(where data->>'group_key'='leis') laws,
      count(*)filter(where data->>'group_key'='outros') others,
      count(*)filter(where data->>'group_method'='revisado') reviewed from matters)
  select jsonb_build_object('total',c.total,'page',page,'page_size',20,
    'matters',coalesce((select jsonb_agg(to_jsonb(q) order by q.data->>'presented_on' desc,q.id desc)
      from(select * from matters order by data->>'presented_on' desc,id desc limit 20 offset (page-1)*20)q),'[]'),
    'metrics',jsonb_build_object('matters',c.total,'normative',c.normative,'requests',c.requests,'classified',c.classified,'honorary',c.honorary),
    'groups',jsonb_build_object('melhorias',c.improvements,'cobrancas',c.oversight,'homenagens',c.honorary,'leis',c.laws,'outros',c.others),
    'classification',jsonb_build_object('method','regras-1','reviewed',c.reviewed,'automatic',c.total-c.reviewed),
    'distribution',coalesce((select jsonb_agg(to_jsonb(d) order by d.total desc,d.id) from(
      select type_data->>'name' name,type_data->>'abbreviation' abbreviation,(data->>'type_id')::bigint id,count(*) total
      from matters group by type_data,data->>'type_id')d),'[]'),
    'types',coalesce((select jsonb_agg(jsonb_build_object('id',external_id,'data',payload) order by payload->>'name')
      from public.legislative_records(r.id,'matter_types')),'[]'),
    'parliamentarians',coalesce((select jsonb_agg(jsonb_build_object('id',p.external_id,'name',p.payload->>'parliamentary_name','active',p.payload->'active') order by p.payload->>'parliamentary_name')
      from public.legislative_records(r.id,'parliamentarians')p),'[]'),
    'councilors',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'parliamentarian_id',l.parliamentarian_id) order by c.name)
      from public.legislative_identity_links l join public.councilors c on c.id=l.councilor_id where l.source_id=s.id),'[]'))
    into content from counters c;
  return result||content;
end $$;

create function public.legislative_recurrences(p_city bigint,p_filters jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.legislative_sources;r public.legislative_runs;result jsonb;begin
  if octet_length(p_filters::text)>4000 then raise exception 'Filtros inválidos.';end if;
  select * into s from public.legislative_sources where city_id=p_city and enabled;
  if s.id is null then return jsonb_build_object('state','unconfigured');end if;
  select * into r from public.legislative_runs where id=s.published_run_id;
  result=jsonb_build_object('state',case when r.id is null then 'pending' else 'ready' end,
    'source',jsonb_build_object('id',s.id,'name',s.name,'url',s.base_url,'first_year',s.first_year,
      'published_at',r.published_at,'collected_at',r.finished_at,'run_id',r.id,
      'stale',r.finished_at<now()-interval '36 hours','method','legislative-2'));
  if r.id is null then return result;end if;
  with matters as materialized(select * from public.legislative_matter_rows(r.id,p_filters)),
    places as(select *,coalesce(nullif(annotation->>'location_label',''),data->'territory'->>'street') location,
      case when nullif(annotation->>'location_label','') is not null then coalesce(annotation->>'neighborhood','')
        else coalesce(nullif(annotation->>'neighborhood',''),data->'territory'->>'neighborhood','') end neighborhood,
      coalesce(annotation->>'location_label','')<>'' and coalesce(annotation->>'service','')<>'' reviewed
      from matters where data->>'group_key' in ('melhorias','cobrancas')),
    edges as(select p.*,value service from places p cross join lateral jsonb_array_elements_text(
      case when nullif(annotation->>'service','') is not null then jsonb_build_array(annotation->>'service') else data->'territory'->'services' end)
      where nullif(location,'') is not null),
    groups as(select public.legislative_text(location)||'|'||public.legislative_text(neighborhood) location_key,
      min(location) location,min(neighborhood) neighborhood,service,count(distinct id) total,bool_and(reviewed) reviewed,
      min(data->>'presented_on') first_date,max(data->>'presented_on') last_date,
      jsonb_agg(jsonb_build_object('id',id,'number',data->>'number','year',data->>'year','source_url',source_url,'authors',authors)
        order by data->>'presented_on',id) matters
      from edges group by public.legislative_text(location),public.legislative_text(neighborhood),service having count(distinct id)>=2)
  select result||jsonb_build_object('groups',coalesce((select jsonb_agg(to_jsonb(q) order by q.total desc,q.location_key,q.service)
    from(select * from groups order by total desc,location_key,service limit 100)q),'[]'),
    'total',(select count(*) from groups),'limit',100,'method','texto-1') into result;
  return result;
end $$;
revoke all on function public.legislative_recurrences(bigint,jsonb) from public,anon,authenticated;

create or replace function public.legislative_public(p_city bigint,p_view text default 'overview',p_filters jsonb default '{}') returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with response as materialized(select case when p_view in ('overview','matters','councilor','parliamentarian') then public.legislative_summary(p_city,p_view,p_filters)
    when p_view='recurrences' then public.legislative_recurrences(p_city,p_filters)
    else public.legislative_public_details(p_city,p_view,p_filters) end data)
  select case when data?'source' then jsonb_set(data,'{source,method}','"legislative-2"') else data end from response
$$;

create function public.legislative_parliamentarian_activity(p_city bigint,p_person bigint,p_start date,p_end date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.legislative_sources;parliamentarian bigint;run uuid;votes jsonb;presence jsonb;ord_presence jsonb;result jsonb;begin
  if p_start is null or p_end is null or p_end<p_start then raise exception 'Período inválido.';end if;
  select * into s from public.legislative_sources where city_id=p_city and enabled;
  if s.id is null then return jsonb_build_object('state','unconfigured');end if;
  run=s.published_run_id;
  if run is null then return jsonb_build_object('state','pending');end if;
  select external_id into parliamentarian from public.legislative_records(run,'parliamentarians') where external_id=p_person;
  if parliamentarian is null then return jsonb_build_object('state','missing');end if;
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
revoke all on function public.legislative_parliamentarian_activity(bigint,bigint,date,date) from public;
grant execute on function public.legislative_parliamentarian_activity(bigint,bigint,date,date) to anon,authenticated,service_role;


notify pgrst,'reload schema';
commit;
