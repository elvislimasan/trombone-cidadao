// Executa a migração em banco local descartável; nunca conecta ao Supabase.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';

const connection = { host: '127.0.0.1', port: 55439, user: 'codex_validation', database: 'postgres' };
const owner = new pg.Client(connection);
await owner.connect();
const directory = (await owner.query('show data_directory')).rows[0].data_directory;
assert.equal(path.resolve(directory).toLowerCase(), path.resolve('.tmp/municipal-demand-pg').toLowerCase());
const database = 'report_neighborhood_test_' + Date.now();
await owner.query('create database ' + database);
const db = new pg.Client({ ...connection, database });
await db.connect();
const migration = await fs.readFile('supabase/migrations/344_report_neighborhood_association.sql', 'utf8');
try {
  await db.query(`
    create table bairros (id bigint generated always as identity, city_id bigint, name text);
    create table reports (id bigint generated always as identity, city_id bigint, neighborhood text, address text, location text, status text);
    insert into bairros(city_id,name) values
      (1,'Centro'),(1,'Três Marias'),(1,'São Francisco de Assis (DNER)'),
      (1,'Né Maniçoba'),(1,'AABB'),(2,'Bairro de outra cidade');
    insert into reports(city_id,neighborhood,address,location,status) values
      (1,null,'Rua A - Centro - Floresta','marcador original','resolved'),
      (1,'São Francisco de Assis - DNER','Rua B','ponto B','pending'),
      (1,null,'Rua A - Né Maniçoba - AABB - Floresta','ponto C','pending'),
      (1,null,'Rua Centro - Floresta','ponto D','pending');
  `);
  await db.query(migration);
  const rows = (await db.query('select * from reports order by id')).rows;
  assert.equal(rows[0].neighborhood, 'Centro');
  assert.equal(rows[0].address, 'Rua A - Centro - Floresta');
  assert.equal(rows[0].location, 'marcador original');
  assert.equal(rows[0].status, 'resolved');
  assert.equal(rows[1].neighborhood, 'São Francisco de Assis (DNER)');
  assert.equal(rows[2].neighborhood, null);
  assert.equal(rows[3].neighborhood, null);
  console.log('OK backfill preserva endereço, posição, status e casos ambíguos');
  const resolve = async (city, name, address) => (await db.query('select resolve_report_neighborhood($1,$2,$3) as name', [city, name, address])).rows[0].name;
  assert.equal(await resolve(1, ' tres marias ', ''), 'Três Marias');
  assert.equal(await resolve(1, 'DNER', ''), 'São Francisco de Assis (DNER)');
  assert.equal(await resolve(2, 'DNER', ''), null);
  assert.equal(await resolve(1, null, 'Rua A, Bairro: Três Marias'), 'Três Marias');
  assert.equal(await resolve(1, null, 'Rua A - Centro - Três Marias'), null);
  assert.equal(await resolve(1, null, 'Rua A - Bairro de outra cidade'), null);
  console.log('OK padronização e associação única respeitam o município');
  await db.query("insert into reports(city_id,address) values(1,'Rua B, tres marias')");
  assert.equal((await db.query('select neighborhood from reports where id=5')).rows[0].neighborhood, 'Três Marias');
  await db.query("update reports set neighborhood='dner' where id=5");
  assert.equal((await db.query('select neighborhood from reports where id=5')).rows[0].neighborhood, 'São Francisco de Assis (DNER)');
  await db.query("update reports set neighborhood='Bairro desconhecido' where id=5");
  assert.equal((await db.query('select neighborhood from reports where id=5')).rows[0].neighborhood, 'Bairro desconhecido');
  console.log('OK gatilho atende clientes antigos e preserva bairro sem correspondência');
  await db.query(migration);
  console.log('OK migração pode ser reaplicada');
  await db.query(`
    alter table reports add column pole_id bigint, add column moderation_status text default 'approved';
    create table poles(id bigint primary key, city_id bigint, address text, latitude double precision, longitude double precision,
      lighting_status text default 'aceso', raw_properties jsonb default '{}'::jsonb);
    insert into poles(id,city_id,address,latitude,longitude,raw_properties) values
      (1,1,'Rua A - Centro - Floresta',-8,-38,'{"kmz":{"source_address":"Rua B-SANTA ROSA","lamp_count":2}}'),
      (2,1,'Rua B',-8,-38,'{"municipal":{"bairro":"Três Marias"}}'),
      (3,1,'Rua C',-8,-38,'{}'),(4,1,'Rua D',-8,-38,'{}'),
      (5,1,'Rua Centro - Floresta',-8,-38,'{}');
    insert into reports(city_id,neighborhood,address,pole_id) values
      (1,'DNER','Rua C',3),(1,'Centro','Rua D',4),(1,'Três Marias','Rua D',4),
      (2,'Bairro de outra cidade','Rua C',3);
  `);
  const poleMigration = await fs.readFile('supabase/migrations/345_pole_neighborhood_association.sql', 'utf8');
  await db.query(poleMigration);
  const poles = (await db.query('select * from poles order by id')).rows;
  assert.equal(poles[0].raw_properties.neighborhood, 'Centro');
  assert.equal(poles[0].raw_properties.neighborhood_source, 'address');
  assert.equal(poles[0].raw_properties.kmz.lamp_count, 2);
  assert.equal(poles[1].raw_properties.municipal.bairro, 'Três Marias');
  assert.equal(poles[2].raw_properties.neighborhood, 'São Francisco de Assis (DNER)');
  assert.equal(poles[2].raw_properties.neighborhood_source, 'linked_report');
  assert.equal(poles[3].raw_properties.neighborhood, undefined);
  assert.equal(poles[4].raw_properties.neighborhood, undefined);
  console.log('OK postes usam endereço atual e vínculos únicos da mesma cidade, preservando correções e dados técnicos');
  await db.query("update poles set address='Rua A - Três Marias - Floresta' where id=1");
  assert.equal((await db.query('select raw_properties from poles where id=1')).rows[0].raw_properties.neighborhood, 'Três Marias');
  await db.query("update poles set address='Rua A - Floresta' where id=1");
  assert.equal((await db.query('select raw_properties from poles where id=1')).rows[0].raw_properties.neighborhood, undefined);
  await db.query("update poles set latitude=-9 where id=3");
  assert.equal((await db.query('select raw_properties from poles where id=3')).rows[0].raw_properties.neighborhood, undefined);
  await db.query("insert into poles(id,city_id,address) values(6,1,'Rua B - Centro - Floresta')");
  assert.equal((await db.query('select raw_properties from poles where id=6')).rows[0].raw_properties.neighborhood, 'Centro');
  console.log('OK novos endereços atualizam bairro automático e marcador movido invalida associação antiga');
  await db.query(poleMigration);
  console.log('OK migração dos postes pode ser reaplicada');
} finally {
  await db.end();
  await owner.query('drop database ' + database);
  await owner.end();
}
