create table if not exists donations (
  id uuid default gen_random_uuid() primary key,
  report_id uuid references reports(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  amount integer not null, -- Amount in cents
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  payment_id text,
  provider text default 'stripe', -- stripe, mercadopago
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table donations enable row level security;

-- Policies
drop policy if exists "Donations are viewable by everyone" on donations;
create policy "Donations are viewable by everyone" on donations for select using (true);

drop policy if exists "Users can insert their own donations" on donations;
create policy "Users can insert their own donations" on donations for insert with check (auth.uid() = user_id);

-- Users should not be able to update donations status directly (handled by webhook/edge function)
-- But we might allow them to update metadata if needed? For now, no update policy for public.
