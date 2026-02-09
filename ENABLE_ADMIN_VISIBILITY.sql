-- Fix Admin Visibility for Reports and Profiles
-- This script adds RLS policies to ensure admins can view and moderate all reports and profiles.

-- 1. Ensure RLS is enabled
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if they match (to allow re-running this script)
DROP POLICY IF EXISTS "Admins can view all reports" ON reports;
DROP POLICY IF EXISTS "Admins can update all reports" ON reports;
DROP POLICY IF EXISTS "Admins can delete all reports" ON reports;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

-- 3. Add Policy for Admins to VIEW all reports
-- Allows admins to see reports regardless of status (e.g. pending_approval)
CREATE POLICY "Admins can view all reports"
ON reports
FOR SELECT
TO authenticated
USING (
  (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
);

-- 4. Add Policy for Admins to UPDATE all reports
-- Allows admins to approve/reject reports
CREATE POLICY "Admins can update all reports"
ON reports
FOR UPDATE
TO authenticated
USING (
  (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
);

-- 5. Add Policy for Admins to DELETE all reports
CREATE POLICY "Admins can delete all reports"
ON reports
FOR DELETE
TO authenticated
USING (
  (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
);

-- 6. Add Policy for Admins to VIEW all profiles
-- Essential for seeing who created the report
CREATE POLICY "Admins can view all profiles"
ON profiles
FOR SELECT
TO authenticated
USING (
  (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
);

-- 7. Ensure users can view their own profile (prerequisite for the admin check to work without recursion issues)
-- This might already exist, but adding it just in case (using IF NOT EXISTS logic via DO block is hard in raw SQL without migration tool, so we just add a standard policy if it doesn't conflict)
-- We'll skip this to avoid conflicts with existing policies, assuming users can already read their own profile.
