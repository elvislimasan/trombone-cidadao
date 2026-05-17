create or replace function public.sync_public_work_status_from_measurements(p_work_id uuid)
returns void
language plpgsql
as $$
declare
  v_status work_status;
  v_override uuid;
begin
  if p_work_id is null then
    return;
  end if;

  select w.current_measurement_id
    into v_override
  from public.public_works w
  where w.id = p_work_id;

  if v_override is not null then
    select m.status
      into v_status
    from public.public_work_measurements m
    where m.id = v_override;
  else
    select m.status
      into v_status
    from public.public_work_measurements m
    where m.work_id = p_work_id
    order by m.created_at desc
    limit 1;
  end if;

  update public.public_works w
     set status = coalesce(v_status, w.status, 'planned'::work_status)
   where w.id = p_work_id;
end;
$$;


create or replace function public.trg_public_works_sync_status()
returns trigger
language plpgsql
as $$
declare
  v_status work_status;
begin
  if tg_op = 'UPDATE' then
    if new.current_measurement_id is not distinct from old.current_measurement_id then
      return new;
    end if;
  end if;

  if new.current_measurement_id is not null then
    select m.status
      into v_status
    from public.public_work_measurements m
    where m.id = new.current_measurement_id;
  else
    select m.status
      into v_status
    from public.public_work_measurements m
    where m.work_id = new.id
    order by m.created_at desc
    limit 1;
  end if;

  new.status := coalesce(v_status, new.status, 'planned'::work_status);
  return new;
end;
$$;


drop trigger if exists public_works_sync_status_from_current_measurement on public.public_works;
create trigger public_works_sync_status_from_current_measurement
before insert or update of current_measurement_id on public.public_works
for each row
execute function public.trg_public_works_sync_status();


create or replace function public.trg_public_work_measurements_sync_status()
returns trigger
language plpgsql
as $$
begin
  perform public.sync_public_work_status_from_measurements(coalesce(new.work_id, old.work_id));
  return null;
end;
$$;


drop trigger if exists public_work_measurements_sync_work_status on public.public_work_measurements;
create trigger public_work_measurements_sync_work_status
after insert or update of status or delete on public.public_work_measurements
for each row
execute function public.trg_public_work_measurements_sync_status();


update public.public_works w
set status = coalesce(
  (
    select m.status::work_status
    from public.public_work_measurements m
    where m.id = w.current_measurement_id
  ),
  (
    select m.status::work_status
    from public.public_work_measurements m
    where m.work_id = w.id
    order by m.created_at desc
    limit 1
  ),
  w.status,
  'planned'::work_status
);
