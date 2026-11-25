begin;

create function public.legislative_admin(p_city bigint) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.legislative_sources;r uuid;begin
  if not public.legislative_can_manage(p_city) then raise exception 'Sem permissão.' using errcode='42501';end if;
  select * into s from public.legislative_sources where city_id=p_city;
  if s.id is null then return jsonb_build_object('state','unconfigured');end if;
  select id into r from public.legislative_runs where source_id=s.id and status in ('ready','published') order by started_at desc limit 1;
  return jsonb_build_object('state','ready','source',to_jsonb(s),
    'runs',coalesce((select jsonb_agg(to_jsonb(q) order by q.started_at desc) from(select * from public.legislative_runs where source_id=s.id order by started_at desc limit 10)q),'[]'),
    'jobs',coalesce((select jsonb_agg(to_jsonb(q) order by q.resource_key) from(select j.* from public.legislative_jobs j join public.legislative_runs rr on rr.id=j.run_id
      where rr.id=(select id from public.legislative_runs where source_id=s.id order by started_at desc limit 1))q),'[]'),
    'parliamentarians',coalesce((select jsonb_agg(jsonb_build_object('id',p.external_id,'data',p.payload,'link',to_jsonb(l)) order by p.payload->>'name')
      from public.legislative_records(r,'parliamentarians')p left join public.legislative_identity_links l on l.source_id=s.id and l.parliamentarian_id=p.external_id),'[]'),
    'councilors',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'nickname',nickname,'slug',slug) order by name) from public.councilors where city_id=p_city),'[]'),
    'corrections',coalesce((select jsonb_agg(to_jsonb(q)-'requested_by' order by q.created_at desc)from(select * from public.legislative_corrections where source_id=s.id and status='pending' order by created_at desc limit 50)q),'[]'));
end $$;

create function public.legislative_decide(p_city bigint,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.legislative_sources;r uuid;p jsonb;m record;c uuid;street_city bigint;begin
  if not public.legislative_can_manage(p_city) then raise exception 'Sem permissão.' using errcode='42501';end if;
  select * into s from public.legislative_sources where city_id=p_city for update;
  if s.id is null then raise exception 'Fonte não configurada.';end if;
  if octet_length(p_data::text)>8000 then raise exception 'Decisão inválida.';end if;
  if p_action='publish' then
    perform public.legislative_publish_run((p_data->>'run_id')::uuid);
  elsif p_action='cancel' then
    update public.legislative_runs set status='cancelled',finished_at=now() where id=(p_data->>'run_id')::uuid and source_id=s.id and status in ('running','ready');
  elsif p_action='auto_publish' then
    if s.published_run_id is null then raise exception 'Confira e publique a primeira coleta antes de ativar a publicação automática.';end if;
    update public.legislative_sources set auto_publish=(p_data->>'enabled')::boolean where id=s.id;
  elsif p_action='bind' then
    select id into r from public.legislative_runs where source_id=s.id and status in ('ready','published') order by started_at desc limit 1;
    select payload into p from public.legislative_records(r,'parliamentarians') where external_id=(p_data->>'parliamentarian_id')::bigint;
    if p is null then raise exception 'Parlamentar não encontrado na coleta.';end if;
    c=nullif(p_data->>'councilor_id','')::uuid;
    if c is null and p_data->>'create'='true' then
      insert into public.councilors(city_id,name,normalized_name,slug)
        values(p_city,p->>'name',public.normalized_councilor_name(p->>'name'),public.councilor_slug(p->>'name')) returning id into c;
    end if;
    if c is null or not exists(select 1 from public.councilors where id=c and city_id=p_city) then raise exception 'Selecione um perfil da mesma cidade.';end if;
    insert into public.legislative_identity_links(source_id,parliamentarian_id,councilor_id,reviewed_by)
      values(s.id,(p_data->>'parliamentarian_id')::bigint,c,auth.uid())
      on conflict(source_id,parliamentarian_id)do update set councilor_id=excluded.councilor_id,reviewed_by=auth.uid(),reviewed_at=now();
  elsif p_action='classify' then
    select * into m from public.legislative_matter_rows(s.published_run_id,'{}') where id=(p_data->>'matter_id')::bigint;
    if m.id is null or m.hash is distinct from p_data->>'version_hash' then raise exception 'O documento mudou. Consulte a versão atual antes de revisar.';end if;
    if nullif(p_data->>'street_id','') is not null then
      select city_id into street_city from public.pavement_streets where id=(p_data->>'street_id')::uuid;
      if street_city is distinct from p_city then raise exception 'Rua de outra cidade.';end if;
    end if;
    insert into public.legislative_annotations(source_id,matter_id,version_hash,topic,street_id,location_label,location_key,service,note,reviewed_by)
    values(s.id,m.id,m.hash,nullif(p_data->>'topic',''),nullif(p_data->>'street_id','')::uuid,
      left(trim(coalesce(p_data->>'location','')),300),coalesce(public.normalized_councilor_name(left(trim(coalesce(p_data->>'location','')),300)),''),
      nullif(p_data->>'service',''),p_data->>'note',auth.uid())
    on conflict(source_id,matter_id)do update set version_hash=excluded.version_hash,topic=excluded.topic,street_id=excluded.street_id,
      location_label=excluded.location_label,location_key=excluded.location_key,service=excluded.service,note=excluded.note,reviewed_by=auth.uid(),reviewed_at=now();
  elsif p_action='coverage' then
    if s.published_run_id is null then raise exception 'Publique uma coleta antes de revisar a cobertura.';end if;
    insert into public.legislative_coverage_reviews(run_id,kind,starts_on,ends_on,note,reviewed_by)
      values(s.published_run_id,p_data->>'kind',(p_data->>'start')::date,(p_data->>'end')::date,p_data->>'note',auth.uid())
      on conflict(run_id,kind,starts_on,ends_on)do update set note=excluded.note,reviewed_by=auth.uid(),reviewed_at=now();
  elsif p_action='correction' then
    if length(trim(coalesce(p_data->>'response','')))<5 then raise exception 'Informe a resposta da revisão.';end if;
    update public.legislative_corrections set status='reviewed',response=left(p_data->>'response',3000),reviewed_at=now(),reviewed_by=auth.uid()
      where id=(p_data->>'id')::uuid and source_id=s.id;
  else raise exception 'Ação inválida.';end if;
  insert into public.legislative_decisions(source_id,action,details) values(s.id,p_action,p_data);
  return jsonb_build_object('saved',true,'councilor_id',c);
end $$;

create function public.legislative_report_error(p_city bigint,p_matter bigint,p_message text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.legislative_sources;result uuid;begin
  if auth.uid() is null then raise exception 'Entre na sua conta para informar um erro.' using errcode='42501';end if;
  select * into s from public.legislative_sources where city_id=p_city and enabled;
  if s.id is null then raise exception 'Fonte não encontrada.';end if;
  if p_matter is not null and not exists(select 1 from public.legislative_records(s.published_run_id,'matters') where external_id=p_matter) then raise exception 'Matéria não encontrada.';end if;
  if (select count(*) from public.legislative_corrections where requested_by=auth.uid() and created_at>now()-interval '1 hour')>=5 then raise exception 'Aguarde antes de enviar outra solicitação.';end if;
  insert into public.legislative_corrections(source_id,matter_id,run_id,message)
    values(s.id,p_matter,s.published_run_id,trim(p_message)) returning id into result;
  return result;
end $$;

revoke all on function public.legislative_admin(bigint),public.legislative_decide(bigint,text,jsonb),
  public.legislative_report_error(bigint,bigint,text) from public,anon;
grant execute on function public.legislative_admin(bigint),public.legislative_decide(bigint,text,jsonb),
  public.legislative_report_error(bigint,bigint,text) to authenticated;

create function public.legislative_abort_run(p_run uuid,p_error text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.legislative_runs set status='failed',error=left(p_error,500),finished_at=now() where id=p_run and status='running';
  update public.legislative_sources set last_error=left(p_error,500) where id=(select source_id from public.legislative_runs where id=p_run);
end $$;
revoke all on function public.legislative_abort_run(uuid,text) from public,anon,authenticated;
grant execute on function public.legislative_abort_run(uuid,text) to service_role;

-- Vault contains a dedicated worker secret, never a browser credential.
-- The minute tick drains resumable jobs; it starts at most one daily run after 03:00 Fortaleza.
create function public.legislative_tick() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare worker_url text;worker_secret text;begin
  if not exists(select 1 from public.legislative_sources where enabled and daily_enabled)
    and not exists(select 1 from public.legislative_runs where status='running') then return;end if;
  if to_regclass('vault.decrypted_secrets') is null then return;end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=''legislative_worker_url'' limit 1' into worker_url;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=''legislative_worker_secret'' limit 1' into worker_secret;
  if worker_url !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/collect-legislative-data$' or coalesce(length(worker_secret),0)<32 then return;end if;
  execute 'select net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=55000)'
    using worker_url,jsonb_build_object('Content-Type','application/json','x-legislative-worker-secret',worker_secret),'{"action":"tick"}'::jsonb;
end $$;
revoke all on function public.legislative_tick() from public,anon,authenticated;
grant execute on function public.legislative_tick() to service_role;

create function public.legislative_set_daily(p_city bigint,p_enabled boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare configured boolean;begin
  if not public.legislative_can_manage(p_city) then raise exception 'Sem permissão.' using errcode='42501';end if;
  if p_enabled then
    if not exists(select 1 from pg_extension where extname='pg_cron') or not exists(select 1 from pg_extension where extname='pg_net')
      or to_regclass('vault.decrypted_secrets') is null then raise exception 'Configure o agendador, pg_net e os segredos do coletor antes de ativar.';end if;
    execute 'select count(*)=2 from vault.decrypted_secrets where name in (''legislative_worker_url'',''legislative_worker_secret'')' into configured;
    if not configured then raise exception 'Os segredos do coletor ainda não estão configurados.';end if;
    execute 'select cron.schedule(''legislative-worker'',''* * * * *'',''select public.legislative_tick();'')';
  end if;
  update public.legislative_sources set daily_enabled=p_enabled where city_id=p_city;
end $$;
revoke all on function public.legislative_set_daily(bigint,boolean) from public,anon;
grant execute on function public.legislative_set_daily(bigint,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
