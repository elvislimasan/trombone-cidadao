-- Locais turísticos migrados para o Guia podem ter recebido o ponto no cadastro antigo
-- depois da migração. Copia somente os pontos ainda ausentes no Guia.
update public.directory d
set location = s.location
from public.tourist_spots s
where d.legacy_source = 'tourist_spots'
  and d.legacy_source_id = s.id::text
  and d.location is null
  and s.location is not null;

-- Mantém a cópia pública atualizada enquanto existirem links/formulários antigos.
create or replace function public.sync_tourist_spot_location_to_directory()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.location is not null then
    update public.directory
    set location = new.location
    where legacy_source = 'tourist_spots'
      and legacy_source_id = new.id::text
      and location is distinct from new.location;
  end if;
  return new;
end;
$$;

drop trigger if exists tourist_spot_location_to_directory on public.tourist_spots;
create trigger tourist_spot_location_to_directory
after update of location on public.tourist_spots
for each row execute function public.sync_tourist_spot_location_to_directory();
