begin;

alter function public.legislative_finish_run(uuid) rename to legislative_finish_run_base;
revoke all on function public.legislative_finish_run_base(uuid) from public,anon,authenticated,service_role;
create function public.legislative_finish_run(p_run uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;baseline uuid;issues jsonb='[]';changed bigint;previous_total bigint;begin
  result=public.legislative_finish_run_base(p_run);
  if result is null then return null;end if;
  if coalesce((result->>'matters')::bigint,0)=0 or coalesce((result->>'authors')::bigint,0)=0
    or coalesce((result->>'parliamentarians')::bigint,0)=0 or coalesce((result->>'matter_types')::bigint,0)=0 then
    raise exception 'A coleta não contém os recursos essenciais. O último acervo publicado foi preservado.';
  end if;
  select s.published_run_id into baseline from public.legislative_sources s join public.legislative_runs r on r.source_id=s.id where r.id=p_run;
  if baseline is not null and baseline<>p_run then
    select coalesce(jsonb_agg(jsonb_build_object('kind',q.kind,'missing',q.missing,'before',q.before,'after',q.after)),'[]') into issues from (
      select old.kind,count(*)filter(where fresh.external_id is null) missing,count(*) before,
        (select count(*)from public.legislative_run_items n where n.run_id=p_run and n.kind=old.kind) after
      from public.legislative_run_items old left join public.legislative_run_items fresh
        on fresh.run_id=p_run and fresh.kind=old.kind and fresh.external_id=old.external_id
      where old.run_id=baseline group by old.kind having count(*)filter(where fresh.external_id is null)>0
    )q;
    select count(*),count(*)filter(where fresh.version_id is distinct from old.version_id) into previous_total,changed
      from public.legislative_run_items old join public.legislative_run_items fresh on fresh.run_id=p_run and fresh.kind='matters' and fresh.external_id=old.external_id
      where old.run_id=baseline and old.kind='matters';
    if previous_total>=10 and changed>previous_total*0.4 then
      issues=issues||jsonb_build_array(jsonb_build_object('kind','matters','reason','mass_change','changed',changed,'before',previous_total));
    end if;
  end if;
  result=result||jsonb_build_object('quality',jsonb_build_object('baseline_run_id',baseline,'blocked',jsonb_array_length(issues)>0,'issues',issues,'reviewed',false));
  update public.legislative_runs set summary=result where id=p_run;
  return result;
end $$;
revoke all on function public.legislative_finish_run(uuid) from public,anon,authenticated;
grant execute on function public.legislative_finish_run(uuid) to service_role;

alter function public.legislative_publish_run(uuid) rename to legislative_publish_run_base;
revoke all on function public.legislative_publish_run_base(uuid) from public,anon,authenticated,service_role;
create function public.legislative_publish_run(p_run uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.legislative_runs;city bigint;begin
  select * into r from public.legislative_runs where id=p_run for update;
  select city_id into city from public.legislative_sources where id=r.source_id;
  if not public.legislative_can_manage(city) and coalesce(auth.role(),'')<>'service_role' then raise exception 'Sem permissão.' using errcode='42501';end if;
  if r.summary->'quality'->>'blocked'='true' and coalesce(r.summary->'quality'->>'reviewed','false')<>'true' then
    raise exception 'A coleta tem alterações inesperadas e exige conferência antes de publicar.';
  end if;
  perform public.legislative_publish_run_base(p_run);
end $$;
revoke all on function public.legislative_publish_run(uuid) from public,anon;
grant execute on function public.legislative_publish_run(uuid) to authenticated,service_role;

create function public.legislative_review_collection(p_city bigint,p_run uuid,p_note text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.legislative_sources;r public.legislative_runs;begin
  if not public.legislative_can_manage(p_city) then raise exception 'Sem permissão.' using errcode='42501';end if;
  if length(trim(coalesce(p_note,''))) not between 20 and 2000 then raise exception 'Registre o que foi conferido na fonte oficial (20 a 2.000 caracteres).';end if;
  select * into s from public.legislative_sources where city_id=p_city;
  select * into r from public.legislative_runs where id=p_run and source_id=s.id for update;
  if r.id is null or r.status<>'ready' or coalesce(r.summary->'quality'->>'blocked','false')<>'true' then raise exception 'Coleta indisponível para esta revisão.';end if;
  update public.legislative_runs set summary=jsonb_set(summary,'{quality}',summary->'quality'||jsonb_build_object('reviewed',true,'reviewed_by',auth.uid(),'reviewed_at',now(),'note',trim(p_note))) where id=r.id;
  insert into public.legislative_decisions(source_id,action,details) values(s.id,'review_collection',jsonb_build_object('run_id',p_run,'note',trim(p_note)));
end $$;
revoke all on function public.legislative_review_collection(bigint,uuid,text) from public,anon;
grant execute on function public.legislative_review_collection(bigint,uuid,text) to authenticated;

create or replace function public.legislative_fail_job(p_job uuid,p_token uuid,p_error text,p_retry_after integer default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.legislative_jobs;begin
  select * into j from public.legislative_jobs where id=p_job for update;
  if j.lease_token is distinct from p_token then return;end if;
  update public.legislative_jobs set status=case when p_retry_after is not null and attempts<3 then 'pending' else 'failed' end,
    attempts=attempts+1,available_at=now()+make_interval(secs=>greatest(30,least(coalesce(p_retry_after,60),86400))*(attempts+1)),
    error=left(p_error,500),lease_token=null,lease_until=null where id=p_job returning * into j;
  if j.status='failed' then
    update public.legislative_runs set status='failed',error=j.error,finished_at=now() where id=j.run_id;
    update public.legislative_sources set last_error=j.error where id=(select source_id from public.legislative_runs where id=j.run_id);
  end if;
end $$;


notify pgrst,'reload schema';
commit;
