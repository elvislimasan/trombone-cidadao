-- Migration: Allow multiple works, petitions and reports related to news
-- This migration modifies the existing tables to allow multiple related items

-- Drop existing foreign keys and constraints if they exist
ALTER TABLE news_public_works DROP CONSTRAINT IF EXISTS news_public_works_news_id_fkey;
ALTER TABLE news_public_works DROP CONSTRAINT IF EXISTS news_public_works_work_id_fkey;

ALTER TABLE news_petitions DROP CONSTRAINT IF EXISTS news_petitions_news_id_fkey;
ALTER TABLE news_petitions DROP CONSTRAINT IF EXISTS news_petitions_petition_id_fkey;

ALTER TABLE news_reports DROP CONSTRAINT IF EXISTS news_reports_news_id_fkey;
ALTER TABLE news_reports DROP CONSTRAINT IF EXISTS news_reports_report_id_fkey;

-- Add unique constraint to prevent duplicate relationships
ALTER TABLE news_public_works ADD CONSTRAINT news_public_works_unique UNIQUE (news_id, work_id);
ALTER TABLE news_petitions ADD CONSTRAINT news_petitions_unique UNIQUE (news_id, petition_id);
ALTER TABLE news_reports ADD CONSTRAINT news_reports_unique UNIQUE (news_id, report_id);

-- Add foreign keys with proper constraints
ALTER TABLE news_public_works 
  ADD CONSTRAINT news_public_works_news_id_fkey 
  FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE;

ALTER TABLE news_public_works 
  ADD CONSTRAINT news_public_works_work_id_fkey 
  FOREIGN KEY (work_id) REFERENCES public_works(id) ON DELETE CASCADE;

ALTER TABLE news_petitions 
  ADD CONSTRAINT news_petitions_news_id_fkey 
  FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE;

ALTER TABLE news_petitions 
  ADD CONSTRAINT news_petitions_petition_id_fkey 
  FOREIGN KEY (petition_id) REFERENCES petitions(id) ON DELETE CASCADE;

ALTER TABLE news_reports 
  ADD CONSTRAINT news_reports_news_id_fkey 
  FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE;

ALTER TABLE news_reports 
  ADD CONSTRAINT news_reports_report_id_fkey 
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE;

-- Enable RLS if not already enabled
ALTER TABLE news_public_works ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_petitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_reports ENABLE ROW LEVEL SECURITY;

-- Create policies for news_public_works
DROP POLICY IF EXISTS "news_public_works_select" ON news_public_works;
CREATE POLICY "news_public_works_select" ON news_public_works FOR SELECT USING (true);

DROP POLICY IF EXISTS "news_public_works_insert" ON news_public_works;
CREATE POLICY "news_public_works_insert" ON news_public_works FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "news_public_works_update" ON news_public_works;
CREATE POLICY "news_public_works_update" ON news_public_works FOR UPDATE USING (true);

DROP POLICY IF EXISTS "news_public_works_delete" ON news_public_works;
CREATE POLICY "news_public_works_delete" ON news_public_works FOR DELETE USING (true);

-- Create policies for news_petitions
DROP POLICY IF EXISTS "news_petitions_select" ON news_petitions;
CREATE POLICY "news_petitions_select" ON news_petitions FOR SELECT USING (true);

DROP POLICY IF EXISTS "news_petitions_insert" ON news_petitions;
CREATE POLICY "news_petitions_insert" ON news_petitions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "news_petitions_update" ON news_petitions;
CREATE POLICY "news_petitions_update" ON news_petitions FOR UPDATE USING (true);

DROP POLICY IF EXISTS "news_petitions_delete" ON news_petitions;
CREATE POLICY "news_petitions_delete" ON news_petitions FOR DELETE USING (true);

-- Create policies for news_reports
DROP POLICY IF EXISTS "news_reports_select" ON news_reports;
CREATE POLICY "news_reports_select" ON news_reports FOR SELECT USING (true);

DROP POLICY IF EXISTS "news_reports_insert" ON news_reports;
CREATE POLICY "news_reports_insert" ON news_reports FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "news_reports_update" ON news_reports;
CREATE POLICY "news_reports_update" ON news_reports FOR UPDATE USING (true);

DROP POLICY IF EXISTS "news_reports_delete" ON news_reports;
CREATE POLICY "news_reports_delete" ON news_reports FOR DELETE USING (true);
