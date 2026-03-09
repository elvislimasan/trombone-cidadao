-- Cria tabela de vínculo entre notícias e petições
CREATE TABLE IF NOT EXISTS public.news_petitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  news_id UUID NOT NULL REFERENCES public.news(id) ON DELETE CASCADE,
  petition_id UUID NOT NULL REFERENCES public.petitions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_news_petitions_news_id ON public.news_petitions(news_id);
CREATE INDEX IF NOT EXISTS idx_news_petitions_petition_id ON public.news_petitions(petition_id);

-- Habilita RLS
ALTER TABLE public.news_petitions ENABLE ROW LEVEL SECURITY;

-- Políticas de leitura pública
CREATE POLICY news_petitions_select_public
  ON public.news_petitions
  FOR SELECT
  USING (true);

-- Inserção apenas por usuários autenticados (admins e editores)
CREATE POLICY news_petitions_insert_authenticated
  ON public.news_petitions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

-- Atualização e exclusão somente admins
CREATE POLICY news_petitions_update_admin
  ON public.news_petitions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

CREATE POLICY news_petitions_delete_admin
  ON public.news_petitions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );
