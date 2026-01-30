CREATE TABLE IF NOT EXISTS petition_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  petition_id UUID REFERENCES petitions(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- RLS
ALTER TABLE petition_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authors and admins can view versions" ON petition_versions;
CREATE POLICY "Authors and admins can view versions" ON petition_versions
  FOR SELECT USING (
    auth.uid() IN (SELECT author_id FROM petitions WHERE id = petition_versions.petition_id)
    OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Authors and admins can insert versions" ON petition_versions;
CREATE POLICY "Authors and admins can insert versions" ON petition_versions
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT author_id FROM petitions WHERE id = petition_versions.petition_id)
    OR 
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );
