
-- Add measurement_id column to public_work_media to link media to specific work phases
ALTER TABLE public.public_work_media
ADD COLUMN IF NOT EXISTS measurement_id uuid REFERENCES public.public_work_measurements(id) ON DELETE CASCADE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_public_work_media_measurement_id ON public.public_work_media(measurement_id);

-- Add comment
COMMENT ON COLUMN public.public_work_media.measurement_id IS 'ID da medição/fase a qual esta mídia pertence (opcional)';
