-- Medição própria, anônima e multiplataforma da audiência do Trombone.
-- Nenhum IP, nome, e-mail ou user_id é armazenado. visitor_id e session_id são
-- identificadores aleatórios criados no aparelho apenas para contagens únicas.

create table if not exists public.audience_page_views (
  event_id uuid primary key,
  visitor_id uuid not null,
  session_id uuid not null,
  platform text not null check (platform in ('web', 'android', 'ios')),
  path text not null check (char_length(path) between 1 and 512 and left(path, 1) = '/'),
  occurred_at timestamptz not null default now()
);

create index if not exists audience_page_views_occurred_idx
  on public.audience_page_views (occurred_at desc);
create index if not exists audience_page_views_visitor_idx
  on public.audience_page_views (visitor_id, occurred_at);
create index if not exists audience_page_views_platform_idx
  on public.audience_page_views (platform, occurred_at desc);

alter table public.audience_page_views enable row level security;
revoke all on table public.audience_page_views from anon, authenticated;

create or replace function public.track_audience_page_view(
  p_event_id uuid,
  p_visitor_id uuid,
  p_session_id uuid,
  p_platform text,
  p_path text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
begin
  if p_event_id is null or p_visitor_id is null or p_session_id is null then return; end if;
  if p_platform not in ('web', 'android', 'ios') then return; end if;
  if p_path is null or char_length(p_path) < 1 or char_length(p_path) > 512 or left(p_path, 1) <> '/' then return; end if;

  insert into public.audience_page_views(event_id, visitor_id, session_id, platform, path)
  values (p_event_id, p_visitor_id, p_session_id, p_platform, p_path)
  on conflict (event_id) do nothing;
end;
$fn$;

revoke all on function public.track_audience_page_view(uuid, uuid, uuid, text, text) from public;
grant execute on function public.track_audience_page_view(uuid, uuid, uuid, text, text) to anon, authenticated;

create or replace function public.audience_dashboard(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_days integer := greatest(7, least(coalesce(p_days, 30), 365));
  v_start date := (now() at time zone 'America/Fortaleza')::date - (greatest(7, least(coalesce(p_days, 30), 365)) - 1);
  v_result jsonb;
begin
  if not (public.is_admin(auth.uid()) or public.is_master(auth.uid())) then
    raise exception 'Acesso restrito a administradores' using errcode = '42501';
  end if;

  with
  calendar as (
    select generate_series(v_start, (now() at time zone 'America/Fortaleza')::date, interval '1 day')::date as day
  ),
  filtered as materialized (
    select
      visitor_id,
      session_id,
      platform,
      path,
      occurred_at,
      (occurred_at at time zone 'America/Fortaleza')::date as day
    from public.audience_page_views
    where occurred_at >= (v_start::timestamp at time zone 'America/Fortaleza')
  ),
  visitors_in_period as (
    select distinct visitor_id from filtered
  ),
  first_seen as materialized (
    select pv.visitor_id, min(pv.occurred_at) as first_at
    from public.audience_page_views pv
    join visitors_in_period vp on vp.visitor_id = pv.visitor_id
    group by pv.visitor_id
  ),
  daily as (
    select
      c.day,
      count(f.occurred_at)::integer as page_views,
      count(distinct f.visitor_id)::integer as users,
      count(distinct f.session_id)::integer as sessions,
      count(distinct f.visitor_id) filter (
        where (fs.first_at at time zone 'America/Fortaleza')::date = c.day
      )::integer as new_users
    from calendar c
    left join filtered f on f.day = c.day
    left join first_seen fs on fs.visitor_id = f.visitor_id
    group by c.day
    order by c.day
  ),
  totals as (
    select
      count(*)::integer as page_views,
      count(distinct visitor_id)::integer as users,
      count(distinct session_id)::integer as sessions
    from filtered
  ),
  new_total as (
    select count(*)::integer as new_users
    from first_seen
    where first_at >= (v_start::timestamp at time zone 'America/Fortaleza')
  ),
  platforms as (
    select
      platform,
      count(*)::integer as page_views,
      count(distinct visitor_id)::integer as users,
      count(distinct session_id)::integer as sessions
    from filtered
    group by platform
    order by count(*) desc
  ),
  pages as (
    select path, count(*)::integer as page_views, count(distinct visitor_id)::integer as users
    from filtered
    group by path
    order by count(*) desc, path
    limit 12
  )
  select jsonb_build_object(
    'days', v_days,
    'generated_at', now(),
    'totals', jsonb_build_object(
      'page_views', coalesce((select page_views from totals), 0),
      'users', coalesce((select users from totals), 0),
      'sessions', coalesce((select sessions from totals), 0),
      'new_users', coalesce((select new_users from new_total), 0)
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'date', day, 'page_views', page_views, 'users', users,
      'sessions', sessions, 'new_users', new_users
    ) order by day) from daily), '[]'::jsonb),
    'platforms', coalesce((select jsonb_agg(to_jsonb(platforms)) from platforms), '[]'::jsonb),
    'top_pages', coalesce((select jsonb_agg(to_jsonb(pages)) from pages), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$fn$;

revoke all on function public.audience_dashboard(integer) from public, anon;
grant execute on function public.audience_dashboard(integer) to authenticated;

comment on table public.audience_page_views is
  'Page views anonimos do site e dos aplicativos, usados apenas no painel administrativo de audiencia.';

