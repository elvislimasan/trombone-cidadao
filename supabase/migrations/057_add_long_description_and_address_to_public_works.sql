-- Add long_description and address columns to public_works table
-- Run in Supabase SQL Editor or via Supabase CLI migrations

ALTER TABLE public.public_works
  ADD COLUMN IF NOT EXISTS long_description TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Optional: document columns
COMMENT ON COLUMN public.public_works.long_description IS 'Descrição longa e detalhada da obra';
COMMENT ON COLUMN public.public_works.address IS 'Endereço completo ou localização por extenso da obra';
