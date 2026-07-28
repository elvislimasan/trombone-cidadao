-- 151_pavement_streets_city_id.sql
-- Nacionaliza pavimentação: pavement_streets ganha city_id próprio
-- (denormalizado, não só via join com bairros), seguindo o padrão de
-- public_works e rental_properties. Backfill resolve a cidade de cada
-- rua a partir do bairro já vinculado (bairros já tem city_id desde a
-- migration 144 — todas as ruas existentes em dev são de Floresta-PE).

alter table public.pavement_streets
  add column if not exists city_id bigint references public.cities(id);

update public.pavement_streets s
set city_id = b.city_id
from public.bairros b
where s.bairro_id = b.id
  and s.city_id is null;

create index if not exists idx_pavement_streets_city_id on public.pavement_streets (city_id);

notify pgrst, 'reload schema';
