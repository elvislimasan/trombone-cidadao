-- Add details to signatures table for better petition support
ALTER TABLE signatures 
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS allow_notifications BOOLEAN DEFAULT TRUE;

-- Update RLS policies if necessary (usually INSERT checks allow all columns by default if row is allowed)
-- But we might want to ensure users can't fake other's signature details? 
-- The existing policy "Users can insert their own signatures" checks auth.uid() = user_id, which is sufficient for ownership.
