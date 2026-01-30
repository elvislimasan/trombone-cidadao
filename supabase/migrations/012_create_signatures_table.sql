-- Create signatures table
create table if not exists signatures (
  id uuid default gen_random_uuid() primary key,
  report_id uuid references reports(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  name text,
  email text,
  is_public boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(report_id, user_id)
);

-- Index
create index if not exists signatures_report_id_idx on signatures(report_id);

-- RLS
alter table signatures enable row level security;

drop policy if exists "Signatures are viewable by everyone" on signatures;
create policy "Signatures are viewable by everyone" on signatures for select using (true);

drop policy if exists "Users can sign" on signatures;
create policy "Users can sign" on signatures for insert with check (true);

drop policy if exists "Users can update own signature" on signatures;
create policy "Users can update own signature" on signatures for update using (auth.uid() = user_id);

drop policy if exists "Users can delete own signature" on signatures;
create policy "Users can delete own signature" on signatures for delete using (auth.uid() = user_id);

-- Migrate existing upvotes (assuming upvotes table exists)
-- We use a DO block to handle potential missing columns gracefully or just insert
do $$
begin
  -- Check if upvotes table exists
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'upvotes') then
    -- Try to migrate data, filtering only valid users
    insert into signatures (report_id, user_id, created_at)
    select u.report_id, u.user_id, now()
    from upvotes u
    where exists (select 1 from auth.users au where au.id = u.user_id)
    on conflict (report_id, user_id) do nothing;
  end if;
end $$;
