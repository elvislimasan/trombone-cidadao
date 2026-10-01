begin;

-- Runs after zzzz_validate_municipal_report_author has checked municipal access
-- and set moderation_status according to the chosen visibility. Older triggers
-- also write pending_approval into the operational status, hiding these records
-- from the municipal Pending list even when moderation_status is correct.
create or replace function public.normalize_municipal_report_status()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.created_by_municipality is not null
     and new.moderation_status in ('approved', 'internal')
     and new.status = 'pending_approval' then
    new.status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists zzzzz_normalize_municipal_report_status on public.reports;
create trigger zzzzz_normalize_municipal_report_status
  before insert or update on public.reports
  for each row execute function public.normalize_municipal_report_status();

-- Preserve visibility and all operational statuses that have already advanced.
update public.reports
set status = 'pending'
where created_by_municipality is not null
  and moderation_status in ('approved', 'internal')
  and status = 'pending_approval';

notify pgrst, 'reload schema';
commit;
