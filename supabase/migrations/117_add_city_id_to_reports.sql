-- 117: adiciona city_id em reports
-- Idempotente: ADD COLUMN IF NOT EXISTS; CREATE INDEX IF NOT EXISTS.
-- Não muda RLS. city_id nasce NULL; preenchido pelo backfill da Fase 0
-- e pelo insert na Fase 1.

alter table public.reports
  add column if not exists city_id bigint references public.cities(id);

create index if not exists idx_reports_city_id
  on public.reports (city_id);

notify pgrst, 'reload schema';
