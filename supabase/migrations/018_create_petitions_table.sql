-- Create petitions table
CREATE TABLE IF NOT EXISTS petitions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  goal INTEGER DEFAULT 100,
  deadline TIMESTAMP WITH TIME ZONE,
  image_url TEXT,
  report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
  author_id UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'open', -- open, closed, victory
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for petitions
ALTER TABLE petitions ENABLE ROW LEVEL SECURITY;

-- Policies for petitions
DROP POLICY IF EXISTS "Public petitions are viewable by everyone" ON petitions;
CREATE POLICY "Public petitions are viewable by everyone" 
ON petitions FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Admins can insert petitions" ON petitions;
CREATE POLICY "Admins can insert petitions" 
ON petitions FOR INSERT 
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM profiles WHERE is_admin = true
  )
);

DROP POLICY IF EXISTS "Admins can update petitions" ON petitions;
CREATE POLICY "Admins can update petitions" 
ON petitions FOR UPDATE 
USING (
  auth.uid() IN (
    SELECT id FROM profiles WHERE is_admin = true
  )
);

DROP POLICY IF EXISTS "Admins can delete petitions" ON petitions;
CREATE POLICY "Admins can delete petitions" 
ON petitions FOR DELETE 
USING (
  auth.uid() IN (
    SELECT id FROM profiles WHERE is_admin = true
  )
);

-- Add petition_id to signatures table
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS petition_id UUID REFERENCES petitions(id) ON DELETE CASCADE;

-- Make report_id nullable since signatures can now be for petitions
ALTER TABLE signatures ALTER COLUMN report_id DROP NOT NULL;

-- Ensure signature belongs to either a report or a petition
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signatures_target_check') THEN
    ALTER TABLE signatures ADD CONSTRAINT signatures_target_check CHECK (report_id IS NOT NULL OR petition_id IS NOT NULL);
  END IF;
END $$;

-- Update signatures policies to allow signing petitions
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

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_petitions_report_id ON petitions(report_id);
CREATE INDEX IF NOT EXISTS idx_signatures_petition_id ON petitions(id);
