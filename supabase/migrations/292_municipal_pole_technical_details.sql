-- Permite que a prefeitura edite os dados técnicos sem alterar a origem KMZ.
-- A função de iluminação existente mantém a autorização e o histórico.
create or replace function public.gerir_iluminacao_municipal_detalhado(
  p_city_id bigint, p_action text, p_pole_id bigint, p_number text,
  p_address text, p_lat double precision, p_lng double precision,
  p_lamp_type text, p_power_w numeric, p_status text, p_details jsonb
) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id bigint;
begin
  if p_action <> 'removed' then
    if p_details is null or jsonb_typeof(p_details) <> 'object'
      or octet_length(p_details::text) > 16384 then
      raise exception 'Dados técnicos inválidos';
    end if;
    if p_details ? 'luminaires' and jsonb_typeof(p_details->'luminaires') <> 'array' then
      raise exception 'Luminárias inválidas';
    end if;
  end if;

  v_id := public.gerir_iluminacao_municipal(
    p_city_id, p_action, p_pole_id, p_number, p_address, p_lat, p_lng,
    p_lamp_type, p_power_w, p_status
  );

  if p_action <> 'removed' then
    update public.poles
    set plate = nullif(btrim(p_details->>'source_plate'), ''),
      raw_properties = jsonb_set(
        coalesce(raw_properties, '{}'::jsonb), '{municipal}', p_details, true
      )
    where id = v_id and city_id = p_city_id;
  end if;
  return v_id;
end $$;

revoke all on function public.gerir_iluminacao_municipal_detalhado(
  bigint,text,bigint,text,text,double precision,double precision,text,numeric,text,jsonb
) from public, anon;
grant execute on function public.gerir_iluminacao_municipal_detalhado(
  bigint,text,bigint,text,text,double precision,double precision,text,numeric,text,jsonb
) to authenticated;

notify pgrst, 'reload schema';
