-- Add featured flag and views counter to reports

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0;

-- Optional index to quickly filter featured reports
CREATE INDEX IF NOT EXISTS idx_reports_is_featured ON public.reports (is_featured) WHERE is_featured = true;

-- Optional index for sorting/filtering by views
CREATE INDEX IF NOT EXISTS idx_reports_views ON public.reports (views DESC);

