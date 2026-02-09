-- Allow authors to update their own petitions
-- This is necessary for the "Create Petition" flow where users create a draft and then edit it
-- And for users to edit their own petitions

DROP POLICY IF EXISTS "Authors can update their own petitions" ON petitions;

CREATE POLICY "Authors can update their own petitions" 
ON petitions FOR UPDATE 
USING (
  auth.uid() = author_id
)
WITH CHECK (
  auth.uid() = author_id
);
