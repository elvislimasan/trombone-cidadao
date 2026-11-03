begin;

-- Upload cleanup must never remove a photo used by a tree or diary entry.
-- SECURITY DEFINER checks every reference, even when another RLS policy hides it.
create or replace function public.can_cleanup_community_photo(p_path text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(
    auth.uid() is not null
    and split_part(p_path,'/',1)=auth.uid()::text
    and p_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|png|webp)$'
    and not exists(select 1 from public.community_trees t where t.cover_photo=p_path)
    and not exists(select 1 from public.community_tree_care c where c.photo_path=p_path),false)
$$;
revoke all on function public.can_cleanup_community_photo(text) from public,anon;
grant execute on function public.can_cleanup_community_photo(text) to authenticated;

-- A restrictive policy also protects older clients: permissive policies from
-- other upload flows cannot override protection for linked community photos.
drop policy if exists community_photos_preserve_linked on storage.objects;
create policy community_photos_preserve_linked on storage.objects as restrictive
for delete to authenticated using (
  bucket_id<>'community-tree-photos' or public.can_cleanup_community_photo(name)
);

notify pgrst,'reload schema';
commit;
