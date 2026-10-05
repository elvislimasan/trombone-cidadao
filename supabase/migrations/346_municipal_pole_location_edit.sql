-- Permite corrigir postes existentes com as mesmas permissões municipais.
-- Coordenadas e ponto geográfico são atualizados juntos, com histórico.
begin;
alter table public.pole_lighting_changes
  add column if not exists old_latitude double precision,
  add column if not exists old_longitude double precision,
  add column if not exists new_latitude double precision,
  add column if not exists new_longitude double precision;

create or replace function public.gerir_iluminacao_municipal(
  p_city_id bigint, p_action text, p_pole_id bigint default null, p_number text default null,
  p_address text default null, p_lat double precision default null, p_lng double precision default null,
  p_lamp_type text default null, p_power_w numeric default null, p_status text default 'nao_informado'
) returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_pole public.poles%rowtype; v_id bigint; v_dataset bigint;
begin
  if not public.pode_acessar_prefeitura(auth.uid(), p_city_id) or not (
    public.pode_administrar_prefeitura(auth.uid(), p_city_id) or exists (
      select 1 from public.orgao_membros m
      join public.orgao_canais c on c.id = m.canal_id
      join public.orgao_categorias oc on oc.canal_id = c.id and oc.category_id = 'iluminacao'
      where m.user_id = auth.uid() and m.ativo and m.papel = 'gestor' and c.city_id = p_city_id
    )
  ) then raise exception 'Somente o gestor de iluminação ou administrador municipal pode alterar postes'; end if;
  if p_action is null or p_action not in ('created','updated','removed') then raise exception 'Ação inválida'; end if;
  if p_status is null or p_status not in ('nao_informado','aceso','apagado','manutencao','removido') then raise exception 'Status inválido'; end if;
  if p_power_w is not null and (p_power_w <= 0 or p_power_w > 999999) then raise exception 'Potência inválida'; end if;
  if p_action <> 'removed' and (p_lat is not null or p_lng is not null) then
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'Latitude e longitude válidas devem ser informadas juntas';
    end if;
  end if;
  if p_action = 'created' then
    if nullif(btrim(coalesce(p_number,'')), '') is null or p_lat is null or p_lng is null
       or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
      raise exception 'Número e coordenadas válidas são obrigatórios'; end if;
    select id into v_dataset from public.pole_datasets
      where source = 'municipal' and name = 'Prefeitura ' || p_city_id::text limit 1;
    if v_dataset is null then
      insert into public.pole_datasets(name,source,created_by)
      values ('Prefeitura ' || p_city_id::text,'municipal',auth.uid()) returning id into v_dataset;
    end if;
    insert into public.poles(dataset_id,city_id,identifier,address,geom,latitude,longitude,
      lamp_type,lamp_power_w,lighting_status,validation_status,created_by)
    values (v_dataset,p_city_id,btrim(p_number),nullif(btrim(coalesce(p_address,'')),''),
      extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography,
      p_lat,p_lng,nullif(btrim(coalesce(p_lamp_type,'')),''),p_power_w,p_status,'approved',auth.uid())
    returning id into v_id;
  else
    select * into v_pole from public.poles where id = p_pole_id and city_id = p_city_id for update;
    if v_pole.id is null then raise exception 'Poste não encontrado nesta cidade'; end if;
    v_id := v_pole.id;
    if p_action = 'removed' then
      update public.poles set lighting_status = 'removido' where id = v_id;
    else
      update public.poles set identifier = coalesce(nullif(btrim(coalesce(p_number,'')),''),identifier),
        address = nullif(btrim(coalesce(p_address,'')),''),
        lamp_type = nullif(btrim(coalesce(p_lamp_type,'')),''), lamp_power_w = p_power_w,
        lighting_status = p_status,
        latitude = coalesce(p_lat, latitude), longitude = coalesce(p_lng, longitude),
        geom = case when p_lat is not null and p_lng is not null
          then extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography
          else geom end
        where id = v_id;
    end if;
  end if;
  insert into public.pole_lighting_changes(pole_id,city_id,pole_number,address,old_power_w,new_power_w,
    old_lamp_type,new_lamp_type,old_status,new_status,action,changed_by,old_latitude,old_longitude,new_latitude,new_longitude)
  select p.id,p_city_id,coalesce(p.identifier,p.plate,p.id::text),p.address,
    v_pole.lamp_power_w,p.lamp_power_w,v_pole.lamp_type,p.lamp_type,
    v_pole.lighting_status,p.lighting_status,p_action,auth.uid(),v_pole.latitude,v_pole.longitude,p.latitude,p.longitude
  from public.poles p where p.id = v_id;
  return v_id;
end $$;
revoke all on function public.gerir_iluminacao_municipal(bigint,text,bigint,text,text,double precision,double precision,text,numeric,text) from public, anon;
grant execute on function public.gerir_iluminacao_municipal(bigint,text,bigint,text,text,double precision,double precision,text,numeric,text) to authenticated;


notify pgrst, 'reload schema';
commit;
