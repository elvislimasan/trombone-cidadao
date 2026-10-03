begin;

-- Sem termo de busca, sugere postes próximos ao pin da própria ordem.
-- A cidade e o acesso continuam validados pela ordem atribuída ao eletricista.
create or replace function public.buscar_postes_ordem_eletricista(p_prefeitura uuid, p_ordem uuid, p_busca text default '')
returns table(id bigint, identifier text, plate text, address text, latitude double precision,
  longitude double precision, lamp_type text, lamp_power_w numeric, raw_properties jsonb, updated_at timestamptz)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v_city bigint;
  v_latitude double precision;
  v_longitude double precision;
  v_busca text := btrim(coalesce(p_busca, ''));
begin
  select p.city_id, d.latitude, d.longitude into v_city, v_latitude, v_longitude
  from public.demandas_municipais d
  join public.prefeituras p on p.id=d.prefeitura_id
  where d.id=p_ordem and d.prefeitura_id=p_prefeitura and p.status='ativa'
    and d.category_id='iluminacao' and d.atribuido_a=auth.uid()
    and public.pode_operar_demanda(auth.uid(),d.id);
  if v_city is null then raise exception 'Sem acesso a esta ordem'; end if;

  if v_busca = '' then
    if v_latitude is null or v_longitude is null
      or v_latitude not between -90 and 90 or v_longitude not between -180 and 180 then return; end if;
    return query
    with pin as (
      select extensions.st_setsrid(extensions.st_makepoint(v_longitude,v_latitude),4326)::extensions.geography as location
    )
    select p.id,p.identifier,p.plate,p.address,p.latitude,p.longitude,
      p.lamp_type,p.lamp_power_w,p.raw_properties,p.updated_at
    from public.poles p cross join pin
    where p.city_id=v_city and p.lighting_status is distinct from 'removido'
      and extensions.st_dwithin(p.geom, pin.location, 300)
    order by extensions.st_distance(p.geom, pin.location), p.id
    limit 12;
    return;
  end if;

  if length(v_busca)<2 then return; end if;
  return query select p.id,p.identifier,p.plate,p.address,p.latitude,p.longitude,
    p.lamp_type,p.lamp_power_w,p.raw_properties,p.updated_at
  from public.poles p where p.city_id=v_city and p.lighting_status is distinct from 'removido'
    and (p.identifier ilike '%'||left(v_busca,120)||'%'
      or p.plate ilike '%'||left(v_busca,120)||'%'
      or p.address ilike '%'||left(v_busca,120)||'%')
  order by (p.identifier=v_busca) desc nulls last,p.identifier,p.id limit 30;
end $$;

revoke all on function public.buscar_postes_ordem_eletricista(uuid,uuid,text) from public,anon;
grant execute on function public.buscar_postes_ordem_eletricista(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
