ALTER TABLE public.public_work_media
ADD COLUMN IF NOT EXISTS gallery_name TEXT;

COMMENT ON COLUMN public.public_work_media.gallery_name IS 'Nome da galeria para agrupar mídias (fotos/vídeos)';
