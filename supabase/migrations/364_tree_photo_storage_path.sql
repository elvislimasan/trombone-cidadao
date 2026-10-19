begin;

-- Dentro da subconsulta, name sem qualificação resolve para cities.name.
-- O vínculo da cidade deve usar o caminho do objeto enviado ao storage.
alter policy tree_photos_insert on storage.objects
  with check (
    bucket_id = 'tree-photos'
    and (storage.foldername(objects.name))[2] = auth.uid()::text
    and exists (
      select 1 from public.cities c
      where c.id::text = (storage.foldername(objects.name))[1]
    )
  );

commit;
