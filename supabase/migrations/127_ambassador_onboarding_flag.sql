-- 127_ambassador_onboarding_flag.sql

alter table public.profiles
  add column if not exists has_seen_ambassador_onboarding boolean not null default false;
