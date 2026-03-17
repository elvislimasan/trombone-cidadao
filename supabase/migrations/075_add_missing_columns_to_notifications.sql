ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS report_id uuid REFERENCES public.reports(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS work_id uuid REFERENCES public.public_works(id) ON DELETE CASCADE;

