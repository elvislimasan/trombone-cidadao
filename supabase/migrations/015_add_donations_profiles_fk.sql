-- Add foreign key from donations to profiles to enable easy joining in Supabase client
-- This assumes profiles.id is the same as auth.users.id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'donations_profiles_fkey') THEN
    ALTER TABLE donations
    ADD CONSTRAINT donations_profiles_fkey
    FOREIGN KEY (user_id)
    REFERENCES profiles(id)
    ON DELETE SET NULL;
  END IF;
END $$;
