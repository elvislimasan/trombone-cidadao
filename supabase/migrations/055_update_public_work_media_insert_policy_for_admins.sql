DROP POLICY IF EXISTS "Users can submit work media" ON public_work_media;

CREATE POLICY "Users can submit work media"
ON public_work_media
FOR INSERT
TO authenticated
WITH CHECK (
  contributor_id = auth.uid()
  AND (
    status = 'pending'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND is_admin = true
    )
  )
);

