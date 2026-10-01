-- Opções usadas nos postes da cidade, incluindo cadastro original e correções municipais.
create or replace function public.opcoes_tecnicas_postes_municipais(p_city_id bigint)
returns table(field text, value text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.pode_acessar_prefeitura(auth.uid(), p_city_id) then
    raise exception 'Sem acesso à prefeitura';
  end if;
  return query
  select distinct v.field, btrim(v.value)
  from public.poles p
  cross join lateral (values
    ('lamp_type'::text, p.lamp_type),
    ('point_type'::text, coalesce(p.raw_properties->'municipal'->>'point_type', p.raw_properties->'kmz'->>'point_type')),
    ('network_type'::text, coalesce(p.raw_properties->'municipal'->>'network_type', p.raw_properties->'kmz'->>'network_type')),
    ('quality'::text, coalesce(p.raw_properties->'municipal'->>'quality', p.raw_properties->'kmz'->>'quality')),
    ('characteristic'::text, coalesce(p.raw_properties->'municipal'->>'characteristic', p.raw_properties->'kmz'->>'characteristic'))
  ) as v(field, value)
  where p.city_id = p_city_id and nullif(btrim(v.value), '') is not null
  order by 1, 2;
end $$;

revoke all on function public.opcoes_tecnicas_postes_municipais(bigint) from public, anon;
grant execute on function public.opcoes_tecnicas_postes_municipais(bigint) to authenticated;
notify pgrst, 'reload schema';
