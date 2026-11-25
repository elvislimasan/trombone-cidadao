begin;

-- Relations are editorial decisions tied to the exact official document version.
-- They never assert causation or execution. Public report visibility is rechecked
-- on every read, including when a previously linked report becomes private.
create table public.legislative_related_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.legislative_sources(id),
  matter_id bigint not null, version_hash text not null,
  report_id uuid references public.reports(id) on delete cascade,
  street_id uuid references public.pavement_streets(id) on delete cascade,
  note text not null check(length(trim(note)) between 5 and 600),
  reviewed_by uuid not null references public.profiles(id), reviewed_at timestamptz not null default now(),
  check(num_nonnulls(report_id,street_id)=1)
);
create unique index legislative_related_report on public.legislative_related_records(source_id,matter_id,report_id) where report_id is not null;
create unique index legislative_related_street on public.legislative_related_records(source_id,matter_id,street_id) where street_id is not null;
alter table public.legislative_related_records enable row level security;
revoke all on public.legislative_related_records from anon,authenticated;
grant all on public.legislative_related_records to service_role;

create function public.legislative_related(p_source uuid,p_matter bigint,p_hash text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by q.reviewed_at,q.id),'[]') from (
    select l.id,'report' kind,'Bronca '||coalesce(nullif(r.protocol::text,''),r.id::text) title,
      '/bronca/'||r.id href,r.status::text status,l.note,l.reviewed_at
    from public.legislative_related_records l join public.legislative_sources s on s.id=l.source_id
    join public.reports r on r.id=l.report_id and r.city_id=s.city_id
    where l.source_id=p_source and l.matter_id=p_matter and l.version_hash=p_hash
      and r.is_public=true and r.moderation_status='approved'
      and r.status in ('pending','in-progress','pending_resolution','resolved')
      and (r.signal_status is null or r.signal_status='done')
    union all
    select l.id,'street',coalesce(nullif(left(st.name,200),''),'Rua sem nome informado'),
      '/mapa-pavimentacao/rua/'||st.id,null::text,l.note,l.reviewed_at
    from public.legislative_related_records l join public.legislative_sources s on s.id=l.source_id
    join public.pavement_streets st on st.id=l.street_id and st.city_id=s.city_id
    where l.source_id=p_source and l.matter_id=p_matter and l.version_hash=p_hash
  )q
$$;
revoke all on function public.legislative_related(uuid,bigint,text) from public,anon,authenticated;

-- Keep the original read API private; enrich only the views that need relations
-- or grouping by a canonical location, irrespective of capitalization in labels.
alter function public.legislative_public(bigint,text,jsonb) rename to legislative_public_base;
revoke all on function public.legislative_public_base(bigint,text,jsonb) from public,anon,authenticated,service_role;
create function public.legislative_public(p_city bigint,p_view text default 'overview',p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;s public.legislative_sources;r public.legislative_runs;begin
  if p_view<>'recurrences' then
    result=public.legislative_public_base(p_city,p_view,p_filters);
    if p_view='matter' and result->>'state'='ready' then
      result=result||jsonb_build_object('related',public.legislative_related((result->'source'->>'id')::uuid,
        (result->'matter'->>'id')::bigint,result->'matter'->>'hash'));
    end if;
    return result;
  end if;
  if octet_length(p_filters::text)>4000 then raise exception 'Filtros inválidos.';end if;
  select * into s from public.legislative_sources where city_id=p_city and enabled;
  if s.id is null then return jsonb_build_object('state','unconfigured');end if;
  select * into r from public.legislative_runs where id=s.published_run_id;
  result=jsonb_build_object('state',case when r.id is null then 'pending' else 'ready' end,
    'source',jsonb_build_object('id',s.id,'name',s.name,'url',s.base_url,'first_year',s.first_year,
      'published_at',r.published_at,'collected_at',r.finished_at,'run_id',r.id,
      'stale',r.finished_at<now()-interval '36 hours','method','legislative-1'));
  if r.id is null then return result;end if;
  return result||jsonb_build_object('groups',coalesce((select jsonb_agg(to_jsonb(q) order by q.total desc,q.location_key,q.service) from (
    select annotation->>'location_key' location_key,min(annotation->>'location_label') location,
      annotation->>'service' service,count(distinct id) total,
      min(data->>'presented_on') first_date,max(data->>'presented_on') last_date,
      jsonb_agg(jsonb_build_object('id',id,'number',data->>'number','year',data->>'year','source_url',source_url) order by data->>'presented_on',id) matters
    from public.legislative_matter_rows(r.id,p_filters)
    where annotation->>'location_key'<>'' and annotation->>'service' is not null
    group by annotation->>'location_key',annotation->>'service'
    having count(distinct id)>=3 order by count(distinct id) desc,annotation->>'location_key',annotation->>'service' limit 100
  )q),'[]'));
end $$;
revoke all on function public.legislative_public(bigint,text,jsonb) from public;
grant execute on function public.legislative_public(bigint,text,jsonb) to anon,authenticated,service_role;

alter function public.legislative_decide(bigint,text,jsonb) rename to legislative_decide_base;
revoke all on function public.legislative_decide_base(bigint,text,jsonb) from public,anon,authenticated,service_role;
create function public.legislative_decide(p_city bigint,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.legislative_sources;m record;target uuid;linked uuid;begin
  if not public.legislative_can_manage(p_city) then raise exception 'Sem permissão.' using errcode='42501';end if;
  if octet_length(p_data::text)>8000 then raise exception 'Decisão inválida.';end if;
  select * into s from public.legislative_sources where city_id=p_city for update;
  if s.id is null then raise exception 'Fonte não configurada.';end if;
  if p_action='publish' and not exists(select 1 from public.legislative_runs where id=(p_data->>'run_id')::uuid and source_id=s.id) then
    raise exception 'Coleta de outra cidade.';
  end if;
  if p_action not in ('relate','unrelate') then return public.legislative_decide_base(p_city,p_action,p_data);end if;
  select * into m from public.legislative_matter_rows(s.published_run_id,'{}') where id=(p_data->>'matter_id')::bigint;
  if m.id is null or m.hash is distinct from p_data->>'version_hash' then raise exception 'O documento mudou. Consulte a versão atual antes de revisar.';end if;
  if p_action='unrelate' then
    delete from public.legislative_related_records where id=(p_data->>'id')::uuid and source_id=s.id and matter_id=m.id returning id into linked;
    if linked is null then raise exception 'Vínculo não encontrado.';end if;
  else
    if length(trim(coalesce(p_data->>'note',''))) not between 5 and 600 then raise exception 'Informe a justificativa pública do vínculo.';end if;
    target=(p_data->>'target_id')::uuid;
    if p_data->>'kind'='report' then
      if not exists(select 1 from public.reports r where r.id=target and r.city_id=p_city and r.is_public=true
        and r.moderation_status='approved' and r.status in ('pending','in-progress','pending_resolution','resolved')
        and (r.signal_status is null or r.signal_status='done')) then raise exception 'Bronca indisponível para vínculo público nesta cidade.';end if;
      insert into public.legislative_related_records(source_id,matter_id,version_hash,report_id,note,reviewed_by)
        values(s.id,m.id,m.hash,target,trim(p_data->>'note'),auth.uid())
        on conflict(source_id,matter_id,report_id) where report_id is not null do update
          set version_hash=excluded.version_hash,note=excluded.note,reviewed_by=auth.uid(),reviewed_at=now() returning id into linked;
    elsif p_data->>'kind'='street' then
      if not exists(select 1 from public.pavement_streets where id=target and city_id=p_city) then raise exception 'Rua de outra cidade ou indisponível.';end if;
      insert into public.legislative_related_records(source_id,matter_id,version_hash,street_id,note,reviewed_by)
        values(s.id,m.id,m.hash,target,trim(p_data->>'note'),auth.uid())
        on conflict(source_id,matter_id,street_id) where street_id is not null do update
          set version_hash=excluded.version_hash,note=excluded.note,reviewed_by=auth.uid(),reviewed_at=now() returning id into linked;
    else raise exception 'Tipo de registro inválido.';end if;
  end if;
  insert into public.legislative_decisions(source_id,action,details) values(s.id,p_action,p_data);
  return jsonb_build_object('saved',true,'id',linked);
end $$;
revoke all on function public.legislative_decide(bigint,text,jsonb) from public,anon;
grant execute on function public.legislative_decide(bigint,text,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
