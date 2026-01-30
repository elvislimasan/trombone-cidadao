-- Fix signatures table constraints to allow petition signatures
-- Run this in Supabase SQL Editor

-- 1. Make report_id nullable
ALTER TABLE signatures ALTER COLUMN report_id DROP NOT NULL;

-- 2. Ensure petition_id column exists (safeguard)
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS petition_id UUID REFERENCES petitions(id) ON DELETE CASCADE;

-- 3. Add constraint to ensure either report_id or petition_id is present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signatures_target_check') THEN
    ALTER TABLE signatures ADD CONSTRAINT signatures_target_check CHECK (report_id IS NOT NULL OR petition_id IS NOT NULL);
  END IF;
END $$;

-- 4. Update policies to allow signing petitions
DROP POLICY IF EXISTS "Users can insert their own signatures" ON signatures;
CREATE POLICY "Users can insert their own signatures" 
ON signatures FOR INSERT 
WITH CHECK (
  auth.uid() = user_id
);

DROP POLICY IF EXISTS "Users can delete their own signatures" ON signatures;
CREATE POLICY "Users can delete their own signatures" 
ON signatures FOR DELETE 
USING (
  auth.uid() = user_id
);
