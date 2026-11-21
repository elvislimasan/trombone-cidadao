begin;

-- Do not invoke an Edge Function every minute when there is no work. The cron
-- can stay installed while the source is disabled; ongoing runs still drain.
create or replace function public.legislative_tick() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare worker_url text;worker_secret text;local_now timestamp=now() at time zone 'America/Fortaleza';begin
  if not exists(select 1 from public.legislative_runs r join public.legislative_sources s on s.id=r.source_id where r.status='running' and s.enabled)
    and not exists(select 1 from public.legislative_sources where enabled and daily_enabled
      and local_now::time>=time '03:00' and last_daily_on is distinct from local_now::date) then return;end if;
  if to_regclass('vault.decrypted_secrets') is null then return;end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=''legislative_worker_url'' limit 1' into worker_url;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=''legislative_worker_secret'' limit 1' into worker_secret;
  if worker_url !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/collect-legislative-data$' or coalesce(length(worker_secret),0)<32 then return;end if;
  execute 'select net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=55000)'
    using worker_url,jsonb_build_object('Content-Type','application/json','x-legislative-worker-secret',worker_secret),'{"action":"tick"}'::jsonb;
end $$;

create or replace function public.legislative_set_daily(p_city bigint,p_enabled boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare worker_url text;worker_secret text;begin
  if not public.legislative_can_manage(p_city) then raise exception 'Sem permissão.' using errcode='42501';end if;
  if p_enabled then
    if not exists(select 1 from pg_extension where extname='pg_cron') or not exists(select 1 from pg_extension where extname='pg_net')
      or to_regclass('vault.decrypted_secrets') is null then raise exception 'Configure o agendador, pg_net e os segredos do coletor antes de ativar.';end if;
    execute 'select decrypted_secret from vault.decrypted_secrets where name=''legislative_worker_url'' limit 1' into worker_url;
    execute 'select decrypted_secret from vault.decrypted_secrets where name=''legislative_worker_secret'' limit 1' into worker_secret;
    if coalesce(worker_url,'') !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/collect-legislative-data$' or coalesce(length(worker_secret),0)<32 then
      raise exception 'Os segredos do coletor ainda não estão configurados corretamente.';
    end if;
    execute 'select cron.schedule(''legislative-worker'',''* * * * *'',''select public.legislative_tick();'')';
  end if;
  update public.legislative_sources set daily_enabled=p_enabled where city_id=p_city;
end $$;

-- Operator provisioning uses normal service credentials, never impersonates an
-- application user and never returns or audits secret values. Inert until called.
create function public.legislative_configure_worker(p_url text,p_secret text,p_enabled boolean default false,p_auto_publish boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare secret_id uuid;s public.legislative_sources;key text;value text;begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Acesso restrito ao operador.' using errcode='42501';end if;
  if coalesce(p_url,'') !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/collect-legislative-data$'
    or coalesce(length(p_secret),0) not between 32 and 256 then raise exception 'Configuração do worker inválida.';end if;
  select * into s from public.legislative_sources where city_id=64 for update;
  if s.id is null then raise exception 'Fonte não configurada.';end if;
  if p_auto_publish and s.published_run_id is null then raise exception 'Publique e confira a primeira coleta.';end if;
  if to_regclass('vault.decrypted_secrets') is null then raise exception 'Supabase Vault indisponível.';end if;
  if p_enabled then
    if not exists(select 1 from pg_available_extensions where name='pg_cron') or not exists(select 1 from pg_available_extensions where name='pg_net') then
      raise exception 'Extensões do agendador indisponíveis neste ambiente.';
    end if;
    execute 'create extension if not exists pg_cron';
    execute 'create extension if not exists pg_net';
  end if;
  foreach key in array array['legislative_worker_url','legislative_worker_secret'] loop
    value=case key when 'legislative_worker_url' then p_url else p_secret end;
    execute 'select id from vault.secrets where name=$1' into secret_id using key;
    if secret_id is null then
      execute 'select vault.create_secret($1,$2)' using value,key;
    else
      execute 'select vault.update_secret($1,$2,$3)' using secret_id,value,key;
    end if;
  end loop;
  if p_enabled then execute 'select cron.schedule(''legislative-worker'',''* * * * *'',''select public.legislative_tick();'')';end if;
  update public.legislative_sources set daily_enabled=p_enabled,auto_publish=p_auto_publish,
    last_daily_on=case when p_enabled and exists(select 1 from public.legislative_runs where id=s.published_run_id
      and (finished_at at time zone 'America/Fortaleza')::date=(now() at time zone 'America/Fortaleza')::date)
      then (now() at time zone 'America/Fortaleza')::date else last_daily_on end where id=s.id;
  insert into public.legislative_decisions(source_id,action,details) values(s.id,'configure_worker',
    jsonb_build_object('daily_enabled',p_enabled,'auto_publish',p_auto_publish,'actor','service_operator'));
  return jsonb_build_object('configured',true,'daily_enabled',p_enabled,'auto_publish',p_auto_publish);
end $$;
revoke all on function public.legislative_configure_worker(text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.legislative_configure_worker(text,text,boolean,boolean) to service_role;

notify pgrst,'reload schema';
commit;
