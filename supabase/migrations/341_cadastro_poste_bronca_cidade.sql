-- Cadastrar poste pela bronca deve alimentar o inventario da mesma cidade.
-- Mantem a assinatura antiga para apps ja instalados, sem criar postes sem cidade.
begin;

create or replace function public.create_pending_pole(
  p_lat double precision, p_lng double precision, p_identifier text,
  p_address text, p_plate text, p_city_id bigint
)
returns table (
  pole_id bigint, identifier text, plate text, address text,
  latitude double precision, longitude double precision, validation_status text
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_identifier text := nullif(btrim(p_identifier), '');
  v_dataset_id bigint;
  v_pole_id bigint;
  v_geom extensions.geography;
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado'; end if;
  if not exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.is_admin=true) then
    raise exception 'Apenas administradores podem cadastrar postes';
  end if;
  if p_lat is null or not (p_lat between -90 and 90) then raise exception 'Latitude invalida'; end if;
  if p_lng is null or not (p_lng between -180 and 180) then raise exception 'Longitude invalida'; end if;
  if v_identifier is null then raise exception 'Identificador do poste e obrigatorio'; end if;
  if p_city_id is null or not exists(select 1 from public.cities c where c.id=p_city_id) then
    raise exception 'Identifique a cidade do poste antes de cadastrar';
  end if;
  v_geom := extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography;

  -- Serializa repeticoes do mesmo codigo/cidade, incluindo cliques concorrentes.
  perform pg_advisory_xact_lock(hashtextextended('create_pending_pole:' || p_city_id || ':' || lower(v_identifier),0));
  select p.id into v_pole_id from public.poles p
  where (p.city_id=p_city_id or p.city_id is null)
    and (lower(btrim(p.identifier))=lower(v_identifier) or lower(btrim(p.plate))=lower(v_identifier))
    and p.validation_status is distinct from 'rejected'
    and p.lighting_status is distinct from 'removido'
    and extensions.st_dwithin(p.geom,v_geom,1)
  order by p.id limit 1 for update;

  if v_pole_id is not null then
    update public.poles p set city_id=p_city_id, validation_status='approved',
      approved_at=coalesce(p.approved_at,now()), approved_by=coalesce(p.approved_by,auth.uid()),
      address=coalesce(nullif(btrim(p.address),''),nullif(btrim(p_address),'')), updated_at=now()
    where p.id=v_pole_id;
  else
    select d.id into v_dataset_id from public.pole_datasets d
    where d.source='user_generated' order by d.id limit 1;
    if v_dataset_id is null then
      insert into public.pole_datasets(name,source,created_by)
      values('Postes cadastrados por usuarios','user_generated',auth.uid()) returning id into v_dataset_id;
    end if;
    insert into public.poles(dataset_id,city_id,identifier,plate,address,geom,latitude,longitude,
      raw_properties,validation_status,created_by,approved_at,approved_by)
    values(v_dataset_id,p_city_id,v_identifier,nullif(btrim(p_plate),''),nullif(btrim(p_address),''),
      v_geom,p_lat,p_lng,jsonb_build_object('source','user_submission','created_via','create_pending_pole'),
      'approved',auth.uid(),now(),auth.uid()) returning id into v_pole_id;
  end if;
  return query select p.id,p.identifier,p.plate,p.address,p.latitude,p.longitude,p.validation_status
  from public.poles p where p.id=v_pole_id;
end;
$$;

create or replace function public.create_pending_pole(
  p_lat double precision, p_lng double precision, p_identifier text,
  p_address text default null, p_plate text default null
)
returns table (
  pole_id bigint, identifier text, plate text, address text,
  latitude double precision, longitude double precision, validation_status text
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_city_id bigint;
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado'; end if;
  if not exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.is_admin=true) then
    raise exception 'Apenas administradores podem cadastrar postes';
  end if;
  -- Apps antigos nao enviam a cidade. So usa o entorno quando e inequivoco.
  select min(p.city_id) into v_city_id from public.poles p
  where p.city_id is not null and p.validation_status='approved'
    and p.lighting_status is distinct from 'removido'
    and extensions.st_dwithin(p.geom,
      extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography,80)
  having count(distinct p.city_id)=1;
  if v_city_id is null then
    raise exception 'Atualize o aplicativo para cadastrar o poste com a cidade correta';
  end if;
  return query select * from public.create_pending_pole(p_lat,p_lng,p_identifier,p_address,p_plate,v_city_id);
end;
$$;

revoke all on function public.create_pending_pole(double precision,double precision,text,text,text,bigint) from public,anon;
revoke all on function public.create_pending_pole(double precision,double precision,text,text,text) from public,anon;
grant execute on function public.create_pending_pole(double precision,double precision,text,text,text,bigint) to authenticated;
grant execute on function public.create_pending_pole(double precision,double precision,text,text,text) to authenticated;

-- Recupera somente cidades comprovadas por broncas vinculadas, sem escolher
-- arbitrariamente quando o mesmo poste foi associado a cidades diferentes.
with linked_city as (
  select r.pole_id,min(r.city_id) as city_id from public.reports r
  where r.pole_id is not null and r.city_id is not null
  group by r.pole_id having count(distinct r.city_id)=1
)
update public.poles p set city_id=c.city_id,updated_at=now()
from linked_city c where p.id=c.pole_id and p.city_id is null;

-- Bancos antigos ainda gravavam pending para cadastros feitos por admin.
-- Preserva rejeitados e cadastros submetidos por cidadaos.
update public.poles p set validation_status='approved',
  approved_at=coalesce(p.approved_at,now()),approved_by=coalesce(p.approved_by,p.created_by),updated_at=now()
where p.validation_status='pending' and p.city_id is not null
  and p.raw_properties->>'created_via'='create_pending_pole'
  and exists(select 1 from public.profiles pr where pr.id=p.created_by and pr.is_admin=true);

notify pgrst,'reload schema';
commit;
