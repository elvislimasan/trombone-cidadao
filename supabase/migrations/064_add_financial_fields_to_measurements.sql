-- Add financial and scheduling fields to public_work_measurements
-- Run in Supabase SQL Editor or via Supabase CLI migrations

ALTER TABLE public.public_work_measurements
  ADD COLUMN IF NOT EXISTS expected_value NUMERIC,
  ADD COLUMN IF NOT EXISTS amount_spent NUMERIC,
  ADD COLUMN IF NOT EXISTS execution_period_days INTEGER,
  ADD COLUMN IF NOT EXISTS funding_source TEXT[];

COMMENT ON COLUMN public.public_work_measurements.expected_value IS 'Valor previsto para a fase';
COMMENT ON COLUMN public.public_work_measurements.amount_spent IS 'Valor pago na fase';
COMMENT ON COLUMN public.public_work_measurements.execution_period_days IS 'Prazo de execução desta fase (em dias)';
COMMENT ON COLUMN public.public_work_measurements.funding_source IS 'Fontes do recurso desta fase (ex.: {federal, estadual, municipal})';
