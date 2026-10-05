-- O bairro dos postes já está presente em muitos endereços corrigidos, mas
-- não foi persistido em raw_properties. Não usa source_address do KMZ: o
-- setor antigo pode divergir do endereço atual e das coordenadas do poste.
begin;

create or replace function public.pole_explicit_neighborhood(p_properties jsonb)
returns text language sql immutable
set search_path = public
as $fn$
  select nullif(btrim(field.value), '')
  from (values
    (1, p_properties->'municipal'), (2, p_properties), (3, p_properties->'kmz')
  ) as layer(priority, properties)
  cross join lateral jsonb_each_text(case when jsonb_typeof(layer.properties)='object'
    then layer.properties else '{}'::jsonb end) as field
  where lower(field.key) in ('bairro', 'neighborhood', 'neighbourhood')
    and nullif(btrim(field.value), '') is not null
  order by layer.priority, field.key limit 1;
$fn$;

create or replace function public.assign_pole_neighborhood()
returns trigger language plpgsql
set search_path = public
as $fn$
declare
  v_properties jsonb := case when jsonb_typeof(new.raw_properties)='object'
    then new.raw_properties else '{}'::jsonb end;
  v_explicit text;
  v_name text;
begin
  if tg_op='UPDATE' and old.raw_properties->>'neighborhood_source' in ('address','linked_report','coordinates') then
    if new.city_id is distinct from old.city_id
      or new.latitude is distinct from old.latitude or new.longitude is distinct from old.longitude then
      -- Marcador movido: não carregar uma associação automática do ponto antigo.
      new.raw_properties := v_properties - 'neighborhood' - 'neighborhood_source';
      return new;
    end if;
    if new.address is distinct from old.address and old.raw_properties->>'neighborhood_source'='address' then
      v_properties := v_properties - 'neighborhood' - 'neighborhood_source';
    end if;
  end if;
  v_explicit := public.pole_explicit_neighborhood(v_properties);
  v_name := public.resolve_report_neighborhood(new.city_id, v_explicit, new.address);
  if v_name is not null then
    v_properties := v_properties || jsonb_build_object('neighborhood',v_name);
    if v_explicit is null then
      v_properties := v_properties || jsonb_build_object('neighborhood_source','address');
    end if;
  end if;
  new.raw_properties := v_properties;
  return new;
end;
$fn$;

drop trigger if exists poles_assign_neighborhood on public.poles;
create trigger poles_assign_neighborhood
before insert or update of city_id, address, latitude, longitude, raw_properties on public.poles
for each row execute function public.assign_pole_neighborhood();

with linked as (
  select p.id,
    case when count(distinct public.report_neighborhood_key(r.neighborhood))=1
      then public.resolve_report_neighborhood(p.city_id, min(r.neighborhood), null) end as name
  from public.poles p join public.reports r on r.pole_id=p.id and r.city_id=p.city_id
  where nullif(btrim(r.neighborhood),'') is not null and r.status is distinct from 'duplicate'
    and (r.moderation_status in ('approved','internal') or r.moderation_status is null)
  group by p.id,p.city_id
), candidates as (
  select p.id, public.pole_explicit_neighborhood(p.raw_properties) as explicit,
    public.resolve_report_neighborhood(p.city_id, null, p.address) as address_name,
    l.name as linked_name
  from public.poles p left join linked l on l.id=p.id
  where p.city_id is not null and p.lighting_status <> 'removido'
), resolved as (
  select id, coalesce(address_name, linked_name) as name,
    case when address_name is not null then 'address' else 'linked_report' end as source
  from candidates where explicit is null
)
update public.poles p
set raw_properties = coalesce(p.raw_properties,'{}'::jsonb)
  || jsonb_build_object('neighborhood',r.name,'neighborhood_source',r.source)
from resolved r where r.id=p.id and r.name is not null;

commit;
