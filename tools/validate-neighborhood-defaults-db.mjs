// Ensaia o seed em PostgreSQL local descartável, sem conectar ao Supabase.
// A geometria usa um stub de texto aqui; os vértices são validados pelo mesmo
// validador da aplicação. Este ensaio verifica a lógica SQL do cadastro/seed.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';
import { boundaryValidationError } from '../src/lib/neighborhoodBoundary.js';

const migration = await fs.readFile('supabase/migrations/355_floresta_neighborhood_default_boundaries.sql', 'utf8');
const records = JSON.parse(migration.match(/\$contornos\$([\s\S]*?)\$contornos\$/)[1]);
const referenceMigration = await fs.readFile('supabase/migrations/356_floresta_reference_map_geometry.sql', 'utf8');
const referenceRecords = JSON.parse(referenceMigration.match(/\$contornos\$([\s\S]*?)\$contornos\$/)[1]);
assert.equal(referenceRecords.length, 2);
assert.ok(referenceRecords.every(record => record.source.provider === 'manual' && record.source.approximate));
assert.equal(records.length, 14);
assert.equal(new Set(records.map(record => record.name)).size, 14);
assert.equal(new Set(records.map(record => record.color)).size, 14);
assert.ok(records.every(record => /^#[0-9a-f]{6}$/.test(record.color)));
assert.equal(records.find(record => record.name === 'AABB').source.source_name, 'Né Maniçoba - AABB');
assert.ok(!records.some(record => ['Bomba', 'Alto da Ermida', 'Né Maniçoba'].includes(record.name)));
for (const record of [...records, ...referenceRecords]) {
  const ring = record.boundary.match(/^SRID=4326;POLYGON\(\((.*)\)\)$/)[1].split(',').map(point => point.split(' ').map(Number));
  assert.equal(boundaryValidationError(ring), null, record.name);
}

const connection = { host: '127.0.0.1', port: 55439, user: 'codex_validation', database: 'postgres', connectionTimeoutMillis: 5000 };
const owner = new pg.Client(connection);
await owner.connect();
assert.equal(path.resolve((await owner.query('show data_directory')).rows[0].data_directory).toLowerCase(),
  path.resolve('.tmp/municipal-demand-pg').toLowerCase());
const database = 'neighborhood_defaults_' + Date.now();
await owner.query('create database ' + database);
const db = new pg.Client({ ...connection, database });
await db.connect();
try {
  await db.query(`
    create schema extensions;
    create function extensions.st_geomfromewkt(text) returns text language sql immutable as $$ select $1 $$;
    create table states(id bigint primary key, uf text);
    create table cities(id bigint primary key, name text, state_id bigint references states(id));
    create table bairros(id uuid primary key default gen_random_uuid(), name text, city_id bigint references cities(id));
    create unique index on bairros(lower(name),city_id);
    create table pavement_neighborhood_boundaries(
      bairro_id uuid primary key references bairros(id), boundary text not null,
      color text not null, source jsonb not null, updated_at timestamptz default clock_timestamp()
    );
    create table pavement_streets(
      id uuid primary key default gen_random_uuid(), name text, city_id bigint references cities(id),
      bairro_id uuid references bairros(id), path text, location text, path_source text,
      status text default 'unknown'
    );
    insert into states values(1,'PE'),(2,'PR');
    insert into cities values(64,'Floresta',1),(99,'Floresta',2);
    insert into bairros(name,city_id) values
      ('Centro',64),('Três Marias',64),('São Francisco de Assis (DNER)',64),
      ('AABB',64),('Né Maniçoba',64),('Bomba',64),('Alto da Ermida',64),('Pedras de Josina',64),('Centro',99);
    insert into pavement_neighborhood_boundaries(bairro_id,boundary,color,source)
    select id,'desenho existente','#00b7ff','{"provider":"manual"}'::jsonb from bairros where name='Centro';
  `);
  const earlier = await fs.readFile('supabase/migrations/344_report_neighborhood_association.sql', 'utf8');
  const keyFunction = earlier.slice(earlier.indexOf('create or replace function public.report_neighborhood_key'), earlier.indexOf('create or replace function public.resolve_report_neighborhood'));
  await db.query(keyFunction);
  const original = (await db.query('select * from pavement_neighborhood_boundaries order by bairro_id')).rows;
  await db.query(migration);
  for (const record of original) assert.deepEqual((await db.query('select * from pavement_neighborhood_boundaries where bairro_id=$1', [record.bairro_id])).rows[0], record);
  const read = async () => (await db.query('select p.*,b.name,b.city_id from pavement_neighborhood_boundaries p join bairros b on b.id=p.bairro_id order by p.bairro_id')).rows;
  const seeded = await read();
  assert.equal(seeded.filter(record => record.city_id === '64').length, 14);
  assert.equal(seeded.filter(record => record.city_id === '99').length, 1);
  assert.ok(seeded.some(record => record.name === 'AABB' && record.source.source_name === 'Né Maniçoba - AABB'));
  assert.ok(!seeded.some(record => record.name === 'Né Maniçoba'));
  assert.equal((await db.query("select count(*)::int as total from bairros where city_id=64 and name='São Francisco de Assis (DNER)'")).rows[0].total, 1);
  await db.query(migration);
  assert.deepEqual(await read(), seeded);
  console.log('OK: 14 geometrias e cores distintas; seed repete sem modificar dados, cria bairros ausentes, preserva cores personalizadas e respeita cidade/AABB.');

  const oldDefault = seeded.find(record => record.name === 'Três Marias');
  await db.query("update pavement_neighborhood_boundaries set color='#bfe1ee' where bairro_id=$1", [oldDefault.bairro_id]);
  await db.query(migration);
  const colored = (await read()).find(record => record.bairro_id === oldDefault.bairro_id);
  assert.equal(colored.color, records.find(record => record.name === 'Três Marias').color);
  assert.deepEqual(colored.source, oldDefault.source);
  assert.equal(colored.boundary, oldDefault.boundary);
  console.log('OK: cor padrão antiga recebe a paleta sem mudar geometria ou procedência.');

  const paletteRecord = records.find(record => record.name === 'Três Marias');
  await db.query('update pavement_neighborhood_boundaries set color=$1 where bairro_id=$2', [paletteRecord.previous_color, oldDefault.bairro_id]);
  await db.query(migration);
  assert.equal((await read()).find(record => record.bairro_id === oldDefault.bairro_id).color, paletteRecord.color);
  await db.query('update pavement_neighborhood_boundaries set color=$1, source=source || $2::jsonb where bairro_id=$3',
    [paletteRecord.previous_color, '{"modified":true}', oldDefault.bairro_id]);
  await db.query(migration);
  assert.equal((await read()).find(record => record.bairro_id === oldDefault.bairro_id).color, paletteRecord.previous_color);
  console.log('OK: paleta anterior recebe tons pastéis; ajustes locais ficam preservados.');

  const streetReference = JSON.parse(referenceMigration.match(/\$rua\$([\s\S]*?)\$rua\$/)[1]);
  await db.query('insert into pavement_streets(name,city_id,bairro_id) select $1,city_id,id from bairros where city_id=64 and name=$2',
    [streetReference.name, streetReference.bairro]);
  const priorReference = await read();
  await db.query(referenceMigration);
  const afterReference = await read();
  assert.equal(afterReference.filter(record => record.city_id === '64').length, 16);
  for (const prior of priorReference) assert.deepEqual(afterReference.find(record => record.bairro_id === prior.bairro_id), prior);
  for (const record of referenceRecords) {
    const actual = afterReference.find(row => row.name === record.name);
    assert.equal(actual.boundary, record.boundary);
    assert.deepEqual(actual.source, record.source);
  }
  const streetAfter = (await db.query('select * from pavement_streets')).rows[0];
  assert.equal(streetAfter.path, streetReference.path);
  assert.equal(streetAfter.location, streetReference.location);
  assert.equal(streetAfter.path_source, 'manual');
  assert.equal(streetAfter.status, 'unknown');
  await db.query(referenceMigration);
  assert.deepEqual(await read(), afterReference);
  assert.deepEqual((await db.query('select * from pavement_streets')).rows[0], streetAfter);
  await db.query("update pavement_streets set path=null, location='ponto corrigido', path_source='manual'");
  await db.query(referenceMigration);
  assert.equal((await db.query('select path from pavement_streets')).rows[0].path, null);
  console.log('OK: referência acrescenta 2 áreas aproximadas e rua sem geometria, repete sem modificar dados e respeita correções manuais.');

  await db.query("insert into bairros(name,city_id) values('Tres Marias',64)");
  await db.query("delete from pavement_neighborhood_boundaries where bairro_id in (select id from bairros where city_id=64 and name='Três Marias')");
  await db.query(migration);
  assert.equal((await db.query("select count(*)::int as total from pavement_neighborhood_boundaries p join bairros b on b.id=p.bairro_id where b.city_id=64 and b.name in ('Três Marias','Tres Marias')")).rows[0].total, 0);
  console.log('OK: cadastro ambíguo não recebe associação automática.');
} finally {
  await db.query('rollback');
  await db.end();
  await owner.query('drop database ' + database);
  await owner.end();
}
