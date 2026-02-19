ALTER TABLE public_work_media
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS contributor_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_comment text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'public_work_media_status_check'
  ) THEN
    ALTER TABLE public_work_media
      ADD CONSTRAINT public_work_media_status_check
      CHECK (status IN ('pending','approved','rejected'));
  END IF;
END $$;

UPDATE public_work_media
SET status = 'approved'
WHERE status IS NULL OR status = '';

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'public_work_media'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public_work_media', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public_work_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view approved work media"
ON public_work_media
FOR SELECT
TO anon, authenticated
USING (status = 'approved');

CREATE POLICY "Contributors can view own work media"
ON public_work_media
FOR SELECT
TO authenticated
USING (contributor_id = auth.uid());

CREATE POLICY "Users can submit work media"
ON public_work_media
FOR INSERT
TO authenticated
WITH CHECK (
  contributor_id = auth.uid()
  AND status = 'pending'
);

CREATE POLICY "Admins can view all work media"
ON public_work_media
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_admin = true
  )
);

CREATE POLICY "Admins can update work media"
ON public_work_media
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_admin = true
  )
);

CREATE POLICY "Admins can delete work media"
ON public_work_media
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_admin = true
  )
);


