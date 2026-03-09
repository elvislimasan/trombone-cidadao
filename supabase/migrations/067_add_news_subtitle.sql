-- Adiciona campo 'subtitle' à tabela de notícias
ALTER TABLE public.news
ADD COLUMN IF NOT EXISTS subtitle TEXT;

-- Atualiza políticas RLS se necessário (sem alterações aqui, apenas assegurando leitura pública)
-- A leitura já deve estar coberta pelas políticas existentes da tabela public.news

