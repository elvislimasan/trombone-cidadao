-- A patrulha passa a vincular a bronca de iluminacao ao poste selecionado no
-- mapa, como o ReportModal comum. A sobrecarga antiga continua disponivel para
-- versoes anteriores do aplicativo e para itens antigos da fila offline.

create or replace function public.complete_patrol_signal(
  p_signal_id uuid,
  p_title text,
  p_description text,
  p_lat double precision,
  p_lng double precision,
  p_pole_id bigint,
  p_new_lat double precision default null,
  p_new_lng double precision default null,
  p_city_id bigint default null,
  p_neighborhood text default null,
  p_issue_type text default null,
  p_pole_number text default null,
  p_is_from_water_utility boolean default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_report_id uuid;
  v_category text;
  v_distance integer;
  v_identifier text;
  v_plate text;
  v_label text;
begin
  -- A funcao viva da migration 191 continua sendo a unica responsavel pelas
  -- regras de presenca, ajuste, autoria e campos obrigatorios.
  v_report_id := public.complete_patrol_signal(
    p_signal_id,
    p_title,
    p_description,
    p_lat,
    p_lng,
    p_new_lat,
    p_new_lng,
    p_city_id,
    p_neighborhood,
    p_issue_type,
    p_pole_number,
    p_is_from_water_utility
  );

  if p_pole_id is null then
    return v_report_id;
  end if;

  select r.category_id
    into v_category
  from public.reports r
  where r.id = v_report_id;

  if v_category is distinct from 'iluminacao' then
    raise exception 'poste so pode ser vinculado a iluminacao' using errcode = '22023';
  end if;

  select
    p.identifier,
    p.plate,
    round(extensions.st_distance(
      p.geom,
      r.location::extensions.geography
    ))::integer
    into v_identifier, v_plate, v_distance
  from public.poles p
  cross join public.reports r
  where p.id = p_pole_id
    and r.id = v_report_id;

  if not found then
    raise exception 'poste nao encontrado' using errcode = 'P0002';
  end if;

  if v_distance > 100 then
    raise exception 'poste distante do ponto da bronca' using errcode = '22023';
  end if;

  v_label := coalesce(
    nullif(btrim(v_plate), ''),
    nullif(btrim(v_identifier), ''),
    nullif(btrim(p_pole_number), '')
  );

  update public.reports
  set pole_id = p_pole_id,
      pole_number = v_label,
      reported_post_identifier = coalesce(nullif(btrim(v_identifier), ''), v_label),
      reported_plate = coalesce(nullif(btrim(v_plate), ''), v_label),
      reported_pole_distance_m = v_distance
  where id = v_report_id;

  return v_report_id;
end;
$$;

grant execute on function public.complete_patrol_signal(
  uuid, text, text, double precision, double precision, bigint,
  double precision, double precision, bigint, text, text, text, boolean
) to authenticated;

comment on function public.complete_patrol_signal(
  uuid, text, text, double precision, double precision, bigint,
  double precision, double precision, bigint, text, text, text, boolean
) is
  'Completa um sinal e vincula opcionalmente um poste previamente mapeado. '
  'A distancia e recalculada no servidor; postes a mais de 100 m sao recusados.';

notify pgrst, 'reload schema';
