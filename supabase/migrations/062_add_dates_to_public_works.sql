-- Add missing date columns to public_works table
-- Run in Supabase SQL Editor or via Supabase CLI migrations

ALTER TABLE public.public_works
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS inauguration_date DATE,
  ADD COLUMN IF NOT EXISTS service_order_date DATE,
  ADD COLUMN IF NOT EXISTS expected_end_date DATE,
  ADD COLUMN IF NOT EXISTS contract_signature_date DATE,
  ADD COLUMN IF NOT EXISTS predicted_start_date DATE,
  ADD COLUMN IF NOT EXISTS stalled_date DATE;

-- Optional: document columns
COMMENT ON COLUMN public.public_works.end_date IS 'Data de término real da obra';
COMMENT ON COLUMN public.public_works.start_date IS 'Data de início real da obra';
COMMENT ON COLUMN public.public_works.inauguration_date IS 'Data de inauguração da obra';
COMMENT ON COLUMN public.public_works.service_order_date IS 'Data da ordem de serviço';
COMMENT ON COLUMN public.public_works.expected_end_date IS 'Previsão de conclusão';
COMMENT ON COLUMN public.public_works.contract_signature_date IS 'Data de assinatura do contrato';
COMMENT ON COLUMN public.public_works.predicted_start_date IS 'Data prevista para início';
COMMENT ON COLUMN public.public_works.stalled_date IS 'Data de paralisação da obra';
