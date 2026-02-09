-- Migration to add moderation support for petitions

-- 1. Update RLS policies for petitions table
-- Drop existing policies to redefine them
DROP POLICY IF EXISTS "Public petitions are viewable by everyone" ON petitions;
DROP POLICY IF EXISTS "Public can view open petitions" ON petitions;

-- Policy for public: Only view 'open' (approved) petitions
CREATE POLICY "Public can view open petitions" 
ON petitions FOR SELECT 
USING (status = 'open' OR status = 'victory' OR status = 'closed');

-- Policy for authors: Can view their own petitions regardless of status
DROP POLICY IF EXISTS "Authors can view own petitions" ON petitions;
CREATE POLICY "Authors can view own petitions" 
ON petitions FOR SELECT 
USING (auth.uid() = author_id);

-- Policy for admins: Can view all petitions
DROP POLICY IF EXISTS "Admins can view all petitions" ON petitions;
CREATE POLICY "Admins can view all petitions" 
ON petitions FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- Ensure admins can update any petition (for moderation)
DROP POLICY IF EXISTS "Admins can update petitions" ON petitions;
CREATE POLICY "Admins can update petitions" 
ON petitions FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  )
);
