begin;
-- Aplicar após preparar as concessões de arborização da migração 369.
-- Não copia gestores de ruas nem altera inventário, códigos AR ou históricos.
alter policy city_trees_insert on public.city_trees with check(public.pode_gerenciar_arborizacao(city_id));
alter policy city_trees_update on public.city_trees using(public.pode_gerenciar_arborizacao(city_id)) with check(public.pode_gerenciar_arborizacao(city_id));
alter policy city_trees_delete on public.city_trees using(public.pode_gerenciar_arborizacao(city_id));
alter policy tree_species_insert on public.city_tree_species with check(public.pode_gerenciar_arborizacao(city_id));
alter policy tree_care_insert on public.city_tree_care with check(recorded_by=auth.uid() and exists(
  select 1 from public.city_trees t where t.id=tree_id and public.pode_gerenciar_arborizacao(t.city_id)));
create or replace function public.report_tree_registration() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.city_trees; payload jsonb; lat double precision; lng double precision;
begin
  if tg_op='UPDATE' and (new.tree_registration is not null or new.tree_id is distinct from old.tree_id) then
    if not public.pode_gerenciar_arborizacao(new.city_id) then raise exception 'Apenas a equipe municipal pode alterar o vínculo de uma árvore.'; end if;
  end if;
  if new.tree_id is null and new.tree_registration is null then
    new.tree_service=null; return new;
  end if;
  if new.category_id is distinct from 'poda' or new.city_id is null then raise exception 'Vínculo de árvore exige uma solicitação de arborização e cidade.'; end if;
  if new.tree_registration is not null then
    if auth.uid() is null or new.author_id is distinct from auth.uid() then raise exception 'Autenticação necessária.'; end if;
    if new.tree_id is not null then raise exception 'Selecione uma árvore ou cadastre uma nova.'; end if;
    payload=new.tree_registration;
    lat=(payload->>'latitude')::double precision; lng=(payload->>'longitude')::double precision;
    if lat is null or lng is null or not(lat between -90 and 90 and lng between -180 and 180) then raise exception 'Localização inválida.'; end if;
    perform pg_advisory_xact_lock(hashtext('tree-registration'),hashtext(new.city_id::text));
    -- Evita duplicar o mesmo ponto inclusive em envios concorrentes.
    select * into t from public.city_trees where city_id=new.city_id and status<>'removida'
      and public.tree_distance_m(latitude,longitude,lat,lng)<=3
      order by created_at limit 1;
    if t.id is null then
      insert into public.city_trees(city_id,common_name,species_id,bairro_id,latitude,longitude,address,photo_url)
      values(new.city_id,'Não identificada',nullif(payload->>'species_id','')::uuid,nullif(payload->>'bairro_id','')::uuid,
        lat,lng,left(payload->>'address',300),nullif(payload->>'photo_url','')) returning * into t;
    end if;
    new.tree_id=t.id; new.tree_registration=null;
  else select * into t from public.city_trees where id=new.tree_id;
  end if;
  if t.id is null or t.city_id<>new.city_id then raise exception 'Árvore não encontrada nesta cidade.'; end if;
  if tg_op='INSERT' and t.status='removida' then raise exception 'Esta árvore já foi removida do inventário ativo.'; end if;
  if new.location is null or public.tree_distance_m(extensions.st_y(new.location::extensions.geometry),extensions.st_x(new.location::extensions.geometry),t.latitude,t.longitude)>80 then
    raise exception 'A árvore deve estar a até 80 metros do local da solicitação.';
  end if;
  new.tree_service=coalesce(new.tree_service,'poda');
  return new;
end $$;
notify pgrst,'reload schema';
commit;
