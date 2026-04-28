create or replace function public.notify_admins_new_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.moderation_status = 'pending_approval' then
    insert into public.notifications (user_id, type, message, report_id, is_read, created_at)
    select
      ma.user_id,
      'moderation_required',
      'Nova bronca enviada' || case when new.protocol is not null then ' (' || new.protocol || ')' else '' end || ' precisa de moderação.',
      new.id,
      false,
      now()
    from public.moderation_admins ma;
  end if;

  return new;
end;
$$;

drop trigger if exists on_report_insert_notify_admins on public.reports;

create trigger on_report_insert_notify_admins
after insert on public.reports
for each row
execute function public.notify_admins_new_report();

