alter table public.poles
  add column if not exists validation_status text not null default 'approved',
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'poles_validation_status_check'
      and conrelid = 'public.poles'::regclass
  ) then
    alter table public.poles
      add constraint poles_validation_status_check
      check (validation_status in ('approved', 'rejected'));
  end if;
end
$$;

create index if not exists poles_validation_status_idx
  on public.poles (validation_status);

drop function if exists public.nearest_poles(double precision, double precision, integer, integer);

create or replace function public.nearest_poles(
  lat double precision,
  lng double precision,
  radius_m integer default 60,
  max_results integer default 5
)
returns table (
  pole_id bigint,
  identifier text,
  plate text,
  address text,
  latitude double precision,
  longitude double precision,
  is_broken boolean,
  distance_m integer
)
language sql
stable
as $$
  with params as (
    select
      extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography as user_geog,
      greatest(1, least(radius_m, 5000))::integer as radius_m_sanitized,
      greatest(1, least(max_results, 25))::integer as max_results_sanitized
  )
  select
    p.id as pole_id,
    p.identifier,
    p.plate,
    p.address,
    p.latitude,
    p.longitude,
    p.is_broken,
    round(extensions.st_distance(p.geom, params.user_geog))::integer as distance_m
  from public.poles p
  cross join params
  where extensions.st_dwithin(p.geom, params.user_geog, params.radius_m_sanitized)
    and coalesce(p.validation_status, 'approved') = 'approved'
  order by extensions.st_distance(p.geom, params.user_geog) asc
  limit (select max_results_sanitized from params);
$$;

grant execute on function public.nearest_poles(double precision, double precision, integer, integer) to anon, authenticated;

create or replace function public.create_pending_pole(
  p_lat double precision,
  p_lng double precision,
  p_identifier text,
  p_address text default null,
  p_plate text default null
)
returns table (
  pole_id bigint,
  identifier text,
  plate text,
  address text,
  latitude double precision,
  longitude double precision,
  validation_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identifier text := nullif(trim(p_identifier), '');
  v_address text := nullif(trim(p_address), '');
  v_plate text := nullif(trim(p_plate), '');
  v_dataset_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_admin = true
  ) then
    raise exception 'Apenas administradores podem cadastrar postes';
  end if;

  if not (p_lat between -90 and 90) then
    raise exception 'Latitude inválida';
  end if;

  if not (p_lng between -180 and 180) then
    raise exception 'Longitude inválida';
  end if;

  if v_identifier is null then
    raise exception 'Identificador do poste é obrigatório';
  end if;

  select pd.id
    into v_dataset_id
  from public.pole_datasets pd
  where pd.source = 'user_generated'
  order by pd.id asc
  limit 1;

  if v_dataset_id is null then
    insert into public.pole_datasets (name, source, created_by)
    values ('Postes cadastrados por usuários', 'user_generated', auth.uid())
    returning id into v_dataset_id;
  end if;

  return query
  insert into public.poles (
    dataset_id,
    identifier,
    plate,
    address,
    geom,
    latitude,
    longitude,
    raw_properties,
    validation_status,
    created_by,
    approved_at,
    approved_by
  )
  values (
    v_dataset_id,
    v_identifier,
    v_plate,
    v_address,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
    p_lat,
    p_lng,
    jsonb_build_object(
      'source', 'user_submission',
      'created_via', 'create_pending_pole'
    ),
    'approved',
    auth.uid(),
    now(),
    auth.uid()
  )
  returning
    id as pole_id,
    public.poles.identifier as identifier,
    public.poles.plate as plate,
    public.poles.address as address,
    public.poles.latitude as latitude,
    public.poles.longitude as longitude,
    public.poles.validation_status as validation_status;
end;
$$;

grant execute on function public.create_pending_pole(double precision, double precision, text, text, text) to authenticated;
