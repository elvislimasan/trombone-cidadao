alter table public.poles
  add column if not exists is_broken boolean not null default false;

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
      and r.status in ('pending', 'in-progress')
  )
  where p.id = p_pole_id;
end;
$$;

create or replace function public.on_reports_pole_state_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.pole_id is not null then
      perform public.refresh_pole_broken_state(old.pole_id);
    end if;
    return old;
  end if;

  if new.pole_id is not null then
    perform public.refresh_pole_broken_state(new.pole_id);
  end if;

  if tg_op = 'UPDATE' and old.pole_id is distinct from new.pole_id and old.pole_id is not null then
    perform public.refresh_pole_broken_state(old.pole_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reports_pole_state_change on public.reports;

create trigger trg_reports_pole_state_change
  after insert or update of pole_id, status, moderation_status, category_id or delete on public.reports
  for each row
  execute function public.on_reports_pole_state_change();
