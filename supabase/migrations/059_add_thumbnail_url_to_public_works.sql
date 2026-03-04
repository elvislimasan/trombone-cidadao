-- Add thumbnail_url column to public_works table
-- Run in Supabase SQL Editor or via Supabase CLI migrations

ALTER TABLE public.public_works
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Optional: document column
COMMENT ON COLUMN public.public_works.thumbnail_url IS 'URL da imagem de capa (thumbnail) da obra para listagens e compartilhamento';
