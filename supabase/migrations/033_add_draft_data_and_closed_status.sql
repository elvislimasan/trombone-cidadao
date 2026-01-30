-- Add draft_data column to petitions table to support separate draft/published versions
ALTER TABLE petitions ADD COLUMN IF NOT EXISTS draft_data JSONB DEFAULT NULL;

-- Ensure status column can handle 'closed' (it is text so it should be fine, but good to note)
-- Status values: 'open', 'draft', 'closed', 'victory'
