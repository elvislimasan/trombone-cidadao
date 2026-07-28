-- 150_rental_property_media_bucket.sql
-- Bucket público para fotos e documentos (contrato/aditivo) dos imóveis
-- alugados. Mesmo padrão de work-media: upload direto, sem signed URLs.

insert into storage.buckets (id, name, public)
values ('rental-property-media', 'rental-property-media', true)
on conflict (id) do nothing;

drop policy if exists "rental_property_media_bucket_select_public" on storage.objects;
create policy "rental_property_media_bucket_select_public"
  on storage.objects for select
  using (bucket_id = 'rental-property-media');

drop policy if exists "rental_property_media_bucket_gestor_insert" on storage.objects;
create policy "rental_property_media_bucket_gestor_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'rental-property-media'
    and auth.role() = 'authenticated'
  );

drop policy if exists "rental_property_media_bucket_gestor_delete" on storage.objects;
create policy "rental_property_media_bucket_gestor_delete"
  on storage.objects for delete
  using (
    bucket_id = 'rental-property-media'
    and auth.role() = 'authenticated'
  );

notify pgrst, 'reload schema';
