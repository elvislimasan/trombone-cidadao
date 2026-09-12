-- Rede social de perfis publicos.
-- O vinculo e entre contas pessoais (@username), independentemente de a conta
-- tambem administrar uma pagina legislativa, de embaixador ou outra pagina.

create table if not exists public.profile_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint profile_follows_no_self check (follower_id <> followed_id)
);

create index if not exists profile_follows_followed_created_idx
  on public.profile_follows (followed_id, created_at desc);

create index if not exists profile_follows_follower_created_idx
  on public.profile_follows (follower_id, created_at desc);

alter table public.profile_follows enable row level security;

drop policy if exists profile_follows_read_own on public.profile_follows;
create policy profile_follows_read_own
  on public.profile_follows for select
  to authenticated
  using (follower_id = auth.uid());

drop policy if exists profile_follows_insert_own on public.profile_follows;
create policy profile_follows_insert_own
  on public.profile_follows for insert
  to authenticated
  with check (
    follower_id = auth.uid()
    and follower_id <> followed_id
    and exists (
      select 1
      from public.profiles target
      where target.id = followed_id
        and target.public_profile_enabled = true
        and target.username_normalized is not null
    )
  );

drop policy if exists profile_follows_delete_own on public.profile_follows;
create policy profile_follows_delete_own
  on public.profile_follows for delete
  to authenticated
  using (follower_id = auth.uid());

-- Entrega apenas contagens publicas e o estado privado do visitante autenticado.
create or replace function public.get_public_profile_follow_state(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.profiles p
      where p.id = p_profile_id
        and p.public_profile_enabled = true
        and p.username_normalized is not null
    ) then jsonb_build_object(
      'followers_count', (
        select count(*) from public.profile_follows f where f.followed_id = p_profile_id
      ),
      'following_count', (
        select count(*) from public.profile_follows f where f.follower_id = p_profile_id
      ),
      'is_following', case
        when auth.uid() is null then false
        else exists (
          select 1 from public.profile_follows f
          where f.follower_id = auth.uid() and f.followed_id = p_profile_id
        )
      end
    )
    else jsonb_build_object(
      'followers_count', 0,
      'following_count', 0,
      'is_following', false
    )
  end;
$$;

create or replace function public.set_public_profile_follow(
  p_profile_id uuid,
  p_follow boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'E necessario entrar para seguir um perfil.';
  end if;

  if p_profile_id = v_user_id then
    raise exception 'Voce nao pode seguir o proprio perfil.';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and p.public_profile_enabled = true
      and p.username_normalized is not null
  ) then
    raise exception 'Perfil publico nao encontrado.';
  end if;

  if coalesce(p_follow, true) then
    insert into public.profile_follows (follower_id, followed_id)
    values (v_user_id, p_profile_id)
    on conflict (follower_id, followed_id) do nothing;
  else
    delete from public.profile_follows
    where follower_id = v_user_id and followed_id = p_profile_id;
  end if;

  return public.get_public_profile_follow_state(p_profile_id);
end;
$$;

-- Feed cronologico das broncas publicas de quem a conta acompanha.
create or replace function public.get_following_activity(
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb;
  v_total integer;
begin
  if v_user_id is null then
    raise exception 'E necessario entrar para acompanhar perfis.';
  end if;

  select count(*)
  into v_total
  from public.reports r
  join public.profile_follows f on f.followed_id = r.author_id
  join public.profiles p on p.id = r.author_id
  where f.follower_id = v_user_id
    and p.public_profile_enabled = true
    and r.is_anonymous = false
    and r.moderation_status = 'approved'
    and r.status <> 'rejected';

  select coalesce(jsonb_agg(item order by item_created_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      r.created_at as item_created_at,
      jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'status', r.status,
        'address', r.address,
        'created_at', r.created_at,
        'resolved_at', r.resolved_at,
        'category_name', c.name,
        'upvotes', (select count(*) from public.signatures s where s.report_id = r.id),
        'media', (
          select coalesce(jsonb_agg(jsonb_build_object('url', rm.url, 'type', rm.type)), '[]'::jsonb)
          from public.report_media rm where rm.report_id = r.id
        ),
        'author', jsonb_build_object(
          'name', p.name,
          'username', p.username,
          'avatar_type', p.avatar_type,
          'avatar_url', p.avatar_url,
          'avatar_config', p.avatar_config,
          'verification_status', p.verification_status
        )
      ) as item
    from public.reports r
    join public.profile_follows f on f.followed_id = r.author_id
    join public.profiles p on p.id = r.author_id
    left join public.categories c on c.id = r.category_id
    where f.follower_id = v_user_id
      and p.public_profile_enabled = true
      and r.is_anonymous = false
      and r.moderation_status = 'approved'
      and r.status <> 'rejected'
    order by r.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 50)
    offset greatest(coalesce(p_offset, 0), 0)
  ) feed;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

create or replace function public.get_my_following_profiles()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'username', p.username,
      'avatar_type', p.avatar_type,
      'avatar_url', p.avatar_url,
      'avatar_config', p.avatar_config,
      'verification_status', p.verification_status,
      'followed_at', f.created_at
    ) order by f.created_at desc
  ), '[]'::jsonb)
  from public.profile_follows f
  join public.profiles p on p.id = f.followed_id
  where f.follower_id = auth.uid()
    and p.public_profile_enabled = true
    and p.username_normalized is not null;
$$;

-- Uma publicacao nova aprovada gera aviso para os seguidores. A condicao de
-- transicao impede notificacoes repetidas em edicoes posteriores da bronca.
create or replace function public.notify_profile_followers_new_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_name text;
begin
  if new.author_id is null
     or coalesce(new.is_anonymous, false)
     or new.moderation_status <> 'approved'
     or new.status = 'rejected' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.moderation_status = 'approved'
     and coalesce(old.is_anonymous, false) = false then
    return new;
  end if;

  select p.name into v_author_name
  from public.profiles p
  where p.id = new.author_id and p.public_profile_enabled = true;

  if v_author_name is null then
    return new;
  end if;

  insert into public.notifications
    (user_id, type, title, message, link, report_id, is_read, created_at)
  select
    f.follower_id,
    'following_activity',
    v_author_name || ' publicou uma nova bronca',
    coalesce(new.title, 'Veja a nova cobranca publicada.'),
    '/bronca/' || new.id,
    new.id,
    false,
    now()
  from public.profile_follows f
  where f.followed_id = new.author_id;

  return new;
end;
$$;

drop trigger if exists reports_notify_profile_followers on public.reports;
create trigger reports_notify_profile_followers
  after insert or update of moderation_status, is_anonymous on public.reports
  for each row execute function public.notify_profile_followers_new_report();

grant select, insert, delete on public.profile_follows to authenticated;
grant execute on function public.get_public_profile_follow_state(uuid) to anon, authenticated;
grant execute on function public.set_public_profile_follow(uuid, boolean) to authenticated;
grant execute on function public.get_following_activity(integer, integer) to authenticated;
grant execute on function public.get_my_following_profiles() to authenticated;

comment on table public.profile_follows is
  'Relacionamentos de seguir entre perfis sociais pessoais. Paginas legislativas permanecem separadas.';
