-- Add rejection_reason column to petitions table
ALTER TABLE petitions 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

COMMENT ON COLUMN petitions.rejection_reason IS 'Reason provided by admin when rejecting a petition';
