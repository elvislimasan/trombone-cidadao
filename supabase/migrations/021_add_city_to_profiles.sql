-- Add city column to profiles if it doesn't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city TEXT;

-- Trigger to copy city from metadata on signup is assumed to be handled by handle_new_user
-- If not, we can update the handle_new_user function:

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, avatar_url, city)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'city'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
