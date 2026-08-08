-- Fase 2.5: sistema de convites de embaixador
-- Cria tabela ambassador_invites e adiciona FK em ambassador_cities.invite_id

-- ── 1. Tabela de convites ─────────────────────────────────────────────────────
-- O token usa replace(gen_random_uuid()::text, '-', '') duas vezes concatenados
-- para produzir um token de 64 hex chars sem depender de pgcrypto no search_path.
create table if not exists public.ambassador_invites (
  id            bigint generated always as identity primary key,
  token         text not null unique default (
                  replace(gen_random_uuid()::text, '-', '') ||
                  replace(gen_random_uuid()::text, '-', '')
                ),
  city_id       bigint not null references public.cities(id) on delete cascade,
  invited_by    uuid not null references auth.users(id) on delete cascade,
  invited_email text,                         -- opcional: email do convidado
  status        text not null default 'pending',  -- pending | accepted | expired | revoked
  expires_at    timestamptz not null default (now() + interval '7 days'),
  accepted_by   uuid references auth.users(id),
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.ambassador_invites enable row level security;

-- ── 2. RLS em ambassador_invites ─────────────────────────────────────────────

-- SELECT: master vê tudo; titular do convite pode ler pelo token via current_setting
drop policy if exists "ambassador_invites_select" on public.ambassador_invites;
create policy "ambassador_invites_select"
  on public.ambassador_invites for select
  using (
    public.is_master(auth.uid())
    or token = current_setting('app.invite_token', true)
  );

-- INSERT: só master pode criar convites
drop policy if exists "ambassador_invites_insert" on public.ambassador_invites;
create policy "ambassador_invites_insert"
  on public.ambassador_invites for insert
  with check (public.is_master(auth.uid()));

-- UPDATE: só master pode atualizar convites
drop policy if exists "ambassador_invites_update" on public.ambassador_invites;
create policy "ambassador_invites_update"
  on public.ambassador_invites for update
  using (public.is_master(auth.uid()));

-- ── 3. FK de ambassador_cities.invite_id → ambassador_invites.id ─────────────
-- A coluna invite_id já existe (criada como bigint sem FK na migration 121).
-- Adicionamos agora a constraint referencial.
alter table public.ambassador_cities
  add constraint fk_ambassador_cities_invite
  foreign key (invite_id) references public.ambassador_invites(id);

-- ── Fim ──────────────────────────────────────────────────────────────────────
