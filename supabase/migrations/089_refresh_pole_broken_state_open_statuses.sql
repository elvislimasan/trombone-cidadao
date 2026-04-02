create or replace function public.refresh_pole_broken_state(p_pole_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.poles p
  set is_broken = exists (
    select 1
    from public.reports r
    where r.pole_id = p_pole_id
      and r.category_id = 'iluminacao'
      and r.moderation_status <> 'rejected'
      and r.status <> 'duplicate'
      and r.status in ('pending', 'in-progress', 'pending_approval', 'pending_resolution')
  )
  where p.id = p_pole_id;
end;
$$;

update public.poles p
set is_broken = exists (
  select 1
  from public.reports r
  where r.pole_id = p.id
    and r.category_id = 'iluminacao'
    and r.moderation_status <> 'rejected'
    and r.status <> 'duplicate'
    and r.status in ('pending', 'in-progress', 'pending_approval', 'pending_resolution')
);

