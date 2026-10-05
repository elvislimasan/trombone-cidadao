-- Os dois pontos deste trecho ficam junto à Rua José do Carmo, mas o
-- geocodificador associou a rua paralela. Não altera coordenadas nem nomes
-- do cadastro de ruas. Preserva qualquer endereço confirmado por um usuário.
begin;
with expected(identifier, latitude, longitude) as (
  values ('X171815', -8.597442::double precision, -38.590736::double precision),
         ('X171816', -8.597515::double precision, -38.590472::double precision)
), eligible as materialized (
  select p.id, p.city_id, p.identifier, p.address, p.latitude, p.longitude,
    p.lamp_power_w, p.lamp_type, p.lighting_status
  from public.poles p
  join expected e on p.identifier ~ ('(^|[^A-Za-z0-9])' || e.identifier || '$')
    and p.latitude = e.latitude and p.longitude = e.longitude
  where p.city_id = 64 and p.lighting_status is distinct from 'removido'
    and p.address = 'Rua João Ernesto de Sá Menezes - Três Marias - Floresta - Pernambuco'
    and not exists (
      select 1 from public.pole_lighting_changes h
      where h.pole_id = p.id and h.changed_by is not null and h.address = p.address
    )
), updated as (
  update public.poles p
  set address = 'Rua José do Carmo Menezes de Sá - Três Marias - Floresta - Pernambuco'
  from eligible e where p.id = e.id and p.address = e.address
    and p.latitude = e.latitude and p.longitude = e.longitude
  returning p.id, p.address
)
insert into public.pole_lighting_changes (
  pole_id, city_id, pole_number, address, old_power_w, new_power_w,
  old_lamp_type, new_lamp_type, old_status, new_status, action, changed_by,
  old_latitude, old_longitude, new_latitude, new_longitude
)
select u.id, e.city_id, e.identifier, u.address, e.lamp_power_w, e.lamp_power_w,
  e.lamp_type, e.lamp_type, e.lighting_status, e.lighting_status, 'updated', null,
  e.latitude, e.longitude, e.latitude, e.longitude
from updated u join eligible e on e.id = u.id;
commit;
