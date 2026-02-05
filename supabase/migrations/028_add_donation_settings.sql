-- Add donation settings to petitions table
ALTER TABLE petitions 
ADD COLUMN IF NOT EXISTS donation_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS donation_options JSONB DEFAULT '[10, 20, 50, 100]';

-- Comment on columns
COMMENT ON COLUMN petitions.donation_enabled IS 'Whether to show donation options for this petition';
COMMENT ON COLUMN petitions.donation_options IS 'Array of suggested donation amounts';
