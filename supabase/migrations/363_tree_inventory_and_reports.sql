begin;

create function public.tree_catalog_key(p_value text) returns text
language sql immutable parallel safe set search_path=public,pg_temp as $$
  select regexp_replace(lower(translate(trim(coalesce(p_value,'')),
    'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')), '\s+', ' ', 'g')
$$;

-- Distância em metros; compartilhada pela busca próxima e validação do vínculo.
create function public.tree_distance_m(lat1 double precision,lng1 double precision,lat2 double precision,lng2 double precision)
returns double precision language sql immutable strict parallel safe as $$
  select 6371000 * 2 * asin(least(1.0,sqrt(
    power(sin(radians(lat2-lat1)/2),2) + cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2))))
$$;

create table public.city_tree_species (
  id uuid primary key default gen_random_uuid(),
  city_id bigint not null references public.cities(id) on delete cascade,
  common_name text not null check(length(trim(common_name)) between 1 and 160),
  scientific_name text check(length(scientific_name)<=200),
  origin text not null default 'nao_identificada' check(origin in ('nativa','exotica','nao_identificada')),
  created_at timestamptz not null default now()
);
create unique index tree_species_common_unique on public.city_tree_species(city_id,public.tree_catalog_key(common_name));
create unique index tree_species_scientific_unique on public.city_tree_species(city_id,public.tree_catalog_key(scientific_name))
  where nullif(trim(scientific_name),'') is not null;
alter table public.city_tree_species enable row level security;
grant select on public.city_tree_species to anon,authenticated;
grant insert on public.city_tree_species to authenticated;
create policy tree_species_read on public.city_tree_species for select to anon,authenticated using(true);
create policy tree_species_insert on public.city_tree_species for insert to authenticated
  with check(public.pode_gerenciar_mapa_ruas(city_id));

-- Consolida os pares existentes sem introduzir identificações botânicas novas.
insert into public.city_tree_species(city_id,common_name,scientific_name,origin)
select distinct on (city_id,public.tree_catalog_key(common_name)) city_id,trim(common_name),nullif(trim(scientific_name),''),origin
from public.city_trees order by city_id,public.tree_catalog_key(common_name),created_at
on conflict do nothing;

alter table public.city_trees
  add column species_id uuid references public.city_tree_species(id),
  add column bairro_id uuid references public.bairros(id),
  add column photo_url text check(length(photo_url)<=2000),
  add column planted_by text not null default 'nao_informado' check(planted_by in ('nao_informado','prefeitura','comunidade','outro')),
  add column estimated_birth_year integer check(estimated_birth_year between 1 and 9999),
  add column is_historic_site boolean not null default false;
update public.city_trees t set species_id=s.id from public.city_tree_species s where s.city_id=t.city_id
  and (public.tree_catalog_key(s.common_name)=public.tree_catalog_key(t.common_name)
    or (nullif(trim(t.scientific_name),'') is not null and public.tree_catalog_key(s.scientific_name)=public.tree_catalog_key(t.scientific_name)));
update public.city_trees t set bairro_id=b.id,neighborhood=b.name from public.bairros b
  where b.city_id=t.city_id and public.tree_catalog_key(b.name)=public.tree_catalog_key(t.neighborhood);
create index city_trees_bairro_idx on public.city_trees(city_id,bairro_id);
create index city_trees_planting_idx on public.city_trees(city_id,planted_by,planted_at);

create function public.canonical_tree_registration() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare species public.city_tree_species; neighborhood public.bairros;
begin
  if tg_op='UPDATE' then
    if new.city_id<>old.city_id then raise exception 'A cidade da árvore não pode ser alterada.'; end if;
    new.created_at=old.created_at;
  else new.created_at=now();
  end if;
  if new.species_id is null then
    new.common_name='Não identificada'; new.scientific_name=null; new.origin='nao_identificada';
  else
    select * into species from public.city_tree_species where id=new.species_id and city_id=new.city_id;
    if not found then raise exception 'Selecione uma espécie do catálogo desta cidade.'; end if;
    new.common_name=species.common_name; new.scientific_name=species.scientific_name; new.origin=species.origin;
  end if;
  if new.bairro_id is null then new.neighborhood=null;
  else
    select * into neighborhood from public.bairros where id=new.bairro_id and city_id=new.city_id;
    if not found then raise exception 'Selecione um bairro cadastrado nesta cidade.'; end if;
    new.neighborhood=neighborhood.name;
  end if;
  if new.estimated_birth_year>extract(year from current_date) then raise exception 'Ano estimado no futuro.'; end if;
  if new.planted_at>current_date then raise exception 'A data do plantio não pode estar no futuro.'; end if;
  return new;
end $$;
create trigger canonical_tree_registration before insert or update on public.city_trees
  for each row execute function public.canonical_tree_registration();

create table public.city_tree_care (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.city_trees(id) on delete restrict,
  service_type text not null check(service_type in ('poda','remocao','vistoria','tratamento','plantio')),
  performed_on date not null check(performed_on<=current_date),
  notes text check(length(notes)<=5000),
  recorded_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index tree_care_tree_idx on public.city_tree_care(tree_id,performed_on desc);
alter table public.city_tree_care enable row level security;
grant select on public.city_tree_care to anon,authenticated;
grant insert on public.city_tree_care to authenticated;
create policy tree_care_read on public.city_tree_care for select to anon,authenticated using(true);
create policy tree_care_insert on public.city_tree_care for insert to authenticated with check(
  recorded_by=auth.uid() and exists(select 1 from public.city_trees t where t.id=tree_id and public.pode_gerenciar_mapa_ruas(t.city_id)));

alter table public.reports
  add column tree_id uuid references public.city_trees(id) on delete restrict,
  add column tree_service text check(tree_service in ('poda','remocao','vistoria','tratamento','plantio')),
  add column tree_registration jsonb;
create index reports_tree_idx on public.reports(tree_id,created_at) where tree_id is not null;

-- O cadastro cidadão só ocorre dentro da mesma transação que cria a bronca.
-- Não concede escrita direta ao inventário nem acesso aos dados de gestão.
create function public.report_tree_registration() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.city_trees; payload jsonb; lat double precision; lng double precision;
begin
  if tg_op='UPDATE' and (new.tree_registration is not null or new.tree_id is distinct from old.tree_id) then
    if not public.pode_gerenciar_mapa_ruas(new.city_id) then raise exception 'Apenas a equipe municipal pode alterar o vínculo de uma árvore.'; end if;
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
create trigger report_tree_registration before insert or update of tree_id,tree_registration,tree_service,city_id,category_id,location on public.reports
  for each row execute function public.report_tree_registration();
revoke all on function public.report_tree_registration() from public,anon,authenticated;

create function public.nearby_report_trees(p_lat double precision,p_lng double precision,p_city_id bigint default null)
returns setof public.city_trees language sql stable security invoker set search_path=public,pg_temp as $$
  select t.* from public.city_trees t where t.status<>'removida' and (p_city_id is null or t.city_id=p_city_id)
    and public.tree_distance_m(t.latitude,t.longitude,p_lat,p_lng)<=80
  order by public.tree_distance_m(t.latitude,t.longitude,p_lat,p_lng),t.id
$$;
revoke all on function public.nearby_report_trees(double precision,double precision,bigint) from public;
grant execute on function public.nearby_report_trees(double precision,double precision,bigint) to anon,authenticated;

create function public.city_tree_request_counts(p_city_id bigint default null)
returns table(tree_id uuid,total bigint,poda bigint,remocao bigint,vistoria bigint,tratamento bigint,plantio bigint)
language sql stable security invoker set search_path=public,pg_temp as $$
  select r.tree_id,count(*),count(*) filter(where r.tree_service='poda'),count(*) filter(where r.tree_service='remocao'),
    count(*) filter(where r.tree_service='vistoria'),count(*) filter(where r.tree_service='tratamento'),count(*) filter(where r.tree_service='plantio')
  from public.reports r where r.tree_id is not null and r.status<>'duplicate'
    and (p_city_id is null or r.city_id=p_city_id)
  group by r.tree_id
$$;
revoke all on function public.city_tree_request_counts(bigint) from public;
grant execute on function public.city_tree_request_counts(bigint) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tree-photos','tree-photos',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy tree_photos_read on storage.objects for select to anon,authenticated using(bucket_id='tree-photos');
create policy tree_photos_insert on storage.objects for insert to authenticated with check(bucket_id='tree-photos'
  and (storage.foldername(name))[2]=auth.uid()::text
  and exists(select 1 from public.cities c where c.id::text=(storage.foldername(name))[1]));
create policy tree_photos_delete on storage.objects for delete to authenticated using(bucket_id='tree-photos'
  and (storage.foldername(name))[2]=auth.uid()::text);

notify pgrst,'reload schema';
commit;
