-- Add importance_list column to petitions table
ALTER TABLE petitions 
ADD COLUMN IF NOT EXISTS importance_list JSONB DEFAULT '[]';
