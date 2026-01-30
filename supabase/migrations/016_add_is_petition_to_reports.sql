-- Add is_petition column to reports table
ALTER TABLE reports 
ADD COLUMN IF NOT EXISTS is_petition BOOLEAN DEFAULT FALSE;

-- Update RLS to allow admins to update this column (assuming existing update policies cover it or are permissive for owners/admins)
-- If we need a specific policy for transforming:
-- CREATE POLICY "Admins can update is_petition" ON reports FOR UPDATE USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));
-- For now, we rely on existing update policies.

-- Comment on column
COMMENT ON COLUMN reports.is_petition IS 'Indicates if the report has been transformed into a petition/abaixo-assinado';
