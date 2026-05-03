alter table public.public_works
  add column if not exists current_measurement_id uuid
  references public.public_work_measurements(id)
  on delete set null;

