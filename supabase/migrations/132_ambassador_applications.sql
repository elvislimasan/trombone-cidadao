-- 132_ambassador_applications.sql
-- Candidaturas a embaixador (fluxo público de auto-cadastro com aprovação).

create table if not exists public.ambassador_applications (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  city_id          bigint not null references public.cities(id) on delete cascade,
  applicant_name   text,
  applicant_email  text,
  motivation       text,
  status           text not null default 'pending',  -- pending | approved | rejected
  reviewed_by      uuid references auth.users(id),
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_ambassador_applications_status_created
  on public.ambassador_applications (status, created_at desc);

alter table public.ambassador_applications enable row level security;

-- SELECT: própria candidatura OU gestor (master/admin)
drop policy if exists "ambassador_applications_select" on public.ambassador_applications;
create policy "ambassador_applications_select"
  on public.ambassador_applications for select
  using (
    user_id = auth.uid()
    or public.is_master(auth.uid())
    or coalesce((select is_admin from public.profiles where id = auth.uid() limit 1), false)
  );

-- INSERT: candidato cria a própria
drop policy if exists "ambassador_applications_insert" on public.ambassador_applications;
create policy "ambassador_applications_insert"
  on public.ambassador_applications for insert
  with check (user_id = auth.uid());

-- UPDATE: só gestor (master/admin) revisa
drop policy if exists "ambassador_applications_update" on public.ambassador_applications;
create policy "ambassador_applications_update"
  on public.ambassador_applications for update
  using (
    public.is_master(auth.uid())
    or coalesce((select is_admin from public.profiles where id = auth.uid() limit 1), false)
  );

-- Notificação: nova candidatura → masters e admins (sem duplicar quem é ambos)
create or replace function public.notify_admins_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text;
begin
  select name into v_city from public.cities where id = new.city_id;
  insert into public.notifications (user_id, type, title, message, link, is_read, created_at)
  select
    p.id,
    'ambassador_application',
    'Nova candidatura a embaixador',
    'Nova candidatura a embaixador de ' || coalesce(v_city, 'cidade') ||
      ' (' || coalesce(new.applicant_name, 'candidato') || ') aguarda avaliação.',
    '/admin/masters',
    false,
    now()
  from public.profiles p
  where p.is_master = true or p.is_admin = true;
  return new;
end;
$$;

drop trigger if exists on_application_insert_notify on public.ambassador_applications;
create trigger on_application_insert_notify
  after insert on public.ambassador_applications
  for each row execute function public.notify_admins_new_application();

notify pgrst, 'reload schema';
