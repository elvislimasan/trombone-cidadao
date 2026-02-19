ALTER TABLE public.public_works
  ADD COLUMN IF NOT EXISTS predicted_start_date DATE;

COMMENT ON COLUMN public.public_works.predicted_start_date IS 'Data prevista para início da obra';

