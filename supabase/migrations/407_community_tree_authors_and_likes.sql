begin;

create table public.community_tree_likes (
  tree_id uuid not null references public.community_trees(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(tree_id,user_id)
);
create index community_tree_likes_user on public.community_tree_likes(user_id);
alter table public.community_tree_likes enable row level security;
revoke all on public.community_tree_likes from public,anon,authenticated;

-- Public tree posts expose only display attribution: name, avatar and an optional
-- public username. Email, phone, account id and private location stay excluded.
create or replace function public.get_community_tree(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare t public.community_trees; v_private boolean; v_review boolean; result jsonb;
begin
  select * into t from public.community_trees where id=p_id;
  if not found then return null; end if;
  v_review=auth.uid() is not null and public.can_manage_tree_adoption(t.city_id);
  v_private=auth.uid() is not null and (auth.uid()=t.author_id or v_review);
  if not v_private and (t.status<>'approved' or not t.public_profile) then return null; end if;
  result=jsonb_build_object('id',t.id,'city_id',t.city_id,'city_name',(select name from public.cities where id=t.city_id),
    'author',(select jsonb_build_object('name',coalesce(nullif(btrim(p.name),''),'Cidadão da comunidade'),
      'avatar_type',p.avatar_type,'avatar_url',case when p.avatar_type in ('url','upload') then p.avatar_url end,
      'avatar_config',case when p.avatar_type='generated' then p.avatar_config end,
      'username',case when p.public_profile_enabled then nullif(btrim(p.username),'') end)
      from public.profiles p where p.id=t.author_id),
    'like_count',(select count(*) from public.community_tree_likes l where l.tree_id=t.id),
    'liked',exists(select 1 from public.community_tree_likes l where l.tree_id=t.id and l.user_id=auth.uid()),
    'name',t.name,'species_id',t.species_id,'species_name',(select common_name from public.city_tree_species where id=t.species_id),
    'planted_on',t.planted_on,'cover_photo',t.cover_photo,'public_profile',t.public_profile,'location_visibility',t.location_visibility,
    'status',t.status,'created_at',t.created_at,'updated_at',t.updated_at,'is_owner',coalesce(auth.uid()=t.author_id,false),'can_review',v_review,
    'latitude',case when v_private or t.location_visibility='exact' then t.latitude end,
    'longitude',case when v_private or t.location_visibility='exact' then t.longitude end,
    'address',case when v_private or t.location_visibility='exact' then t.address end,
    'review_note',case when v_private then t.review_note end,
    'care_count',(select count(*) from public.community_tree_care c where c.tree_id=t.id and (v_private or (c.is_public and not c.is_hidden))),
    'public_care_count',(select count(*) from public.community_tree_care c where c.tree_id=t.id and c.is_public and not c.is_hidden),
    'latest_public_care',(select jsonb_build_object('photo_path',c.photo_path,'performed_on',c.performed_on,'created_at',c.created_at,'is_public',true,'is_hidden',false)
      from public.community_tree_care c where c.tree_id=t.id and c.is_public and not c.is_hidden and c.photo_path is not null
      order by c.performed_on desc,c.created_at desc,c.id limit 1));
  return result;
end $$;
revoke all on function public.get_community_tree(uuid) from public;
grant execute on function public.get_community_tree(uuid) to anon,authenticated;

create function public.set_community_tree_like(p_tree uuid,p_liked boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.community_trees;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para curtir.' using errcode='42501'; end if;
  if p_liked is null then raise exception 'Informe se deseja curtir ou desfazer a curtida.'; end if;
  select * into t from public.community_trees where id=p_tree for share;
  if not found or t.status<>'approved' or not t.public_profile then
    raise exception 'Curtidas disponíveis apenas em árvores públicas aprovadas.' using errcode='42501';
  end if;
  if p_liked then
    insert into public.community_tree_likes(tree_id,user_id) values(p_tree,auth.uid()) on conflict do nothing;
  else
    delete from public.community_tree_likes where tree_id=p_tree and user_id=auth.uid();
  end if;
  return jsonb_build_object('liked',exists(select 1 from public.community_tree_likes where tree_id=p_tree and user_id=auth.uid()),
    'like_count',(select count(*) from public.community_tree_likes where tree_id=p_tree));
end $$;
revoke all on function public.set_community_tree_like(uuid,boolean) from public,anon;
grant execute on function public.set_community_tree_like(uuid,boolean) to authenticated;

notify pgrst,'reload schema';
commit;
