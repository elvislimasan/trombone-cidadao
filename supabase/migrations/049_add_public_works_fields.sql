-- Ensure additional fields exist on public_works for richer metadata
-- Run in Supabase SQL Editor or via Supabase CLI migrations

ALTER TABLE public.public_works
  ADD COLUMN IF NOT EXISTS contract_signature_date DATE,
  ADD COLUMN IF NOT EXISTS stalled_date DATE,
  ADD COLUMN IF NOT EXISTS parliamentary_amendment JSONB,
  ADD COLUMN IF NOT EXISTS other_details TEXT,
  ADD COLUMN IF NOT EXISTS last_update TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS funding_source TEXT[],
  ADD COLUMN IF NOT EXISTS related_links JSONB,
  ADD COLUMN IF NOT EXISTS execution_period_days INTEGER,
  ADD COLUMN IF NOT EXISTS amount_spent NUMERIC;

-- Optional: document columns
COMMENT ON COLUMN public.public_works.contract_signature_date IS 'Data da assinatura do contrato';
COMMENT ON COLUMN public.public_works.stalled_date IS 'Data em que a obra foi paralisada';
COMMENT ON COLUMN public.public_works.parliamentary_amendment IS 'Informações sobre emenda parlamentar: { "has": boolean, "author": string }';
COMMENT ON COLUMN public.public_works.other_details IS 'Observações ou informações adicionais';
COMMENT ON COLUMN public.public_works.last_update IS 'Data/hora da última atualização registrada para a obra';
COMMENT ON COLUMN public.public_works.funding_source IS 'Fontes de recurso (ex.: {federal, estadual, municipal})';
COMMENT ON COLUMN public.public_works.related_links IS 'Links relacionados: [{"title":"...","url":"..."}]';
COMMENT ON COLUMN public.public_works.execution_period_days IS 'Prazo total de execução, em dias';
COMMENT ON COLUMN public.public_works.amount_spent IS 'Valor gasto até o momento';
