-- Add donation_goal to petitions table
ALTER TABLE petitions 
ADD COLUMN IF NOT EXISTS donation_goal NUMERIC DEFAULT NULL;

COMMENT ON COLUMN petitions.donation_goal IS 'Financial goal for the petition in BRL';
