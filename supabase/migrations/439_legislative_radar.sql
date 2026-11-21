begin;

alter table public.permission_rules drop constraint permission_rules_module_check;
alter table public.permission_rules add constraint permission_rules_module_check
  check(module in ('works','rentals','pavement','urban_planning','arborization','services','moderation','legislative'));
insert into public.permission_rules(scope,role_name,module,allowed)
select scope,role_name,'legislative',allowed from public.permission_rules where module='pavement'
  and scope='role' and role_name='admin' on conflict do nothing;

create function public.legislative_can_manage(p_city bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select (p.is_master or p.is_admin and public.can_write(p.id,'legislative'))
    from public.profiles p where p.id=auth.uid()),false)
$$;
revoke all on function public.legislative_can_manage(bigint) from public,anon;
grant execute on function public.legislative_can_manage(bigint) to authenticated,service_role;

create table public.legislative_sources (
  id uuid primary key default gen_random_uuid(), city_id bigint not null references public.cities(id),
  name text not null, base_url text not null check(base_url='https://sapl.floresta.pe.leg.br'),
  adapter text not null default 'floresta-1' check(adapter='floresta-1'),
  first_year integer not null default 2025 check(first_year between 2000 and 2100),
  enabled boolean not null default true, daily_enabled boolean not null default false,
  auto_publish boolean not null default false, published_run_id uuid,
  last_daily_on date, last_success_at timestamptz, last_error text,
  created_at timestamptz not null default now(), unique(city_id), unique(id,city_id)
);
create table public.legislative_runs (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references public.legislative_sources(id),
  status text not null default 'running' check(status in ('running','ready','published','failed','cancelled')),
  summary jsonb not null default '{}', started_at timestamptz not null default now(),
  finished_at timestamptz, published_at timestamptz, requested_by uuid references public.profiles(id),
  error text, unique(id,source_id)
);
create unique index legislative_one_running on public.legislative_runs(source_id) where status='running';
alter table public.legislative_sources add foreign key(published_run_id,id) references public.legislative_runs(id,source_id);
create table public.legislative_jobs (
  id uuid primary key default gen_random_uuid(), run_id uuid not null references public.legislative_runs(id) on delete cascade,
  resource_key text not null, kind text not null, path text not null, params jsonb not null default '{}',
  next_page integer not null default 1, expected_total integer, received integer not null default 0,
  status text not null default 'pending' check(status in ('pending','working','done','failed')),
  lease_token uuid, lease_until timestamptz, attempts integer not null default 0,
  available_at timestamptz not null default now(), error text, unique(run_id,resource_key)
);
create index legislative_jobs_queue on public.legislative_jobs(status,available_at,lease_until);
create table public.legislative_versions (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references public.legislative_sources(id),
  kind text not null, external_id bigint not null check(external_id>0),
  hash text not null, payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<65536),
  source_url text not null check(source_url like 'https://sapl.floresta.pe.leg.br/%'),
  observed_at timestamptz not null default now(),
  unique(source_id,kind,external_id,hash),unique(id,source_id,kind,external_id)
);
create table public.legislative_run_items (
  run_id uuid not null, source_id uuid not null, kind text not null, external_id bigint not null, version_id uuid not null,
  primary key(run_id,kind,external_id),
  foreign key(run_id,source_id) references public.legislative_runs(id,source_id) on delete cascade,
  foreign key(version_id,source_id,kind,external_id) references public.legislative_versions(id,source_id,kind,external_id)
);
create index legislative_versions_parent on public.legislative_versions(source_id,kind,((payload->>'matter_id')::bigint));
create table public.legislative_identity_links (
  source_id uuid not null references public.legislative_sources(id), parliamentarian_id bigint not null,
  councilor_id uuid not null references public.councilors(id), reviewed_by uuid not null references public.profiles(id),
  reviewed_at timestamptz not null default now(), primary key(source_id,parliamentarian_id),unique(source_id,councilor_id)
);
create table public.legislative_annotations (
  source_id uuid not null references public.legislative_sources(id), matter_id bigint not null, version_hash text not null,
  topic text check(topic in ('homenagem','servicos_urbanos','saude','educacao','fiscalizacao','orcamento','outros')),
  street_id uuid references public.pavement_streets(id), location_label text not null default '', location_key text not null default '',
  service text check(service in ('poda','limpeza','iluminacao','esgoto','pavimentacao','agua','outros')),
  note text not null check(length(note) between 5 and 2000), reviewed_by uuid not null references public.profiles(id),
  reviewed_at timestamptz not null default now(), primary key(source_id,matter_id)
);
create table public.legislative_coverage_reviews (
  run_id uuid not null references public.legislative_runs(id), kind text not null check(kind in ('attendance','ballots','terms')),
  starts_on date not null, ends_on date not null check(ends_on>=starts_on),
  note text not null check(length(note) between 10 and 3000), reviewed_by uuid not null references public.profiles(id),
  reviewed_at timestamptz not null default now(), primary key(run_id,kind,starts_on,ends_on)
);
create table public.legislative_corrections (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references public.legislative_sources(id),
  matter_id bigint, run_id uuid references public.legislative_runs(id),
  requested_by uuid not null default auth.uid() references public.profiles(id),
  message text not null check(length(message) between 10 and 3000),
  status text not null default 'pending' check(status in ('pending','reviewed')),
  response text, created_at timestamptz not null default now(), reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);
create table public.legislative_decisions (
  id bigint generated always as identity primary key, source_id uuid not null references public.legislative_sources(id),
  actor_id uuid default auth.uid() references public.profiles(id), action text not null, details jsonb not null,
  created_at timestamptz not null default now()
);

-- Staging, snapshots and review data are private. Public reads go through bounded RPCs.
do $$declare t text;begin
  foreach t in array array['legislative_sources','legislative_runs','legislative_jobs','legislative_versions',
    'legislative_run_items','legislative_identity_links','legislative_annotations','legislative_coverage_reviews',
    'legislative_corrections','legislative_decisions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
grant usage,select on sequence public.legislative_decisions_id_seq to service_role;

create function public.legislative_records(p_run uuid,p_kind text)
returns table(external_id bigint,payload jsonb,source_url text,hash text)
language sql stable security definer set search_path=public,pg_temp as $$
  select i.external_id,v.payload,v.source_url,v.hash from public.legislative_run_items i
  join public.legislative_versions v on v.id=i.version_id where i.run_id=p_run and i.kind=p_kind
$$;
revoke all on function public.legislative_records(uuid,text) from public,anon,authenticated;
grant execute on function public.legislative_records(uuid,text) to service_role;

create function public.legislative_begin_run(p_source uuid,p_plan jsonb,p_requested_by uuid default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare result uuid;s public.legislative_sources;begin
  select * into s from public.legislative_sources where id=p_source and enabled for update;
  if s.id is null then raise exception 'Fonte desativada ou não configurada.';end if;
  select id into result from public.legislative_runs where source_id=p_source and status='running';
  if result is not null then return result;end if;
  if jsonb_typeof(p_plan)<>'array' or jsonb_array_length(p_plan) not between 20 and 100 then raise exception 'Plano de coleta inválido.';end if;
  insert into public.legislative_runs(source_id,requested_by) values(p_source,p_requested_by) returning id into result;
  insert into public.legislative_jobs(run_id,resource_key,kind,path,params)
    select result,e->>'key',e->>'kind',e->>'path',coalesce(e->'params','{}') from jsonb_array_elements(p_plan) e;
  update public.legislative_sources set last_error=null where id=p_source;
  return result;
end $$;

create function public.legislative_claim_job(p_run uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.legislative_jobs;s public.legislative_sources;begin
  select job.* into j from public.legislative_jobs job join public.legislative_runs r on r.id=job.run_id
    join public.legislative_sources src on src.id=r.source_id
    where r.status='running' and src.enabled and (p_run is null or r.id=p_run)
      and (job.status='pending' or job.status='working' and job.lease_until<now()) and job.available_at<=now()
    order by r.started_at,job.resource_key for update of job skip locked limit 1;
  if j.id is null then return null;end if;
  update public.legislative_jobs set status='working',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    where id=j.id returning * into j;
  select src.* into s from public.legislative_sources src join public.legislative_runs r on r.source_id=src.id where r.id=j.run_id;
  return to_jsonb(j)||jsonb_build_object('source_id',s.id,'base_url',s.base_url,'adapter',s.adapter);
end $$;

create function public.legislative_store_page(p_job uuid,p_token uuid,p_page integer,p_total integer,p_next integer,p_rows jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.legislative_jobs;r public.legislative_runs;e jsonb;v_id uuid;v_hash text;begin
  select * into j from public.legislative_jobs where id=p_job for update;
  if j.status<>'working' or j.lease_token is distinct from p_token or j.next_page<>p_page then raise exception 'Página já processada ou execução substituída.';end if;
  select * into r from public.legislative_runs where id=j.run_id for update;
  if r.status<>'running' then raise exception 'Coleta encerrada.';end if;
  if p_total<0 or p_total>1000000 or p_next is not null and p_next<>p_page+1
    or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>100 then raise exception 'Página inválida.';end if;
  if j.expected_total is not null and j.expected_total<>p_total then raise exception 'A fonte mudou durante a coleta. Inicie uma nova conferência.';end if;
  for e in select value from jsonb_array_elements(p_rows) loop
    if e->>'kind'<>j.kind or (e->'payload') ?| array['ip','user','operadores','password','token'] then raise exception 'Campos não autorizados.';end if;
    v_hash=encode(sha256(convert_to((e->'payload')::text,'UTF8')),'hex');
    insert into public.legislative_versions(source_id,kind,external_id,hash,payload,source_url)
      values(r.source_id,j.kind,(e->>'external_id')::bigint,v_hash,e->'payload',e->>'source_url')
      on conflict(source_id,kind,external_id,hash) do update set source_url=excluded.source_url returning id into v_id;
    -- Deliberately reject repeated IDs across pages. The transaction rolls back the page.
    insert into public.legislative_run_items(run_id,source_id,kind,external_id,version_id)
      values(r.id,r.source_id,j.kind,(e->>'external_id')::bigint,v_id);
  end loop;
  if p_next is null and j.received+jsonb_array_length(p_rows)<>p_total then raise exception 'Total recebido não confere com a fonte.';end if;
  update public.legislative_jobs set expected_total=p_total,received=received+jsonb_array_length(p_rows),
    next_page=coalesce(p_next,next_page),status=case when p_next is null then 'done' else 'pending' end,
    lease_until=null,lease_token=null,attempts=0,error=null where id=p_job;
end $$;

create function public.legislative_fail_job(p_job uuid,p_token uuid,p_error text,p_retry_after integer default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.legislative_jobs;begin
  select * into j from public.legislative_jobs where id=p_job for update;
  if j.lease_token is distinct from p_token then return;end if;
  update public.legislative_jobs set status=case when p_retry_after is not null and attempts<3 then 'pending' else 'failed' end,
    attempts=attempts+1,available_at=now()+make_interval(secs=>greatest(30,least(coalesce(p_retry_after,60),3600))*(attempts+1)),
    error=left(p_error,500),lease_token=null,lease_until=null where id=p_job returning * into j;
  if j.status='failed' then
    update public.legislative_runs set status='failed',error=j.error,finished_at=now() where id=j.run_id;
    update public.legislative_sources set last_error=j.error where id=(select source_id from public.legislative_runs where id=j.run_id);
  end if;
end $$;

create function public.legislative_finish_run(p_run uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.legislative_runs;result jsonb;begin
  select * into r from public.legislative_runs where id=p_run for update;
  if r.status<>'running' or exists(select 1 from public.legislative_jobs where run_id=p_run and status<>'done') then return null;end if;
  if exists(select 1 from public.legislative_records(p_run,'matters') m where not exists(
    select 1 from public.legislative_records(p_run,'matter_types') t where t.external_id=(m.payload->>'type_id')::bigint)) then raise exception 'Tipo de matéria não conciliado.';end if;
  if exists(select 1 from public.legislative_records(p_run,'matters') m cross join lateral jsonb_array_elements_text(m.payload->'author_ids') a
    where not exists(select 1 from public.legislative_records(p_run,'authors') au where au.external_id=a::bigint)) then raise exception 'Autor informado na matéria não foi encontrado.';end if;
  select jsonb_object_agg(kind,total) into result from (select kind,count(*) total from public.legislative_run_items where run_id=p_run group by kind) counts;
  result=coalesce(result,'{}')||jsonb_build_object('method','legislative-1','period_warning','O período de legislatura da fonte deve ser conferido com a documentação de posse.');
  update public.legislative_runs set status='ready',finished_at=now(),summary=result where id=p_run;
  update public.legislative_sources set last_success_at=now(),last_error=null where id=r.source_id;
  return result;
end $$;

-- Private worker entry points: a browser/admin cannot bypass collection checks.
revoke all on function public.legislative_begin_run(uuid,jsonb,uuid),public.legislative_claim_job(uuid),
  public.legislative_store_page(uuid,uuid,integer,integer,integer,jsonb),public.legislative_fail_job(uuid,uuid,text,integer),
  public.legislative_finish_run(uuid) from public,anon,authenticated;
grant execute on function public.legislative_begin_run(uuid,jsonb,uuid),public.legislative_claim_job(uuid),
  public.legislative_store_page(uuid,uuid,integer,integer,integer,jsonb),public.legislative_fail_job(uuid,uuid,text,integer),
  public.legislative_finish_run(uuid) to service_role;

create function public.legislative_publish_run(p_run uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.legislative_runs;s public.legislative_sources;begin
  select * into r from public.legislative_runs where id=p_run for update;
  select * into s from public.legislative_sources where id=r.source_id for update;
  if not public.legislative_can_manage(s.city_id) and coalesce(auth.role(),'')<>'service_role' then raise exception 'Sem permissão.' using errcode='42501';end if;
  if r.status<>'ready' then raise exception 'A coleta precisa estar completa e validada.';end if;
  update public.legislative_sources set published_run_id=r.id where id=s.id;
  update public.legislative_runs set status='published',published_at=now() where id=r.id;
  insert into public.legislative_decisions(source_id,action,details) values(s.id,'publish',jsonb_build_object('run_id',r.id));
end $$;
revoke all on function public.legislative_publish_run(uuid) from public,anon;
grant execute on function public.legislative_publish_run(uuid) to authenticated,service_role;

create function public.legislative_matter_rows(p_run uuid,p_filters jsonb default '{}')
returns table(id bigint,data jsonb,source_url text,hash text,type_data jsonb,annotation jsonb,authors jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
  select m.external_id,m.payload,m.source_url,m.hash,t.payload,
    case when an.version_hash=m.hash then to_jsonb(an)-'reviewed_by' else null end,
    coalesce((select jsonb_agg(distinct jsonb_build_object('id',a.external_id,'name',a.payload->>'name',
      'parliamentarian_id',a.payload->'parliamentarian_id','councilor_id',l.councilor_id,'slug',c.slug))
      from public.legislative_records(p_run,'authors') a
      left join public.legislative_identity_links l on l.source_id=r.source_id and l.parliamentarian_id=(a.payload->>'parliamentarian_id')::bigint
      left join public.councilors c on c.id=l.councilor_id
      where a.external_id in (select value::bigint from jsonb_array_elements_text(m.payload->'author_ids'))
        or exists(select 1 from public.legislative_records(p_run,'authorships') au where (au.payload->>'matter_id')::bigint=m.external_id and (au.payload->>'author_id')::bigint=a.external_id)), '[]')
  from public.legislative_records(p_run,'matters') m
  join public.legislative_runs r on r.id=p_run
  join public.legislative_records(p_run,'matter_types') t on t.external_id=(m.payload->>'type_id')::bigint
  left join public.legislative_annotations an on an.source_id=r.source_id and an.matter_id=m.external_id
  where (not p_filters ? 'start' or m.payload->>'presented_on'>=p_filters->>'start')
    and (not p_filters ? 'end' or m.payload->>'presented_on'<=p_filters->>'end')
    and (coalesce(p_filters->>'search','')='' or m.payload->>'summary' ilike '%'||replace(replace(replace(left(p_filters->>'search',200),'\','\\'),'%','\%'),'_','\_')||'%'
      or concat(m.payload->>'number','/',m.payload->>'year')=p_filters->>'search')
    and (nullif(p_filters->>'type_id','') is null or m.payload->>'type_id'=p_filters->>'type_id')
    and (nullif(p_filters->>'topic','') is null or an.version_hash=m.hash and an.topic=p_filters->>'topic')
    and (nullif(p_filters->>'location','') is null or an.version_hash=m.hash and an.location_key=p_filters->>'location')
    and (nullif(p_filters->>'councilor_id','') is null or exists(
      select 1 from public.legislative_identity_links l join public.legislative_records(p_run,'authors') a on (a.payload->>'parliamentarian_id')::bigint=l.parliamentarian_id
      where l.source_id=r.source_id and l.councilor_id::text=p_filters->>'councilor_id' and (a.external_id in (select value::bigint from jsonb_array_elements_text(m.payload->'author_ids'))
        or exists(select 1 from public.legislative_records(p_run,'authorships') au where (au.payload->>'matter_id')::bigint=m.external_id and (au.payload->>'author_id')::bigint=a.external_id))))
$$;
revoke all on function public.legislative_matter_rows(uuid,jsonb) from public,anon,authenticated;

create function public.legislative_public(p_city bigint,p_view text default 'overview',p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.legislative_sources;r public.legislative_runs;result jsonb;rows jsonb;total integer;page integer;item bigint;
begin
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
  if p_view in ('overview','matters','councilor') then
    select count(*) into total from public.legislative_matter_rows(r.id,p_filters);
    select coalesce(jsonb_agg(to_jsonb(q) order by q.data->>'presented_on' desc,q.id desc),'[]') into rows from (
      select * from public.legislative_matter_rows(r.id,p_filters) order by data->>'presented_on' desc,id desc limit 20 offset (page-1)*20) q;
    result=result||jsonb_build_object('total',total,'page',page,'page_size',20,'matters',rows,
      'types',coalesce((select jsonb_agg(jsonb_build_object('id',external_id,'data',payload) order by payload->>'name') from public.legislative_records(r.id,'matter_types')),'[]'),
      'councilors',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'parliamentarian_id',l.parliamentarian_id) order by c.name)
        from public.legislative_identity_links l join public.councilors c on c.id=l.councilor_id where l.source_id=s.id),'[]'));
    if p_view in ('overview','councilor') then
      result=result||jsonb_build_object('metrics',jsonb_build_object('matters',total,
        'normative',(select count(*) from public.legislative_matter_rows(r.id,p_filters) where type_data->>'abbreviation' in ('PLO','PLC','PELO','PLSUB','PRE','PRS','PDL')),
        'requests',(select count(*) from public.legislative_matter_rows(r.id,p_filters) where type_data->>'abbreviation' in ('PPROV','IND','REQ','REQU')),
        'classified',(select count(*) from public.legislative_matter_rows(r.id,p_filters) where annotation->>'topic' is not null),
        'honorary',(select count(*) from public.legislative_matter_rows(r.id,p_filters) where annotation->>'topic'='homenagem')),
        'distribution',coalesce((select jsonb_agg(to_jsonb(d) order by d.total desc) from (
          select type_data->>'name' name,type_data->>'abbreviation' abbreviation,(data->>'type_id')::bigint id,count(*) total
          from public.legislative_matter_rows(r.id,p_filters) group by type_data,data->>'type_id')d),'[]'));
    end if;
  elsif p_view='directory' then
    result=result||jsonb_build_object('parliamentarians',coalesce((select jsonb_agg(jsonb_build_object('id',p.external_id,'data',p.payload,'source_url',p.source_url,
      'councilor',case when c.id is not null then jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name,'photo_url',c.photo_url,'party',c.party) end) order by p.payload->>'name')
      from public.legislative_records(r.id,'parliamentarians') p left join public.legislative_identity_links l on l.source_id=s.id and l.parliamentarian_id=p.external_id
      left join public.councilors c on c.id=l.councilor_id),'[]'));
  elsif p_view='matter' then
    item=(p_filters->>'id')::bigint;
    select to_jsonb(m) into rows from public.legislative_matter_rows(r.id,'{}')m where id=item;
    if rows is null then return jsonb_build_object('state','missing');end if;
    result=result||jsonb_build_object('matter',rows,
      'proceedings',coalesce((select jsonb_agg(jsonb_build_object('id',p.external_id,'data',p.payload,'source_url',p.source_url,'status',st.payload->>'name') order by p.payload->>'date' desc,p.external_id desc)
        from public.legislative_records(r.id,'proceedings')p left join public.legislative_records(r.id,'statuses')st on st.external_id=(p.payload->>'status_id')::bigint where (p.payload->>'matter_id')::bigint=item),'[]'),
      'norms',coalesce((select jsonb_agg(jsonb_build_object('id',external_id,'data',payload,'source_url',source_url)) from public.legislative_records(r.id,'norms') where (payload->>'matter_id')::bigint=item),'[]'),
      'ballots',coalesce((select jsonb_agg(jsonb_build_object('id',b.external_id,'data',b.payload,'source_url',b.source_url,'result',bt.payload->>'name',
        'session_id',coalesce(a.payload->'session_id',e.payload->'session_id'),
        'votes',coalesce((select jsonb_agg(jsonb_build_object('choice',v.payload->>'choice','name',p.payload->>'parliamentary_name','source_url',v.source_url))
          from public.legislative_records(r.id,'votes')v join public.legislative_records(r.id,'parliamentarians')p on p.external_id=(v.payload->>'parliamentarian_id')::bigint where (v.payload->>'ballot_id')::bigint=b.external_id),'[]')))
        from public.legislative_records(r.id,'ballots')b left join public.legislative_records(r.id,'ballot_types')bt on bt.external_id=(b.payload->>'result_id')::bigint
        left join public.legislative_records(r.id,'agenda')a on a.external_id=(b.payload->>'agenda_id')::bigint
        left join public.legislative_records(r.id,'expedient')e on e.external_id=(b.payload->>'expedient_id')::bigint where (b.payload->>'matter_id')::bigint=item),'[]'));
  elsif p_view='sessions' then
    select count(*) into total from public.legislative_records(r.id,'sessions') where (not p_filters?'start' or payload->>'date'>=p_filters->>'start') and (not p_filters?'end' or payload->>'date'<=p_filters->>'end');
    select coalesce(jsonb_agg(to_jsonb(q) order by q.data->>'date' desc,q.id desc),'[]') into rows from (
      select external_id id,payload data,source_url from public.legislative_records(r.id,'sessions') where (not p_filters?'start' or payload->>'date'>=p_filters->>'start') and (not p_filters?'end' or payload->>'date'<=p_filters->>'end')
      order by payload->>'date' desc,external_id desc limit 20 offset (page-1)*20)q;
    result=result||jsonb_build_object('sessions',rows,'total',total,'page',page,'page_size',20);
  elsif p_view='session' then
    item=(p_filters->>'id')::bigint;
    select jsonb_build_object('id',external_id,'data',payload,'source_url',source_url) into rows from public.legislative_records(r.id,'sessions') where external_id=item;
    if rows is null then return jsonb_build_object('state','missing');end if;
    result=result||jsonb_build_object('session',rows,'agenda',coalesce((select jsonb_agg(jsonb_build_object('id',a.external_id,'data',a.payload,'source_url',a.source_url,'matter',to_jsonb(m),'section',a.section) order by a.section,a.payload->>'order')
      from (select *, 'Ordem do dia' section from public.legislative_records(r.id,'agenda') union all select *, 'Expediente' section from public.legislative_records(r.id,'expedient')) a
      left join public.legislative_matter_rows(r.id,'{}')m on m.id=(a.payload->>'matter_id')::bigint where (a.payload->>'session_id')::bigint=item),'[]'),
      'attendance',coalesce((select jsonb_agg(jsonb_build_object('name',p.payload->>'parliamentary_name','source_url',a.source_url)) from public.legislative_records(r.id,'attendance')a
        join public.legislative_records(r.id,'parliamentarians')p on p.external_id=(a.payload->>'parliamentarian_id')::bigint where (a.payload->>'session_id')::bigint=item),'[]'));
  elsif p_view='recurrences' then
    result=result||jsonb_build_object('groups',coalesce((select jsonb_agg(to_jsonb(q) order by q.total desc)from(
      select annotation->>'location_key' location_key,annotation->>'location_label' location,annotation->>'service' service,count(distinct id) total,
        min(data->>'presented_on') first_date,max(data->>'presented_on') last_date,
        jsonb_agg(jsonb_build_object('id',id,'number',data->>'number','year',data->>'year','source_url',source_url)) matters
      from public.legislative_matter_rows(r.id,p_filters) where annotation->>'location_key'<>'' and annotation->>'service' is not null
      group by annotation->>'location_key',annotation->>'location_label',annotation->>'service' having count(distinct id)>=3 order by count(distinct id) desc limit 100)q),'[]'));
  else raise exception 'Consulta legislativa inválida.';end if;
  return result;
end $$;
revoke all on function public.legislative_public(bigint,text,jsonb) from public;
grant execute on function public.legislative_public(bigint,text,jsonb) to anon,authenticated,service_role;

insert into public.legislative_sources(city_id,name,base_url)
  select id,'Câmara Municipal de Floresta','https://sapl.floresta.pe.leg.br' from public.cities where id=64 and name='Floresta';

notify pgrst,'reload schema';
commit;
