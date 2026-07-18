-- Fase 2: hierarquia master + papel embaixador
-- Adiciona is_master e is_ambassador em profiles, cria ambassador_cities,
-- e funções helper SECURITY DEFINER usadas nas RLS das próximas migrations.

-- ── 1. Colunas em profiles ───────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_master    boolean not null default false,
  add column if not exists is_ambassador boolean not null default false;

-- ── 2. Tabela ambassador_cities ──────────────────────────────────────────────
create table if not exists public.ambassador_cities (
  id          bigint generated always as identity primary key,
  user_id     uuid   not null references auth.users(id)  on delete cascade,
  city_id     bigint not null references public.cities(id) on delete cascade,
  status      text   not null default 'active',    -- active | suspended | pending
  assigned_by uuid   references auth.users(id),    -- master que designou
  invite_id   bigint,                              -- convite usado (Fase 2.5)
  created_at  timestamptz not null default now(),
  unique (user_id, city_id)
);

alter table public.ambassador_cities enable row level security;

-- ── 3. Funções helper SECURITY DEFINER ──────────────────────────────────────
-- Usadas nas RLS policies para evitar recursão e garantir que o chamador
-- nunca leia diretamente profiles ou ambassador_cities sem permissão.

create or replace function public.is_master(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_master from public.profiles where id = p_user limit 1),
    false
  );
$$;

create or replace function public.is_ambassador_of(p_user uuid, p_city_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ambassador_cities
    where user_id  = p_user
      and city_id  = p_city_id
      and status   = 'active'
  );
$$;

-- Helper centralizado: pode moderar uma bronca?
-- Retorna true para: admin global, master, ou embaixador ativo da cidade da bronca.
create or replace function public.can_moderate_report(p_user uuid, p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- admin global ou master
    coalesce((select is_admin or is_master from public.profiles where id = p_user limit 1), false)
    or
    -- embaixador ativo da cidade da bronca
    exists (
      select 1
      from public.reports r
      join public.ambassador_cities ac
        on ac.city_id = r.city_id
       and ac.user_id  = p_user
       and ac.status   = 'active'
      where r.id = p_report_id
    );
$$;

-- ── 4. RLS em ambassador_cities ──────────────────────────────────────────────

-- SELECT: embaixador vê apenas as próprias linhas; admin/master vê todas
drop policy if exists "ambassador_cities_select" on public.ambassador_cities;
create policy "ambassador_cities_select"
  on public.ambassador_cities for select
  using (
    user_id = auth.uid()
    or public.is_master(auth.uid())
    or coalesce((select is_admin from public.profiles where id = auth.uid() limit 1), false)
  );

-- INSERT: só master pode designar embaixadores
drop policy if exists "ambassador_cities_insert" on public.ambassador_cities;
create policy "ambassador_cities_insert"
  on public.ambassador_cities for insert
  with check (public.is_master(auth.uid()));

-- UPDATE: só master pode alterar status
drop policy if exists "ambassador_cities_update" on public.ambassador_cities;
create policy "ambassador_cities_update"
  on public.ambassador_cities for update
  using (public.is_master(auth.uid()));

-- DELETE: só master pode remover
drop policy if exists "ambassador_cities_delete" on public.ambassador_cities;
create policy "ambassador_cities_delete"
  on public.ambassador_cities for delete
  using (public.is_master(auth.uid()));

-- ── 5. Trigger: sincronizar is_ambassador em profiles ───────────────────────
-- Quando uma linha em ambassador_cities é inserida/atualizada/deletada,
-- recalcula is_ambassador no perfil correspondente.
create or replace function public.sync_is_ambassador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles
    set is_ambassador = exists (
      select 1 from public.ambassador_cities
      where user_id = old.user_id and status = 'active'
    )
    where id = old.user_id;
    return old;
  else
    update public.profiles
    set is_ambassador = exists (
      select 1 from public.ambassador_cities
      where user_id = new.user_id and status = 'active'
    )
    where id = new.user_id;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_sync_is_ambassador on public.ambassador_cities;
create trigger trg_sync_is_ambassador
after insert or update or delete on public.ambassador_cities
for each row execute function public.sync_is_ambassador();

-- ── Fim ──────────────────────────────────────────────────────────────────────
