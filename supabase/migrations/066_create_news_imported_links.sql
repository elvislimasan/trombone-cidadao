-- Rastrear links já importados para evitar duplicação
CREATE TABLE IF NOT EXISTS public.news_imported_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'blogdoelvis',
  link TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.news_imported_links ENABLE ROW LEVEL SECURITY;

-- Leitura pública
CREATE POLICY news_imported_links_select_public
  ON public.news_imported_links
  FOR SELECT
  USING (true);

-- Inserção permitida a usuários autenticados (admin/serviço vão usar service key)
CREATE POLICY news_imported_links_insert_authenticated
  ON public.news_imported_links
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.role() = 'authenticated');
