-- 141_public_works_city_id.sql
-- Nacionalização de obras públicas: associa cada obra a um município.
alter table public.public_works
  add column if not exists city_id bigint references public.cities(id);

create index if not exists idx_public_works_city_id
  on public.public_works (city_id);

notify pgrst, 'reload schema';
