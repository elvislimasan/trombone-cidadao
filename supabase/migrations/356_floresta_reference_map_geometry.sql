-- Geometrias aproximadas extraídas do PDF fornecido como referência.
-- Não são limites oficiais: os bairros usam envoltórias manuais das quadras
-- identificadas, alinhadas aos traçados existentes de Floresta/PE.
-- Preserva qualquer contorno ou traçado já cadastrado. Não fecha linhas OSM abertas.
begin;
do $seed$
declare
  v_city_id bigint;
  v_count integer;
  v_bairro_id uuid;
  v_record jsonb;
  v_contornos jsonb := $contornos$
[
  {
    "name": "Alto da Ermida",
    "color": "#b3cfdb",
    "boundary": "SRID=4326;POLYGON((-38.57023831 -8.60644515,-38.56923019 -8.60582359,-38.56828507 -8.60520198,-38.56793218 -8.60467942,-38.56715098 -8.60470504,-38.56645802 -8.60489241,-38.56589107 -8.60520417,-38.56516035 -8.60564057,-38.56450514 -8.60559137,-38.564417 -8.60589024,-38.55923832 -8.60548414,-38.5590872 -8.60594491,-38.56126713 -8.60664009,-38.56091475 -8.60888133,-38.56362385 -8.60943908,-38.56677388 -8.60956069,-38.56891566 -8.60837603,-38.5699235 -8.60750364,-38.57042739 -8.60688071,-38.57023831 -8.60644515))",
    "source": {
      "provider": "manual",
      "reference_type": "pdf",
      "reference_name": "85d756cbccbac56683fb1d50c5ebe01861f90cd9 (3).pdf",
      "reference_sha256": "158db12be5f2b9eebb6462dcad0660949a91a924d5cbfcb4061fc148e12ec20e",
      "approximate": true,
      "method": "manual_outline_aligned_to_registered_streets",
      "created_at": "2026-10-08",
      "note": "Área aproximada das quadras identificadas no PDF. Não representa delimitação oficial."
    }
  },
  {
    "name": "Pedras de Josina",
    "color": "#d4c3b7",
    "boundary": "SRID=4326;POLYGON((-38.57949933 -8.60656117,-38.57975128 -8.6062497,-38.57949919 -8.60575195,-38.57735689 -8.60413548,-38.57597075 -8.60338977,-38.57399249 -8.60309279,-38.57434562 -8.6048603,-38.57434589 -8.60636669,-38.57546734 -8.60662711,-38.5758455 -8.60749823,-38.57685344 -8.60712382,-38.57748341 -8.60699875,-38.57798744 -8.60712278,-38.57874341 -8.6069976,-38.5794994 -8.60693466,-38.57949933 -8.60656117))",
    "source": {
      "provider": "manual",
      "reference_type": "pdf",
      "reference_name": "85d756cbccbac56683fb1d50c5ebe01861f90cd9 (3).pdf",
      "reference_sha256": "158db12be5f2b9eebb6462dcad0660949a91a924d5cbfcb4061fc148e12ec20e",
      "approximate": true,
      "method": "manual_outline_aligned_to_registered_streets",
      "created_at": "2026-10-08",
      "note": "Área aproximada das quadras identificadas no PDF. Não representa delimitação oficial."
    }
  }
]
$contornos$::jsonb;
  v_rua jsonb := $rua$
{
  "name": "Rua Dr. Márcio Falcão Ferraz",
  "bairro": "Santa Rosa",
  "path": "SRID=4326;MULTILINESTRING((-38.57906891 -8.59555619,-38.57714074 -8.59355359,-38.57571666 -8.59208585))",
  "location": "SRID=4326;POINT(-38.57714074 -8.59355359)",
  "path_source": "manual",
  "reference": "Trecho da via identificado no PDF de referência, alinhamento aproximado aos traçados existentes."
}
$rua$::jsonb;
begin
  select count(*), min(c.id) into v_count, v_city_id
  from public.cities c join public.states s on s.id = c.state_id
  where lower(btrim(c.name)) = 'floresta' and upper(btrim(s.uf)) = 'PE';
  if v_count = 0 then return; end if;
  if v_count <> 1 then raise exception 'Esperado um único município Floresta/PE.'; end if;
  perform 1 from public.cities where id = v_city_id for update;
  for v_record in select value from jsonb_array_elements(v_contornos)
  loop
    select count(*), (array_agg(b.id order by b.id))[1] into v_count, v_bairro_id
    from public.bairros b where b.city_id = v_city_id
      and public.report_neighborhood_key(b.name) = public.report_neighborhood_key(v_record ->> 'name');
    if v_count <> 1 then
      raise notice 'Bairro % ausente ou ambíguo; contorno preservado.', v_record ->> 'name';
      continue;
    end if;
    insert into public.pavement_neighborhood_boundaries(bairro_id, boundary, color, source)
    values (v_bairro_id, extensions.st_geomfromewkt(v_record ->> 'boundary'),
      v_record ->> 'color', v_record -> 'source')
    on conflict (bairro_id) do nothing;
  end loop;

  -- Completa somente o trecho identificado de uma rua que não tinha geometria.
  -- Correspondência única de nome + bairro + município; não altera status nem nome.
  select count(*) into v_count from public.pavement_streets p
  join public.bairros b on b.id = p.bairro_id
  where p.city_id = v_city_id and b.city_id = v_city_id
    and public.report_neighborhood_key(p.name) = public.report_neighborhood_key(v_rua ->> 'name')
    and public.report_neighborhood_key(b.name) = public.report_neighborhood_key(v_rua ->> 'bairro');
  if v_count = 1 then
    update public.pavement_streets p
    set path = extensions.st_geomfromewkt(v_rua ->> 'path'), path_source = 'manual',
      location = extensions.st_geomfromewkt(v_rua ->> 'location')
    from public.bairros b where b.id = p.bairro_id
      and p.city_id = v_city_id and b.city_id = v_city_id
      and public.report_neighborhood_key(p.name) = public.report_neighborhood_key(v_rua ->> 'name')
      and public.report_neighborhood_key(b.name) = public.report_neighborhood_key(v_rua ->> 'bairro')
      and p.path is null and p.location is null
      and (p.path_source is null or p.path_source = 'osm');
  end if;
end;
$seed$;
notify pgrst, 'reload schema';
commit;
