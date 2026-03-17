ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS rejection_title text,
  ADD COLUMN IF NOT EXISTS rejection_description text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

