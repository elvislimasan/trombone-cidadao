-- Tabela de vínculo entre notícias e broncas (reports)
CREATE TABLE IF NOT EXISTS public.news_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id UUID NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_news_reports_news_id ON public.news_reports(news_id);
CREATE INDEX IF NOT EXISTS idx_news_reports_report_id ON public.news_reports(report_id);

-- RLS
ALTER TABLE public.news_reports ENABLE ROW LEVEL SECURITY;

-- Política de leitura pública (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'news_reports' 
      AND policyname = 'news_reports_select_public'
  ) THEN
    CREATE POLICY news_reports_select_public
      ON public.news_reports
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- Inserção por usuários autenticados (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'news_reports' 
      AND policyname = 'news_reports_insert_authenticated'
  ) THEN
    CREATE POLICY news_reports_insert_authenticated
      ON public.news_reports
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Atualização restrita a admins (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'news_reports' 
      AND policyname = 'news_reports_update_admin'
  ) THEN
    CREATE POLICY news_reports_update_admin
      ON public.news_reports
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND profiles.is_admin = true
        )
      );
  END IF;
END $$;

-- Exclusão restrita a admins (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'news_reports' 
      AND policyname = 'news_reports_delete_admin'
  ) THEN
    CREATE POLICY news_reports_delete_admin
      ON public.news_reports
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND profiles.is_admin = true
        )
      );
  END IF;
END $$;
