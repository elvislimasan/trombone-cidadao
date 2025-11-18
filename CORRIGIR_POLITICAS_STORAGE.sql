-- Script para corrigir políticas RLS do bucket news-images
-- Execute este SQL no Supabase SQL Editor

-- Primeiro, remover políticas antigas se existirem (para news-media ou outras versões)
DROP POLICY IF EXISTS "news_image_upload_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "news_image_read_public" ON storage.objects;
DROP POLICY IF EXISTS "news_image_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "news_image_delete_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "news_media_upload_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "news_media_read_public" ON storage.objects;
DROP POLICY IF EXISTS "news_media_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "news_media_delete_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "new_images_upload_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "new_images_read_public" ON storage.objects;
DROP POLICY IF EXISTS "new_images_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "new_images_delete_authenticated" ON storage.objects;

-- Criar novas políticas para o bucket news-images
CREATE POLICY "news_image_upload_authenticated" ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'news-images' 
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "news_image_read_public" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'news-images');

CREATE POLICY "news_image_update_authenticated" ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'news-images' 
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "news_image_delete_authenticated" ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'news-images' 
        AND auth.role() = 'authenticated'
    );


