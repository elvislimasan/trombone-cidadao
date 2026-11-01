begin;

create table public.community_tree_comments (
  id uuid primary key,
  tree_id uuid not null references public.community_trees(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default clock_timestamp()
);
create index community_tree_comments_timeline on public.community_tree_comments(tree_id,created_at desc,id);
create index community_tree_comments_author on public.community_tree_comments(author_id,created_at desc);
alter table public.community_tree_comments enable row level security;
revoke all on public.community_tree_comments from public,anon,authenticated;

-- Only approved public profiles have a public discussion. No contact or location
-- fields are exposed, and private profiles never reveal comments through this RPC.
create function public.list_community_tree_comments(p_tree uuid,p_limit integer default 20,p_offset integer default 0) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(q.entry order by q.created_at desc,q.id),'[]'::jsonb) from (
    select c.id,c.created_at,jsonb_build_object('id',c.id,'body',c.body,'created_at',c.created_at,
      'author_name',coalesce(nullif(btrim(p.name),''),'Cidadão'),
      'is_author',coalesce(c.author_id=auth.uid(),false),
      'can_delete',coalesce(c.author_id=auth.uid() or t.author_id=auth.uid() or public.can_manage_tree_adoption(t.city_id),false)) as entry
    from public.community_tree_comments c join public.community_trees t on t.id=c.tree_id
    join public.profiles p on p.id=c.author_id
    where c.tree_id=p_tree and t.status='approved' and t.public_profile
    order by c.created_at desc,c.id limit greatest(1,least(coalesce(p_limit,20),50)) offset greatest(0,coalesce(p_offset,0))
  ) q
$$;
revoke all on function public.list_community_tree_comments(uuid,integer,integer) from public;
grant execute on function public.list_community_tree_comments(uuid,integer,integer) to anon,authenticated;

create function public.add_community_tree_comment(p_id uuid,p_tree uuid,p_body text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.community_trees; c public.community_tree_comments;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para comentar.' using errcode='42501'; end if;
  if p_id is null or coalesce(length(btrim(p_body)),0) not between 1 and 1000 then raise exception 'Escreva um comentário de até 1.000 caracteres.'; end if;
  perform pg_advisory_xact_lock(hashtext('community-comment'),hashtext(auth.uid()::text));
  select * into t from public.community_trees where id=p_tree for share;
  if not found or t.status<>'approved' or not t.public_profile then raise exception 'Comentários disponíveis em perfis públicos aprovados.' using errcode='42501'; end if;
  select * into c from public.community_tree_comments where id=p_id;
  if found then
    if c.author_id<>auth.uid() or c.tree_id<>p_tree then raise exception 'Comentário indisponível.' using errcode='42501'; end if;
    return c.id;
  end if;
  if (select count(*) from public.community_tree_comments where author_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=5 then
    raise exception 'Aguarde um minuto antes de comentar novamente.' using errcode='P0001';
  end if;
  insert into public.community_tree_comments(id,tree_id,author_id,body) values(p_id,p_tree,auth.uid(),btrim(p_body));
  return p_id;
end $$;
revoke all on function public.add_community_tree_comment(uuid,uuid,text) from public,anon;
grant execute on function public.add_community_tree_comment(uuid,uuid,text) to authenticated;

-- Authors can remove their text; the tree owner and municipal team can moderate.
create function public.delete_community_tree_comment(p_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.community_tree_comments; t public.community_trees;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  select * into c from public.community_tree_comments where id=p_id for update;
  if not found then return; end if;
  select * into t from public.community_trees where id=c.tree_id;
  if c.author_id<>auth.uid() and t.author_id<>auth.uid() and not coalesce(public.can_manage_tree_adoption(t.city_id),false) then
    raise exception 'Sem permissão para excluir este comentário.' using errcode='42501';
  end if;
  delete from public.community_tree_comments where id=p_id;
end $$;
revoke all on function public.delete_community_tree_comment(uuid) from public,anon;
grant execute on function public.delete_community_tree_comment(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
