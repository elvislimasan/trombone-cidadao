-- Allow guest signatures by modifying RLS
-- Drop strict auth check
DROP POLICY IF EXISTS "Users can insert their own signatures" ON signatures;

-- Allow authenticated users to insert their own, AND guests (null user_id) to insert
DROP POLICY IF EXISTS "Enable insert for authenticated users and guests" ON signatures;
CREATE POLICY "Enable insert for authenticated users and guests" 
ON signatures FOR INSERT 
WITH CHECK (
  (auth.uid() = user_id) OR (auth.uid() IS NULL AND user_id IS NULL)
);

-- Ensure we can identify guest signatures uniquely to prevent duplicates
-- Create unique index on petition_id + email for guest signatures (where user_id is null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_signatures_guest_unique 
ON signatures(petition_id, email) 
WHERE user_id IS NULL AND petition_id IS NOT NULL;

-- Security: Prevent exposing emails to public (optional but recommended)
-- We need to check if existing policies expose email.
-- 012 created: create policy "Signatures are viewable by everyone" on signatures for select using (true);
-- We should restrict this if possible, but it might break "User has signed" check if we don't allow reading.
-- For "User has signed" check, we usually filter by our own email/id.
-- For now, we will leave SELECT as is to avoid breaking changes, but strictly strictly strictly 
-- we should probably use a SECURITY DEFINER function to check "has signed" without exposing data.
