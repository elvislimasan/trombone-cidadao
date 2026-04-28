create table if not exists public.moderation_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.moderation_admins enable row level security;

revoke all on table public.moderation_admins from anon, authenticated;

do $$
declare
  v_admin_count integer;
begin
  select count(*) into v_admin_count
  from public.profiles
  where is_admin is true;

  if v_admin_count > 0 and v_admin_count <= 50 then
    insert into public.moderation_admins (user_id)
    select id
    from public.profiles
    where is_admin is true
    on conflict (user_id) do nothing;
  end if;
end $$;

create or replace function public.notify_admins_new_work_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    insert into public.notifications (user_id, type, message, work_id, is_read, created_at)
    select
      ma.user_id,
      'moderation_required',
      'Nova mídia enviada para a obra "' || coalesce(w.title, 'Obra') || '" precisa de moderação.',
      new.work_id,
      false,
      now()
    from public.moderation_admins ma
    join public.public_works w on w.id = new.work_id;
  end if;

  return new;
end;
$$;

