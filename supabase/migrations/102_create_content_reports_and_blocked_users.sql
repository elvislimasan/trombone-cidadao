-- Tabela de denúncias de conteúdo (UGC) — exigida pela App Store (Guideline 1.2)
create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_type text not null check (target_type in ('report', 'petition', 'comment', 'profile')),
  target_id uuid not null,
  reason text not null check (reason in (
    'spam',
    'harassment',
    'hate_speech',
    'violence',
    'sexual_content',
    'misinformation',
    'illegal',
    'other'
  )),
  details text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed', 'actioned')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_content_reports_target on public.content_reports (target_type, target_id);
create index if not exists idx_content_reports_status on public.content_reports (status);
create index if not exists idx_content_reports_reporter on public.content_reports (reporter_id);

alter table public.content_reports enable row level security;

drop policy if exists "users_can_create_content_reports" on public.content_reports;
create policy "users_can_create_content_reports"
  on public.content_reports for insert
  to authenticated, anon
  with check (true);

drop policy if exists "users_can_read_own_content_reports" on public.content_reports;
create policy "users_can_read_own_content_reports"
  on public.content_reports for select
  to authenticated
  using (reporter_id = auth.uid());

drop policy if exists "admins_full_access_content_reports" on public.content_reports;
create policy "admins_full_access_content_reports"
  on public.content_reports for all
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));


-- Tabela de bloqueios entre usuários
create table if not exists public.blocked_users (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists idx_blocked_users_blocker on public.blocked_users (blocker_id);
create index if not exists idx_blocked_users_blocked on public.blocked_users (blocked_id);

alter table public.blocked_users enable row level security;

drop policy if exists "users_can_manage_own_blocks" on public.blocked_users;
create policy "users_can_manage_own_blocks"
  on public.blocked_users for all
  to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());
