-- Allow authenticated users to insert into petitions table
-- This is necessary for the "Create Petition" feature to work for regular users

DROP POLICY IF EXISTS "Authenticated users can create petitions" ON petitions;

CREATE POLICY "Authenticated users can create petitions" 
ON petitions FOR INSERT 
WITH CHECK (
  auth.role() = 'authenticated' AND 
  auth.uid() = author_id
);
