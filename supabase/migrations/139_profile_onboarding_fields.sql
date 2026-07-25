-- 139_profile_onboarding_fields.sql
-- Garante as colunas usadas no onboarding obrigatório (inclusive para quem
-- entra via Google OAuth, cujo metadata não traz telefone/cidade).
-- Idempotente: add column if not exists.

alter table public.profiles add column if not exists phone             text;
alter table public.profiles add column if not exists city_id           bigint references public.cities(id);
alter table public.profiles add column if not exists state_id          bigint references public.states(id);
alter table public.profiles add column if not exists terms_accepted_at timestamptz;

-- Índice leve para lookups por cidade (feed/estatísticas já usam reports.city_id,
-- mas o profile.city_id ajuda a pré-selecionar a cidade do usuário).
create index if not exists idx_profiles_city_id on public.profiles (city_id);

notify pgrst, 'reload schema';
