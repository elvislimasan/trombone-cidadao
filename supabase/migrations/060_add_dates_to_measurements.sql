-- Add date columns to public_work_measurements
ALTER TABLE public.public_work_measurements
ADD COLUMN IF NOT EXISTS predicted_start_date date,
ADD COLUMN IF NOT EXISTS service_order_date date,
ADD COLUMN IF NOT EXISTS contract_signature_date date, -- specialized contract date
ADD COLUMN IF NOT EXISTS expected_end_date date,
ADD COLUMN IF NOT EXISTS inauguration_date date,
ADD COLUMN IF NOT EXISTS stalled_date date;

-- Add comment to explain usage
COMMENT ON COLUMN public.public_work_measurements.contract_signature_date IS 'Data de assinatura do contrato específico desta fase';
COMMENT ON COLUMN public.public_work_measurements.expected_end_date IS 'Previsão de conclusão desta fase';
