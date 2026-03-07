-- Cria tabela de vínculo entre notícias e obras públicas
CREATE TABLE IF NOT EXISTS public.news_public_works (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id UUID NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  work_id UUID NOT NULL REFERENCES public.public_works(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_news_public_works_news_id ON public.news_public_works(news_id);
CREATE INDEX IF NOT EXISTS idx_news_public_works_work_id ON public.news_public_works(work_id);

-- Habilita RLS
ALTER TABLE public.news_public_works ENABLE ROW LEVEL SECURITY;

-- Políticas de leitura pública
CREATE POLICY news_public_works_select_public
  ON public.news_public_works
  FOR SELECT
  USING (true);

-- Inserção apenas por usuários autenticados
CREATE POLICY news_public_works_insert_authenticated
  ON public.news_public_works
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

-- Atualização e exclusão somente admins
CREATE POLICY news_public_works_update_admin
  ON public.news_public_works
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY news_public_works_delete_admin
  ON public.news_public_works
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
