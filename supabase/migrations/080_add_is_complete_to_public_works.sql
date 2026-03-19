alter table public.public_works
add column if not exists is_complete boolean not null default false;

update public.public_works w
set is_complete = true
where exists (
  select 1
  from public.public_work_measurements m
  where m.work_id = w.id
);
