-- 118: adiciona city_id em profiles
-- Idempotente: ADD COLUMN IF NOT EXISTS; CREATE INDEX IF NOT EXISTS.
-- profiles.city (texto livre) PERMANECE — nada que o lê quebra.
-- city_id nasce NULL; preenchido pelo backfill da Fase 0.

alter table public.profiles
  add column if not exists city_id bigint references public.cities(id);

create index if not exists idx_profiles_city_id
  on public.profiles (city_id);

notify pgrst, 'reload schema';
