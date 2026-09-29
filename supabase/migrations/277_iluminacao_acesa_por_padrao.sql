-- Postes sem status passam a funcionar por padrão, conforme a regra municipal.
-- O histórico mantém o estado anterior; outras situações não são alteradas.
begin;

alter table public.poles alter column lighting_status set default 'aceso';

with updated as (
  update public.poles
  set lighting_status = 'aceso', updated_at = now()
  where lighting_status = 'nao_informado'
  returning id, city_id, identifier, plate, address, lamp_power_w, lamp_type
)
insert into public.pole_lighting_changes (
  pole_id, city_id, pole_number, address, old_power_w, new_power_w,
  old_lamp_type, new_lamp_type, old_status, new_status, action, changed_by
)
select id, city_id, coalesce(nullif(identifier, ''), nullif(plate, ''), id::text),
  address, lamp_power_w, lamp_power_w, lamp_type, lamp_type,
  'nao_informado', 'aceso', 'updated', null
from updated where city_id is not null;

-- Importações ou chamadas antigas que ainda enviam o status anterior são normalizadas.
create or replace function public.normalizar_status_iluminacao()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.lighting_status = 'nao_informado' then new.lighting_status := 'aceso'; end if;
  return new;
end;
$$;
drop trigger if exists normalizar_status_iluminacao on public.poles;
create trigger normalizar_status_iluminacao
before insert or update of lighting_status on public.poles
for each row execute function public.normalizar_status_iluminacao();

commit;
