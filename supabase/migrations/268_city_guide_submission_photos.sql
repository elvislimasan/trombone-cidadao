-- Fotos enviadas pelos cidadãos para locais pendentes de moderação.
insert into storage.buckets (id, name, public)
values ('city-guide-submissions', 'city-guide-submissions', true)
on conflict (id) do nothing;

drop policy if exists city_guide_submission_photos_read on storage.objects;
create policy city_guide_submission_photos_read
on storage.objects for select
using (bucket_id = 'city-guide-submissions');

drop policy if exists city_guide_submission_photos_insert on storage.objects;
create policy city_guide_submission_photos_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'city-guide-submissions'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists city_guide_submission_photos_delete on storage.objects;
create policy city_guide_submission_photos_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'city-guide-submissions'
  and (storage.foldername(name))[1] = auth.uid()::text
);
