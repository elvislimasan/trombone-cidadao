-- Add target to petitions (Who is being petitioned)
ALTER TABLE petitions 
ADD COLUMN IF NOT EXISTS target TEXT;

-- Add comment to signatures (Why are they signing)
ALTER TABLE signatures 
ADD COLUMN IF NOT EXISTS comment TEXT;

-- Comment on columns
COMMENT ON COLUMN petitions.target IS 'The entity or person being petitioned (e.g., Prefeitura de Recife)';
COMMENT ON COLUMN signatures.comment IS 'Optional comment explaining why the user is signing';
