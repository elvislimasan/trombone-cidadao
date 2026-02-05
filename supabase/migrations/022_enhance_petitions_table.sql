-- Enhance petitions table for rich content and customization
ALTER TABLE petitions 
ADD COLUMN IF NOT EXISTS gallery TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS content TEXT,
ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS layout_config JSONB DEFAULT '{}';

-- Create a storage bucket for petition images if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('petition-images', 'petition-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow authenticated users to upload images (we can restrict to authors later via RLS on objects)
DROP POLICY IF EXISTS "Users can upload petition images" ON storage.objects;
CREATE POLICY "Users can upload petition images" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'petition-images' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Anyone can view petition images" ON storage.objects;
CREATE POLICY "Anyone can view petition images" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'petition-images');

DROP POLICY IF EXISTS "Users can update their own petition images" ON storage.objects;
CREATE POLICY "Users can update their own petition images" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'petition-images' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Users can delete their own petition images" ON storage.objects;
CREATE POLICY "Users can delete their own petition images" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'petition-images' AND auth.uid() = owner);
