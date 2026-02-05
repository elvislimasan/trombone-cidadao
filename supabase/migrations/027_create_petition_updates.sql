create table if not exists petition_updates (
  id uuid default gen_random_uuid() primary key,
  petition_id uuid references petitions(id) on delete cascade not null,
  title text not null,
  content text not null,
  image_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table petition_updates enable row level security;

create policy "Updates are viewable by everyone"
  on petition_updates for select
  using ( true );

create policy "Authors can insert updates"
  on petition_updates for insert
  with check ( auth.uid() in ( select author_id from petitions where id = petition_id ) );

create policy "Authors can update updates"
  on petition_updates for update
  using ( auth.uid() in ( select author_id from petitions where id = petition_id ) );

create policy "Authors can delete updates"
  on petition_updates for delete
  using ( auth.uid() in ( select author_id from petitions where id = petition_id ) );

-- Add trigger for notifications (optional, can be added later)
