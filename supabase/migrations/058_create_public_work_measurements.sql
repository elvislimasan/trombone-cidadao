-- Create handle_updated_at function if it doesn't exist
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create public_work_measurements table to track work history (multiple contracts/phases)
create table if not exists public.public_work_measurements (
  id uuid default gen_random_uuid() primary key,
  work_id uuid not null references public.public_works(id) on delete cascade,
  contractor_id uuid references public.contractors(id),
  title text not null, -- e.g. "1ª Licitação", "Retomada 2024"
  description text,
  contract_date date,
  start_date date,
  end_date date,
  value numeric,
  execution_percentage integer check (execution_percentage between 0 and 100),
  status text check (status in ('planned', 'tendered', 'in-progress', 'stalled', 'unfinished', 'completed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.public_work_measurements enable row level security;

-- Policies
create policy "Public measurements are viewable by everyone"
  on public.public_work_measurements for select
  using (true);

create policy "Admins can insert measurements"
  on public.public_work_measurements for insert
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

create policy "Admins can update measurements"
  on public.public_work_measurements for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

create policy "Admins can delete measurements"
  on public.public_work_measurements for delete
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Trigger to update updated_at
create trigger update_public_work_measurements_updated_at
  before update on public.public_work_measurements
  for each row
  execute function public.handle_updated_at();
