-- 154_services_city_id.sql
-- Nacionaliza o Guia de Serviços: transport, tourist_spots e directory
-- ganham city_id próprio, seguindo o padrão de public_works/rental_properties/
-- pavement_streets. Backfill: todos os registros existentes em dev são de
-- Floresta-PE (id 64), único município antes da nacionalização.

alter table public.transport
  add column if not exists city_id bigint references public.cities(id);
alter table public.tourist_spots
  add column if not exists city_id bigint references public.cities(id);
alter table public.directory
  add column if not exists city_id bigint references public.cities(id);

update public.transport set city_id = 64 where city_id is null;
update public.tourist_spots set city_id = 64 where city_id is null;
update public.directory set city_id = 64 where city_id is null;

create index if not exists idx_transport_city_id on public.transport (city_id);
create index if not exists idx_tourist_spots_city_id on public.tourist_spots (city_id);
create index if not exists idx_directory_city_id on public.directory (city_id);

notify pgrst, 'reload schema';
