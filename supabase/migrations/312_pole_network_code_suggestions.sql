-- Sugestões de códigos técnicos existentes na cidade, sem textos de ocorrências importadas.
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
    ('point_type'::text, coalesce(nullif(btrim(p.raw_properties->'municipal'->>'point_type'), ''), p.raw_properties->'kmz'->>'point_type')),
    ('network_type'::text, coalesce(nullif(btrim(p.raw_properties->'municipal'->>'network_type'), ''), p.raw_properties->'kmz'->>'network_type')),
    ('transformer_code'::text, coalesce(nullif(btrim(p.raw_properties->'municipal'->>'transformer_code'), ''), p.raw_properties->'kmz'->>'transformer_code')),
    ('switch_code'::text, coalesce(nullif(btrim(p.raw_properties->'municipal'->>'switch_code'), ''), p.raw_properties->'kmz'->>'switch_code'))
  ) as v(field, value)
  where p.city_id = p_city_id
    and nullif(btrim(v.value), '') is not null
    and (v.field not in ('transformer_code', 'switch_code')
      or btrim(v.value) ~ '^[[:alnum:]][[:alnum:]./_-]{0,39}$')
  order by 1, 2;
end $$;

revoke all on function public.opcoes_tecnicas_postes_municipais(bigint) from public, anon;
grant execute on function public.opcoes_tecnicas_postes_municipais(bigint) to authenticated;
notify pgrst, 'reload schema';
