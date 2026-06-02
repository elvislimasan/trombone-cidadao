-- Recria as tabelas de atualização de bronca (a migration 102 falhou silenciosamente)

create table if not exists public.report_updates (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  update_type text not null check (update_type in ('still_here', 'being_solved', 'solved')),
  message text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.report_update_media (
  id uuid primary key default gen_random_uuid(),
  report_update_id uuid not null references public.report_updates(id) on delete cascade,
  url text not null,
  type text not null default 'photo',
  created_at timestamptz not null default now()
);

-- RLS
alter table public.report_updates enable row level security;
alter table public.report_update_media enable row level security;

-- Políticas de report_updates
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'report_updates' and policyname = 'Authenticated users can insert report updates'
  ) then
    create policy "Authenticated users can insert report updates"
      on public.report_updates for insert to authenticated
      with check (auth.uid() = author_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'report_updates' and policyname = 'Anyone can read report updates'
  ) then
    create policy "Anyone can read report updates"
      on public.report_updates for select to anon, authenticated
      using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'report_updates' and policyname = 'Report author and admins can confirm updates'
  ) then
    create policy "Report author and admins can confirm updates"
      on public.report_updates for update to authenticated
      using (
        exists (select 1 from public.reports r where r.id = report_id and r.author_id = auth.uid())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'report_updates' and policyname = 'Author can delete own pending updates'
  ) then
    create policy "Author can delete own pending updates"
      on public.report_updates for delete to authenticated
      using (author_id = auth.uid() and status = 'pending');
  end if;
end $$;

-- Políticas de report_update_media
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'report_update_media' and policyname = 'Authenticated users can insert update media'
  ) then
    create policy "Authenticated users can insert update media"
      on public.report_update_media for insert to authenticated
      with check (
        exists (select 1 from public.report_updates ru where ru.id = report_update_id and ru.author_id = auth.uid())
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'report_update_media' and policyname = 'Anyone can read update media'
  ) then
    create policy "Anyone can read update media"
      on public.report_update_media for select to anon, authenticated
      using (true);
  end if;
end $$;

-- Trigger de notificação (usando apenas colunas que existem em todas as versões da tabela notifications)
create or replace function public.notify_new_report_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
  v_title text;
  v_label text;
begin
  select author_id, title into v_author_id, v_title
  from public.reports where id = new.report_id;

  v_label := case new.update_type
    when 'still_here'   then 'O problema ainda está aqui'
    when 'being_solved' then 'O problema está sendo resolvido'
    when 'solved'       then 'O problema foi resolvido'
    else 'Nova atualização'
  end;

  -- Notifica o criador da bronca (se não for quem enviou)
  if v_author_id is not null and v_author_id != new.author_id then
    insert into public.notifications (user_id, type, message, report_id, is_read, created_at)
    values (v_author_id, 'status_update', v_label || ' — "' || coalesce(v_title, 'Bronca') || '"', new.report_id, false, now());
  end if;

  -- Notifica admins (exceto quem enviou)
  insert into public.notifications (user_id, type, message, report_id, is_read, created_at)
  select ma.user_id, 'status_update', v_label || ' — "' || coalesce(v_title, 'Bronca') || '"', new.report_id, false, now()
  from public.moderation_admins ma
  where ma.user_id != new.author_id;

  return new;
end;
$$;

drop trigger if exists on_report_update_insert_notify on public.report_updates;

create trigger on_report_update_insert_notify
after insert on public.report_updates
for each row execute function public.notify_new_report_update();

-- Força reload do cache do PostgREST
notify pgrst, 'reload schema';
