begin;
-- Floresta's ballot result catalogue includes the real external ID 0.
alter table public.legislative_versions drop constraint legislative_versions_external_id_check;
alter table public.legislative_versions add constraint legislative_versions_external_id_check check(external_id>=0);

create function public.legislative_resume_run(p_run uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.legislative_runs;begin
  select * into r from public.legislative_runs where id=p_run for update;
  if r.status<>'failed' or not exists(select 1 from public.legislative_sources where id=r.source_id and enabled) then raise exception 'Coleta não pode ser retomada.';end if;
  if exists(select 1 from public.legislative_runs where source_id=r.source_id and status='running') then raise exception 'Já existe uma coleta em andamento.';end if;
  update public.legislative_jobs set status='pending',attempts=0,error=null,available_at=now(),lease_token=null,lease_until=null where run_id=r.id and status='failed';
  update public.legislative_runs set status='running',finished_at=null,error=null where id=r.id;
end $$;
revoke all on function public.legislative_resume_run(uuid) from public,anon,authenticated;
grant execute on function public.legislative_resume_run(uuid) to service_role;
notify pgrst,'reload schema';
commit;
