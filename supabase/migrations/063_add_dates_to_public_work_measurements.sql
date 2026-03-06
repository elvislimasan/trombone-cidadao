-- Add missing date columns to public_work_measurements table
-- Run in Supabase SQL Editor or via Supabase CLI migrations

ALTER TABLE public.public_work_measurements
  ADD COLUMN IF NOT EXISTS contract_signature_date DATE,
  ADD COLUMN IF NOT EXISTS service_order_date DATE,
  ADD COLUMN IF NOT EXISTS predicted_start_date DATE,
  ADD COLUMN IF NOT EXISTS expected_end_date DATE,
  ADD COLUMN IF NOT EXISTS inauguration_date DATE,
  ADD COLUMN IF NOT EXISTS stalled_date DATE;

-- Document columns
COMMENT ON COLUMN public.public_work_measurements.contract_signature_date IS 'Data de assinatura do contrato';
COMMENT ON COLUMN public.public_work_measurements.service_order_date IS 'Data da ordem de serviço';
COMMENT ON COLUMN public.public_work_measurements.predicted_start_date IS 'Data prevista para início';
COMMENT ON COLUMN public.public_work_measurements.expected_end_date IS 'Previsão de conclusão';
COMMENT ON COLUMN public.public_work_measurements.inauguration_date IS 'Data de inauguração';
COMMENT ON COLUMN public.public_work_measurements.stalled_date IS 'Data de paralisação';
