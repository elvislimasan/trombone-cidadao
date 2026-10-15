-- Teste de integração: execute com psql na raiz do repositório, em um banco
-- LOCAL VAZIO e descartável. Cria somente fixtures; não usa dados reais.
\set ON_ERROR_STOP on
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.user_id', true), '')::uuid
$$;
create table public.profiles(id uuid primary key, user_type text default 'public_official', is_admin boolean default false,
  is_master boolean default false, is_ambassador boolean default false);
create function public.is_admin(p_user uuid) returns boolean language sql stable security definer as $$
  select coalesce((select is_admin from public.profiles where id=p_user), false)
$$;
create function public.is_master(p_user uuid) returns boolean language sql stable security definer as $$
  select coalesce((select is_master from public.profiles where id=p_user), false)
$$;
create table public.cities(id bigint primary key, pavement_street_map_url text, pavement_cep_list_url text);
create table public.bairros(id uuid primary key default gen_random_uuid(), city_id bigint references cities, name text);
create table public.pavement_streets(id uuid primary key default gen_random_uuid(), city_id bigint references cities, name text);
create table public.pavement_neighborhood_boundaries(bairro_id uuid primary key references bairros, boundary jsonb);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table public.pavement_streets enable row level security;
alter table public.pavement_neighborhood_boundaries enable row level security;
alter table public.bairros enable row level security;
alter table storage.objects enable row level security;
-- Policies deliberadamente permissivas reproduzem regras antigas do painel.
create policy legacy_write on public.pavement_streets for all using(true) with check(true);
create policy legacy_write on public.pavement_neighborhood_boundaries for all using(true) with check(true);
create policy legacy_write on storage.objects for all using(true) with check(true);
create policy bairros_read on public.bairros for select using(true);
create policy bairros_admin on public.bairros for all using(public.is_admin(auth.uid()) or public.is_master(auth.uid()));
\i supabase/migrations/164_permission_rules.sql
\i supabase/migrations/359_urban_planning_map_role.sql
\i supabase/migrations/360_urban_planning_public_official.sql
\i supabase/migrations/361_master_street_map_access.sql
grant usage on schema public, auth, storage to authenticated, anon;
grant select, insert, update, delete on all tables in schema public, storage to authenticated;
grant usage on all sequences in schema public to authenticated;
grant select on public.pavement_streets, public.pavement_neighborhood_boundaries to anon;
grant insert, update, delete on public.pavement_streets, public.pavement_neighborhood_boundaries, storage.objects to anon;
create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
create function public.test_denied(statement text) returns void language plpgsql as $$
begin
  begin
    execute statement;
    raise exception 'Operação indevida aceita: %', statement using errcode='XX000';
  exception when insufficient_privilege then null;
  end;
end $$;
insert into public.profiles(id, is_admin, is_master, is_ambassador) values
 ('00000000-0000-0000-0000-000000000001',false,false,false),
 ('00000000-0000-0000-0000-000000000002',false,false,false),
 ('00000000-0000-0000-0000-000000000003',true,false,false),
 ('00000000-0000-0000-0000-000000000004',false,true,false),
 ('00000000-0000-0000-0000-000000000005',false,false,true);
insert into public.cities(id) values(64),(65);
insert into public.bairros(id, city_id, name) values
 ('10000000-0000-0000-0000-000000000064',64,'Centro'),
 ('10000000-0000-0000-0000-000000000065',65,'Centro');
insert into public.pavement_streets(city_id,name) values(64,'Rua 64'),(65,'Rua 65');
insert into public.pavement_neighborhood_boundaries values
 ('10000000-0000-0000-0000-000000000064','[]'),
 ('10000000-0000-0000-0000-000000000065','[]');

-- Administrador atribui cargo com várias cidades; duplicatas são eliminadas.
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.set_urban_planner_cities('00000000-0000-0000-0000-000000000001',array[64,64]::bigint[]);
select public.test_assert((select count(*)=1 from public.urban_planner_cities where user_id='00000000-0000-0000-0000-000000000001'), 'Cargo duplicado');
select public.test_assert(not public.can_write(auth.uid(),'urban_planning'), 'Admin sem cargo recebeu acesso');
select public.test_denied($q$insert into public.pavement_streets(city_id,name) values(64,'admin sem cargo')$q$);

-- Cargo sozinho é insuficiente; usuário comum não pode conceder o próprio cargo.
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_assert(not public.can_write(auth.uid(),'urban_planning'), 'Cargo sem permissão recebeu acesso');
select public.test_denied($q$insert into public.pavement_streets(city_id,name) values(64,'sem permissão')$q$);
select public.test_denied($q$select public.set_urban_planner_cities(auth.uid(),array[65]::bigint[])$q$);
select public.test_denied($q$insert into public.urban_planner_cities(user_id,city_id) values(auth.uid(),65)$q$);
update public.permission_rules set allowed=true where module='urban_planning';
select public.test_assert(not public.can_write(auth.uid(),'urban_planning'), 'Usuário alterou a permissão do cargo');

-- Master administra permissões e gerencia o mapa sem cargo.
set test.user_id='00000000-0000-0000-0000-000000000004';
update public.permission_rules set allowed=true where module='urban_planning';
select public.test_assert(public.can_write(auth.uid(),'urban_planning'), 'Master sem cargo bloqueado');
insert into public.pavement_streets(city_id,name) values(65,'master sem cargo');
update public.pavement_streets set name='master editou fora da cidade' where name='master sem cargo';
select public.test_assert(exists(select 1 from public.pavement_streets where name='master editou fora da cidade'), 'Master não editou outra cidade');
delete from public.pavement_streets where name='master editou fora da cidade';
insert into public.permission_rules(scope,user_id,module,allowed)
 values('user','00000000-0000-0000-0000-000000000002','urban_planning',true);
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_assert(not public.can_write(auth.uid(),'urban_planning'), 'Exceção individual concedeu cargo');
select public.test_denied($q$insert into public.pavement_streets(city_id,name) values(64,'exceção sem cargo')$q$);

-- Cargo + permissão habilitam CRUD somente na cidade autorizada.
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_assert(public.can_write(auth.uid(),'urban_planning'), 'Cargo autorizado foi bloqueado');
insert into public.pavement_streets(city_id,name) values(64,'Rua nova');
update public.pavement_streets set name='Rua editada' where name='Rua nova';
select public.test_assert(exists(select 1 from public.pavement_streets where name='Rua editada'), 'Edição autorizada falhou');
select public.test_denied($q$insert into public.pavement_streets(city_id,name) values(65,'fora da cidade')$q$);
select public.test_denied($q$update public.pavement_streets set city_id=65 where name='Rua editada'$q$);
update public.pavement_streets set name='alteração indevida' where city_id=65;
delete from public.pavement_streets where city_id=65;
select public.test_assert(exists(select 1 from public.pavement_streets where name='Rua 65'), 'Policy antiga permitiu editar outra cidade');
delete from public.pavement_streets where name='Rua editada';
select public.test_assert(not exists(select 1 from public.pavement_streets where name='Rua editada'), 'Exclusão autorizada falhou');

update public.pavement_neighborhood_boundaries set boundary='[1]' where bairro_id='10000000-0000-0000-0000-000000000064';
update public.pavement_neighborhood_boundaries set boundary='[1]' where bairro_id='10000000-0000-0000-0000-000000000065';
select public.test_assert((select boundary='[1]'::jsonb from public.pavement_neighborhood_boundaries where bairro_id='10000000-0000-0000-0000-000000000064'), 'Contorno autorizado bloqueado');
select public.test_assert((select boundary='[]'::jsonb from public.pavement_neighborhood_boundaries where bairro_id='10000000-0000-0000-0000-000000000065'), 'Contorno de outra cidade alterado');
insert into public.bairros(city_id,name) values(64,'Bairro novo');
select public.test_denied($q$insert into public.bairros(city_id,name) values(65,'Bairro indevido')$q$);

insert into storage.objects(bucket_id,name) values('pavement-history','64/nova-rua/foto.jpg');
insert into storage.objects(bucket_id,name) values('work-media','pavement-maps/64/mapa.pdf');
select public.test_denied($q$insert into storage.objects(bucket_id,name) values('pavement-history','65/outra-rua/foto.jpg')$q$);
select public.test_denied($q$insert into storage.objects(bucket_id,name) values('work-media','pavement-maps/65/mapa.pdf')$q$);
select public.test_denied($q$insert into storage.objects(bucket_id,name) values('pavement-history','99999999999999999999999999/foto.jpg')$q$);
select public.test_denied($q$update storage.objects set name='65/outra-rua/foto.jpg' where name='64/nova-rua/foto.jpg'$q$);
select public.salvar_referencias_mapa_ruas(64,'https://example.com/mapa.pdf',null);
select public.test_denied($q$select public.salvar_referencias_mapa_ruas(65,'https://example.com/mapa.pdf',null)$q$);

-- Regras individuais revogam acesso das demais contas; master é exceção.
set test.user_id='00000000-0000-0000-0000-000000000004';
select public.set_urban_planner_cities(auth.uid(),array[64]::bigint[]);
insert into public.permission_rules(scope,user_id,module,allowed)
 values('user','00000000-0000-0000-0000-000000000001','urban_planning',false),
 ('user','00000000-0000-0000-0000-000000000004','urban_planning',false);
select public.test_assert(public.can_write(auth.uid(),'urban_planning'), 'Bloqueio individual removeu acesso master');
insert into public.pavement_streets(city_id,name) values(65,'master ignora bloqueio');
delete from public.pavement_streets where name='master ignora bloqueio';
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_assert(not public.can_write(auth.uid(),'urban_planning'), 'Bloqueio individual ignorado');
select public.test_denied($q$insert into storage.objects(bucket_id,name) values('pavement-history','64/rua/bloqueado.pdf')$q$);
update public.pavement_streets set name='bloqueio ignorado' where city_id=64;
select public.test_assert(not exists(select 1 from public.pavement_streets where name='bloqueio ignorado'), 'Update ignorou bloqueio individual');

set test.user_id='00000000-0000-0000-0000-000000000004';
update public.permission_rules set allowed=true where scope='user' and module='urban_planning';
select public.test_assert(public.can_write(auth.uid(),'urban_planning'), 'Master com cargo e permissão bloqueado');
select public.set_urban_planner_cities('00000000-0000-0000-0000-000000000003',array[64]::bigint[]);
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.test_assert(public.pode_gerenciar_mapa_ruas(64), 'Admin com cargo e permissão bloqueado');
select public.set_urban_planner_cities('00000000-0000-0000-0000-000000000001','{}'::bigint[]);
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_assert(not public.can_write(auth.uid(),'urban_planning'), 'Remoção do cargo manteve acesso');
select public.test_denied($q$select public.salvar_referencias_mapa_ruas(64,null,null)$q$);

-- Consulta pública segue acessível mesmo sem o novo cargo.
set test.user_id='00000000-0000-0000-0000-000000000005';
select public.test_assert(not public.can_write(auth.uid(),'urban_planning'), 'Embaixador sem cargo liberado');
select public.test_assert((select count(*)=2 from public.pavement_streets), 'Leitura pública autenticada bloqueada');
reset role;
set role anon;
select public.test_assert((select count(*)=2 from public.pavement_streets), 'Leitura anônima bloqueada');
select public.test_assert(not public.pode_gerenciar_mapa_ruas(64), 'Anônimo recebeu cargo');
select public.test_denied($q$insert into public.pavement_streets(city_id,name) values(64,'anônimo indevido')$q$);
select public.test_denied($q$insert into storage.objects(bucket_id,name) values('pavement-history','64/rua/anonimo.pdf')$q$);
select public.test_denied($q$insert into storage.objects(bucket_id,name) values('work-media','pavement-maps/64/anonimo.pdf')$q$);
reset role;

-- Mesmo com cargo e permissão ativos, demover Órgão Público para Cidadão
-- revoga a escrita imediatamente, sem depender da sessão do frontend.
update public.profiles set user_type='citizen' where id in (
 '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004');
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000004';
select public.set_urban_planner_cities(auth.uid(),'{}'::bigint[]);
update public.permission_rules set allowed=false where module='urban_planning';
select public.test_assert(public.can_write(auth.uid(),'urban_planning'), 'Master cidadão perdeu acesso ao mapa');
select public.test_assert(public.can_write(auth.uid(),'works'), 'Regra do mapa alterou outros módulos');
select public.test_assert(public.can_write(auth.uid(),'pavement'), 'Master cidadão perdeu acesso à pavimentação');
select public.test_assert(public.pode_gerenciar_mapa_ruas(65), 'Master sem cargo não acessa outra cidade');
select public.test_assert(not public.pode_gerenciar_mapa_ruas(null), 'Mapa sem cidade foi liberado');
insert into public.pavement_streets(city_id,name) values(65,'master cidadão');
delete from public.pavement_streets where name='master cidadão';
update public.pavement_neighborhood_boundaries set boundary='[2]' where bairro_id='10000000-0000-0000-0000-000000000065';
select public.test_assert((select boundary='[2]'::jsonb from public.pavement_neighborhood_boundaries where bairro_id='10000000-0000-0000-0000-000000000065'), 'Master não editou contorno de outra cidade');
insert into storage.objects(bucket_id,name) values('pavement-history','65/master/foto.jpg');
update storage.objects set name='64/master/foto.jpg' where name='65/master/foto.jpg';
delete from storage.objects where name='64/master/foto.jpg';
insert into storage.objects(bucket_id,name) values('work-media','pavement-maps/65/master.pdf');
delete from storage.objects where name='pavement-maps/65/master.pdf';
select public.salvar_referencias_mapa_ruas(65,'https://example.com/master.pdf',null);
select public.test_assert((select pavement_street_map_url='https://example.com/master.pdf' from public.cities where id=65), 'Master não salvou referência');
do $$ begin
  begin
    perform public.set_urban_planner_cities('00000000-0000-0000-0000-000000000003', array[64]::bigint[]);
    raise exception 'Cargo foi concedido a Cidadão' using errcode='XX000';
  exception when invalid_parameter_value then null;
  end;
end $$;
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.test_assert(not public.can_write(auth.uid(),'urban_planning'), 'Admin cidadão recebeu acesso ao mapa');
select public.test_denied($q$insert into storage.objects(bucket_id,name) values('pavement-history','64/rua/cidadao.pdf')$q$);
reset role;
-- Remover o status master revoga a exceção mesmo com uma sessão aberta.
update public.profiles set is_master=false where id='00000000-0000-0000-0000-000000000004';
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000004';
select public.test_assert(not public.pode_gerenciar_mapa_ruas(65), 'Remoção de master manteve acesso');
select public.test_denied($q$insert into public.pavement_streets(city_id,name) values(65,'ex-master indevido')$q$);
reset role;
select 'Planejamento urbano: exceção master, Órgão Público, cargo, permissão, cidades, anexos, revogação e leitura pública OK';
