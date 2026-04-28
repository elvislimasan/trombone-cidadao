create or replace function public.notify_admins_new_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.moderation_status = 'pending_approval' then
    insert into public.notifications (user_id, type, title, message, report_id, is_read, created_at)
    select
      ma.user_id,
      'moderation_required',
      'Moderação de bronca',
      'Uma nova bronca foi cadastrada e aguarda moderação: "' || coalesce(new.title, 'Sem título') || '"',
      new.id,
      false,
      now()
    from public.moderation_admins ma;
  end if;

  return new;
end;
$$;
