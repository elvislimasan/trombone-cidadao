-- Add promo_modal_settings column to site_config table
ALTER TABLE site_config 
ADD COLUMN IF NOT EXISTS promo_modal_settings JSONB DEFAULT '{
  "petitions_modal": {
    "enabled": false,
    "title": "",
    "description": "",
    "badge_text": "",
    "image_url": "",
    "primary_button_text": "",
    "primary_button_url": "",
    "secondary_button_text": "",
    "secondary_button_url": "",
    "dismiss_text": "Fechar"
  }
}'::jsonb;

-- Create bucket for promo modal images if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('promo-images', 'promo-images', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Public read access for promo-images" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload access for promo-images" ON storage.objects;
DROP POLICY IF EXISTS "Admin update access for promo-images" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete access for promo-images" ON storage.objects;

-- Allow public read access to promo-images bucket
CREATE POLICY "Public read access for promo-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'promo-images');

-- Allow authenticated users (admins) to upload to promo-images bucket
CREATE POLICY "Admin upload access for promo-images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'promo-images' 
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND is_admin = true
  )
);

-- Allow admins to update promo-images
CREATE POLICY "Admin update access for promo-images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'promo-images' 
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND is_admin = true
  )
);

-- Allow admins to delete promo-images
CREATE POLICY "Admin delete access for promo-images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'promo-images' 
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND is_admin = true
  )
);
