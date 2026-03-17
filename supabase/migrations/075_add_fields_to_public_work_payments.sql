ALTER TABLE public.public_work_payments
  ADD COLUMN IF NOT EXISTS commitment_number TEXT,
  ADD COLUMN IF NOT EXISTS payment_description TEXT,
  ADD COLUMN IF NOT EXISTS installment TEXT,
  ADD COLUMN IF NOT EXISTS creditor_name TEXT;

COMMENT ON COLUMN public.public_work_payments.commitment_number IS 'Número de empenho';
COMMENT ON COLUMN public.public_work_payments.payment_description IS 'Descrição do pagamento';
COMMENT ON COLUMN public.public_work_payments.installment IS 'Identificador de parcela (ex.: 1/3, parcela 2)';
COMMENT ON COLUMN public.public_work_payments.creditor_name IS 'Credor do pagamento';
