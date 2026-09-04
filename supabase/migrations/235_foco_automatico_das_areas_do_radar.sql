-- Sugere o ponto do mapa a partir da malha de ruas que o app ja possui.
-- O ponto e apenas uma sugestao inicial: o gestor continua podendo arrasta-lo.

create or replace function public.get_city_event_area_focus(
  p_city_id bigint,
  p_area_type text,
  p_area_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_centro extensions.geometry;
  v_label text;
begin
  if p_area_type = 'street' and p_area_id is not null then
    select
      case
        when s.path is not null then extensions.st_centroid(s.path)
        else s.location
      end,
      s.name
    into v_centro, v_label
    from public.pavement_streets s
    where s.id = p_area_id and s.city_id = p_city_id;

  elsif p_area_type = 'neighborhood' and p_area_id is not null then
    select b.name into v_label
    from public.bairros b
    where b.id = p_area_id and b.city_id = p_city_id;

    if found then
      select extensions.st_centroid(extensions.st_collect(x.geom))
      into v_centro
      from (
        select coalesce(s.path, s.location) as geom
        from public.pavement_streets s
        where s.city_id = p_city_id
          and s.bairro_id = p_area_id
          and coalesce(s.path, s.location) is not null
      ) x;
    end if;

  elsif p_area_type = 'city' and p_area_id is null then
    select c.name into v_label from public.cities c where c.id = p_city_id;

    if found then
      select extensions.st_centroid(extensions.st_collect(x.geom))
      into v_centro
      from (
        select coalesce(s.path, s.location) as geom
        from public.pavement_streets s
        where s.city_id = p_city_id
          and coalesce(s.path, s.location) is not null
      ) x;
    end if;
  else
    return null;
  end if;

  if v_centro is null then return null; end if;

  return jsonb_build_object(
    'lat', extensions.st_y(v_centro),
    'lng', extensions.st_x(v_centro),
    'label', v_label,
    'source', 'street_map'
  );
end;
$$;

comment on function public.get_city_event_area_focus(bigint, text, uuid) is
  'Centro sugerido para um acontecimento, calculado do tracado/ponto das ruas da area.';

grant execute on function public.get_city_event_area_focus(bigint, text, uuid)
  to authenticated;

notify pgrst, 'reload schema';
