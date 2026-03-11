-- Tabela de notícias relacionadas (muitas-para-muitas entre notícias)
CREATE TABLE IF NOT EXISTS public.news_related (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id UUID NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  related_news_id UUID NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_news_relation UNIQUE (news_id, related_news_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_news_related_news_id ON public.news_related(news_id);
CREATE INDEX IF NOT EXISTS idx_news_related_related_id ON public.news_related(related_news_id);

-- RLS
ALTER TABLE public.news_related ENABLE ROW LEVEL SECURITY;

-- Leitura pública
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'news_related' 
      AND policyname = 'news_related_select_public'
  ) THEN
    CREATE POLICY news_related_select_public
      ON public.news_related
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- Inserção autenticada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'news_related' 
      AND policyname = 'news_related_insert_authenticated'
  ) THEN
    CREATE POLICY news_related_insert_authenticated
      ON public.news_related
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Atualização restrita a admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'news_related' 
      AND policyname = 'news_related_update_admin'
  ) THEN
    CREATE POLICY news_related_update_admin
      ON public.news_related
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

-- Exclusão restrita a admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'news_related' 
      AND policyname = 'news_related_delete_admin'
  ) THEN
    CREATE POLICY news_related_delete_admin
      ON public.news_related
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
