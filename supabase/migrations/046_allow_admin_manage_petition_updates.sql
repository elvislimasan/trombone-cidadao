-- Allow admins to manage petition updates in addition to authors

-- Insert
DROP POLICY IF EXISTS "Authors can insert updates" ON petition_updates;
CREATE POLICY "Authors and admins can insert updates"
ON petition_updates FOR INSERT
WITH CHECK (
  auth.uid() IN (SELECT author_id FROM petitions WHERE id = petition_id)
  OR auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
);

-- Update
DROP POLICY IF EXISTS "Authors can update updates" ON petition_updates;
CREATE POLICY "Authors and admins can update updates"
ON petition_updates FOR UPDATE
USING (
  auth.uid() IN (SELECT author_id FROM petitions WHERE id = petition_id)
  OR auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
);

-- Delete
DROP POLICY IF EXISTS "Authors can delete updates" ON petition_updates;
CREATE POLICY "Authors and admins can delete updates"
ON petition_updates FOR DELETE
USING (
  auth.uid() IN (SELECT author_id FROM petitions WHERE id = petition_id)
  OR auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
);

