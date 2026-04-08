INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-avatars', 'profile-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view profile avatars" ON storage.objects;
CREATE POLICY "Anyone can view profile avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-avatars');

DROP POLICY IF EXISTS "Users can upload profile avatars" ON storage.objects;
CREATE POLICY "Users can upload profile avatars"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'profile-avatars' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update their own profile avatars" ON storage.objects;
CREATE POLICY "Users can update their own profile avatars"
ON storage.objects FOR UPDATE
USING (bucket_id = 'profile-avatars' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Users can delete their own profile avatars" ON storage.objects;
CREATE POLICY "Users can delete their own profile avatars"
ON storage.objects FOR DELETE
USING (bucket_id = 'profile-avatars' AND auth.uid() = owner);
