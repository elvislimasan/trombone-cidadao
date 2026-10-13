-- Complemento opcional do catálogo. A migração 279 já cadastra Bomba.
-- Executar no SQL Editor do projeto de produção confirmado.
-- Edite v_bairros APENAS com nomes canônicos revisados para Floresta/PE.
-- Não transforma retornos compostos do geocoder em novos bairros.
begin;
do $seed$
declare
  v_city_id bigint;
  v_count integer;
  v_bairros text[] := array['Bomba'];
begin
  select count(*), min(c.id) into v_count, v_city_id
  from public.cities c join public.states s on s.id = c.state_id
  where lower(btrim(c.name)) = 'floresta' and upper(s.uf) = 'PE';
  if v_count <> 1 then
    raise exception 'Esperada uma única cidade Floresta/PE; encontradas %', v_count;
  end if;
  if v_bairros is null or cardinality(v_bairros) = 0 or exists (
    select 1 from unnest(v_bairros) as x(name) where nullif(btrim(name), '') is null
  ) then raise exception 'Preencha a lista de bairros revisados'; end if;

  insert into public.bairros(name, city_id)
  select distinct btrim(x.name), v_city_id from unnest(v_bairros) as x(name)
  where not exists (
    select 1 from public.bairros b
    where b.city_id = v_city_id and lower(btrim(b.name)) = lower(btrim(x.name))
  )
  on conflict do nothing;
  raise notice 'Catálogo conferido para Floresta/PE, city_id=%', v_city_id;
end;
$seed$;

select b.id, b.name, b.city_id from public.bairros b
join public.cities c on c.id = b.city_id join public.states s on s.id = c.state_id
where lower(btrim(c.name)) = 'floresta' and upper(s.uf) = 'PE'
order by b.name;
commit;
