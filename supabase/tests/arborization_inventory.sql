-- Banco LOCAL descartável. O tipo point simula apenas as coordenadas do PostGIS.
\set ON_ERROR_STOP on
\i supabase/tests/arborization.sql
-- Reproduz o nome de cidade real para detectar referências ambíguas nas policies.
alter table public.cities add column name text;
update public.cities set name=case when id=64 then 'Floresta' else 'Recife' end;
create schema extensions;
create domain extensions.geometry as point;
create function extensions.st_x(p point) returns double precision language sql immutable as $$select p[0]$$;
create function extensions.st_y(p point) returns double precision language sql immutable as $$select p[1]$$;
create table public.reports(id uuid primary key default gen_random_uuid(),city_id bigint references cities,
  author_id uuid references profiles,category_id text,location extensions.geometry,title text,created_at timestamptz default now(),
  status text default 'pending',moderation_status text default 'approved',is_public boolean default true);
alter table public.reports enable row level security;
grant select,insert,update,delete on public.reports to authenticated;
grant select on public.reports,public.bairros to anon;
create policy reports_read on public.reports for select using(
  (is_public and moderation_status='approved') or author_id=auth.uid() or public.pode_gerenciar_mapa_ruas(city_id));
create policy reports_insert on public.reports for insert to authenticated with check(author_id=auth.uid());
create policy reports_update on public.reports for update to authenticated using(author_id=auth.uid()) with check(author_id=auth.uid());
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create function storage.foldername(p text) returns text[] language sql immutable as $$select string_to_array(p,'/')$$;
\i supabase/migrations/363_tree_inventory_and_reports.sql
\i supabase/migrations/364_tree_photo_storage_path.sql
drop policy legacy_write on storage.objects;
create function public.test_reject(statement text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then return;
  end;
  raise exception 'Operação inválida aceita: %',statement;
end $$;
update public.permission_rules set allowed=true where module='urban_planning';

set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
insert into public.city_tree_species(id,city_id,common_name,scientific_name,origin)
values('20000000-0000-0000-0000-000000000064',64,'Ipê-amarelo','Handroanthus albus','nativa');
select public.test_reject($q$insert into public.city_tree_species(city_id,common_name) values(64,' IPE-AMARELO ')$q$);
select public.test_reject($q$insert into public.city_tree_species(city_id,common_name,scientific_name) values(64,'Outra grafia','handroanthus ALBUS')$q$);
select public.test_denied($q$insert into public.city_tree_species(city_id,common_name) values(65,'Cidade errada')$q$);
insert into public.city_trees(id,city_id,common_name,scientific_name,species_id,bairro_id,latitude,longitude,created_at)
values('30000000-0000-0000-0000-000000000064',64,'Nome livre','Texto livre','20000000-0000-0000-0000-000000000064','10000000-0000-0000-0000-000000000064',-8.601,-38.571,'2000-01-01');
select public.test_assert((select common_name='Ipê-amarelo' and scientific_name='Handroanthus albus' and neighborhood='Centro' and created_at>now()-interval '1 minute' from city_trees where id='30000000-0000-0000-0000-000000000064'),'Catálogos não canonizaram o cadastro');
select public.test_reject($q$update public.city_trees set bairro_id='10000000-0000-0000-0000-000000000065' where id='30000000-0000-0000-0000-000000000064'$q$);
select public.test_reject($q$update public.city_trees set estimated_birth_year=9999 where id='30000000-0000-0000-0000-000000000064'$q$);
insert into public.city_tree_care(tree_id,service_type,performed_on) values('30000000-0000-0000-0000-000000000064','poda','2025-06-01');
select public.test_reject($q$insert into public.city_tree_care(tree_id,service_type,performed_on) values('30000000-0000-0000-0000-000000000064','poda',current_date+1)$q$);

-- Cidadão pode cadastrar a árvore ao enviar bronca, sem escrever no inventário.
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_denied($q$insert into public.city_tree_care(tree_id,service_type,performed_on) values('30000000-0000-0000-0000-000000000064','poda',current_date)$q$);
select public.test_denied($q$insert into public.city_tree_species(city_id,common_name) values(64,'Cidadão')$q$);
insert into public.reports(id,city_id,author_id,category_id,location,tree_id,tree_service)
values('40000000-0000-0000-0000-000000000064',64,auth.uid(),'poda',point(-38.571,-8.601),'30000000-0000-0000-0000-000000000064','poda');
select public.test_reject($q$insert into public.reports(city_id,author_id,category_id,location,tree_id) values(65,auth.uid(),'poda',point(-38.571,-8.601),'30000000-0000-0000-0000-000000000064')$q$);
select public.test_reject($q$insert into public.reports(city_id,author_id,category_id,location,tree_id) values(64,auth.uid(),'poda',point(-38,-8),'30000000-0000-0000-0000-000000000064')$q$);
select public.test_reject($q$update public.reports set tree_id=null where id='40000000-0000-0000-0000-000000000064'$q$);
insert into public.reports(id,city_id,author_id,category_id,location,tree_registration)
values('50000000-0000-0000-0000-000000000064',64,auth.uid(),'poda',point(-38.573,-8.603),
 '{"latitude":-8.603,"longitude":-38.573,"species_id":"20000000-0000-0000-0000-000000000064","bairro_id":"10000000-0000-0000-0000-000000000064","planted_by":"prefeitura","is_historic_site":true}');
select public.test_assert((select tree_id is not null and tree_registration is null from public.reports where id='50000000-0000-0000-0000-000000000064'),'Bronca não vinculou cadastro');
select public.test_assert((select t.planted_by='nao_informado' and not t.is_historic_site from city_trees t join reports r on t.id=r.tree_id where r.id='50000000-0000-0000-0000-000000000064'),'Cidadão alterou dados de gestão');
insert into public.reports(id,city_id,author_id,category_id,location,tree_registration)
values('60000000-0000-0000-0000-000000000064',64,auth.uid(),'poda',point(-38.573,-8.603),'{"latitude":-8.603,"longitude":-38.573}');
select public.test_assert((select count(distinct tree_id)=1 from public.reports where id in('50000000-0000-0000-0000-000000000064','60000000-0000-0000-0000-000000000064')),'Cadastro próximo duplicou árvore');
select public.test_reject($q$insert into public.reports(city_id,author_id,category_id,location,tree_registration) values(64,auth.uid(),'poda',point(-38.58,-8.61),'{"latitude":-8.62,"longitude":-38.59}')$q$);
select public.test_assert(not exists(select 1 from city_trees where latitude=-8.62),'Falha da bronca deixou árvore órfã');
reset role;
insert into public.reports(city_id,author_id,category_id,location,tree_id,tree_service,is_public,moderation_status)
values(64,'00000000-0000-0000-0000-000000000003','poda',point(-38.571,-8.601),'30000000-0000-0000-0000-000000000064','remocao',false,'internal');
set role anon;
set test.user_id='';
select public.test_assert((select total=1 and poda=1 and remocao=0 from public.city_tree_request_counts(64) where tree_id='30000000-0000-0000-0000-000000000064'),'Indicadores vazaram solicitação privada');
select public.test_assert((select count(*)=1 from public.nearby_report_trees(-8.601,-38.571,64)),'Busca por proximidade incorreta');
select public.test_assert((select count(*)=0 from public.nearby_report_trees(-8.601,-38.571,65)),'Busca misturou cidades');
reset role;
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000002';
insert into storage.objects(bucket_id,name)
  values('tree-photos','64/00000000-0000-0000-0000-000000000002/tree.jpg') returning name;
select public.test_assert(exists(select 1 from storage.objects where bucket_id='tree-photos'
  and name='64/00000000-0000-0000-0000-000000000002/tree.jpg'),'Upload válido da árvore foi recusado');
select public.test_denied($q$insert into storage.objects(bucket_id,name) values('tree-photos','64/00000000-0000-0000-0000-000000000001/other.jpg')$q$);
select public.test_denied($q$insert into storage.objects(bucket_id,name) values('tree-photos','999999/00000000-0000-0000-0000-000000000002/unknown-city.jpg')$q$);
select public.test_denied($q$insert into storage.objects(bucket_id,name) values('tree-photos','Floresta/00000000-0000-0000-0000-000000000002/city-name.jpg')$q$);
delete from storage.objects where bucket_id='tree-photos' and name='64/00000000-0000-0000-0000-000000000002/tree.jpg';
set role anon;
set test.user_id='';
select public.test_denied($q$insert into storage.objects(bucket_id,name) values('tree-photos','64/00000000-0000-0000-0000-000000000002/anonymous.jpg')$q$);
reset role;
select 'Inventário: catálogo, bairros, RLS, histórico, vínculos, cadastro atômico, proximidade e contagens OK';
