-- FIX_ADMIN_RLS.sql

-- 1. Create a secure function to check admin status (bypassing RLS)
-- This avoids infinite recursion when querying the profiles table
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update RLS Policies to use the secure function

-- Reports: Allow Admins to View, Update, and Delete everything
DROP POLICY IF EXISTS "Admins can view all reports" ON reports;
CREATE POLICY "Admins can view all reports"
ON reports FOR SELECT
TO authenticated
USING (
  public.is_admin()
);

DROP POLICY IF EXISTS "Admins can update all reports" ON reports;
CREATE POLICY "Admins can update all reports"
ON reports FOR UPDATE
TO authenticated
USING (
  public.is_admin()
);

DROP POLICY IF EXISTS "Admins can delete all reports" ON reports;
CREATE POLICY "Admins can delete all reports"
ON reports FOR DELETE
TO authenticated
USING (
  public.is_admin()
);

-- Profiles: Ensure admins can see author details (name, avatar)
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (
  public.is_admin()
);

-- 3. DATA REPAIR: Fix existing reports with missing moderation_status
-- This ensures reports created before the fix appear in moderation
UPDATE reports 
SET moderation_status = 'pending_approval' 
WHERE moderation_status IS NULL OR moderation_status = '';

-- 4. Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
