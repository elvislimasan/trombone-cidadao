// Banco local descartável: valida a migração sem usar o Supabase remoto.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';

const connection = { host: '127.0.0.1', port: 55439, user: 'codex_validation', database: 'postgres' };
const owner = new pg.Client(connection);
await owner.connect();
assert.equal(path.resolve((await owner.query('show data_directory')).rows[0].data_directory).toLowerCase(), path.resolve('.tmp/municipal-demand-pg').toLowerCase());
const database = `adoption_edit_test_${Date.now()}`;
await owner.query(`create database ${database}`);
const db = new pg.Client({ ...connection, database });
await db.connect();
const citizen = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const firstSpecies = '20000000-0000-0000-0000-000000000001';
const secondSpecies = '20000000-0000-0000-0000-000000000002';
const requestId = '30000000-0000-0000-0000-000000000001';
const insert = {
  id: requestId, city_id: 64, request_type: 'plantio', commitment: true,
  zone: 'urbana', planting_place: 'calcada', purpose: 'sombra', overhead_wiring: 'sim',
  items: [{ species_id: firstSpecies, provider: 'viveiro_municipal', quantity: 1 }],
  requester_name: 'Maria da Silva', requester_phone: '87999999999', requester_email: '',
  address: 'Rua das Flores, 20', reference_point: 'Em frente à escola', neighborhood: 'Centro',
  latitude: -8.6, longitude: -38.57, notes: '',
};
try {
  await db.query(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    end $$;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.city_tree_species(id uuid primary key,city_id bigint,common_name text);
    create table public.tree_species_availability(species_id uuid,provider text,status text);
    create table public.tree_adoption_cpf(author_id uuid primary key,cpf text);
    create table public.tree_adoption_requests(
      id uuid primary key,city_id bigint,author_id uuid,request_type text,zone text,planting_place text,
      purpose text,overhead_wiring text,species_id uuid,provider text,address text,neighborhood text,
      latitude double precision,longitude double precision,notes text,items jsonb,requester_name text,
      requester_phone text,requester_email text,status text default 'solicitada',approved_species_id uuid,
      confirmed_provider text,scheduled_at timestamptz,created_at timestamptz default clock_timestamp(),
      updated_at timestamptz default clock_timestamp());
    create table public.tree_adoption_events(request_id uuid,author_id uuid,status text,message text);
    create function public.tree_adoption_valid_cpf(text) returns boolean language sql as $$ select true $$;
    create function public.can_dispatch_tree_adoption(bigint) returns boolean language sql stable as $$
      select current_setting('test.dispatch',true)='true' $$;
    create function public.submit_tree_adoption_without_cpf(p_request jsonb)
    returns public.tree_adoption_requests language plpgsql security definer set search_path=public,pg_temp as $$
    declare r public.tree_adoption_requests;
    begin
      select * into r from public.tree_adoption_requests where id=(p_request->>'id')::uuid;
      if found then return r; end if;
      insert into public.tree_adoption_requests(id,city_id,author_id,request_type,zone,planting_place,purpose,
        overhead_wiring,species_id,provider,address,neighborhood,latitude,longitude,notes,items,
        requester_name,requester_phone,requester_email)
      values((p_request->>'id')::uuid,(p_request->>'city_id')::bigint,auth.uid(),p_request->>'request_type',
        p_request->>'zone',p_request->>'planting_place',p_request->>'purpose',p_request->>'overhead_wiring',
        (p_request->'items'->0->>'species_id')::uuid,p_request->'items'->0->>'provider',p_request->>'address',
        p_request->>'neighborhood',(p_request->>'latitude')::double precision,(p_request->>'longitude')::double precision,
        p_request->>'notes',p_request->'items',p_request->>'requester_name',p_request->>'requester_phone',
        p_request->>'requester_email') returning * into r;
      return r;
    end $$;
    insert into public.city_tree_species values
      ('${firstSpecies}',64,'Ipê'),('${secondSpecies}',64,'Oiti');
    insert into public.tree_species_availability values
      ('${firstSpecies}','viveiro_municipal','disponivel'),
      ('${secondSpecies}','viveiro_municipal','disponivel');
    grant usage on schema public,auth to authenticated,anon;
  `);
  await db.query(await fs.readFile('supabase/migrations/421_tree_adoption_request_edit.sql', 'utf8'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [citizen]);
  await db.query('set role authenticated');
  const created = await db.query('select (public.submit_tree_adoption($1::jsonb)).*', [insert]);
  assert.equal(created.rows[0].reference_point, 'Em frente à escola');
  await db.query('select public.submit_tree_adoption($1::jsonb)', [{ ...insert, reference_point: 'Referência alterada no reenvio' }]);
  await db.query('reset role');
  assert.equal((await db.query('select reference_point from public.tree_adoption_requests where id=$1', [requestId])).rows[0].reference_point, 'Em frente à escola');
  const pickup = { ...insert, id: '30000000-0000-0000-0000-000000000002', request_type: 'muda', requester_cpf: '52998224725', items: [{ ...insert.items[0], quantity: 2 }] };
  await db.query('set role authenticated');
  await db.query('select public.submit_tree_adoption($1::jsonb)', [pickup]);
  await assert.rejects(db.query('select public.submit_tree_adoption($1::jsonb)', [{ ...pickup, id: '30000000-0000-0000-0000-000000000003', items: [{ ...pickup.items[0], quantity: 7 }] }]), /até 6 mudas/);
  await db.query('reset role');
  assert.equal((await db.query('select cpf from public.tree_adoption_cpf where author_id=$1', [citizen])).rows[0].cpf, '52998224725');

  await db.query("update public.tree_adoption_requests set status='aprovada',approved_species_id=$1,confirmed_provider='viveiro_municipal',scheduled_at=now()+interval '1 day' where id=$2", [firstSpecies, requestId]);
  const before = (await db.query('select updated_at::text from public.tree_adoption_requests where id=$1', [requestId])).rows[0].updated_at;
  await db.query('set role authenticated');
  const changes = { ...insert, items: [{ species_id: secondSpecies, provider: 'viveiro_municipal', quantity: 2 }], reference_point: 'Ao lado da praça' };
  const edited = (await db.query('select to_jsonb(public.edit_tree_adoption($1,$2,$3::jsonb)) as row', [requestId, before, changes])).rows[0].row;
  assert.equal(edited.status, 'em_analise');
  assert.equal(edited.reference_point, 'Ao lado da praça');
  assert.equal(edited.species_id, secondSpecies);
  assert.equal(edited.approved_species_id, null);
  assert.equal(edited.scheduled_at, null);
  await assert.rejects(db.query('select public.edit_tree_adoption($1,$2,$3::jsonb)', [requestId, before, changes]), /atualizado por outra pessoa/);
  await db.query('reset role');
  assert.equal((await db.query('select count(*) from public.tree_adoption_events')).rows[0].count, '1');

  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  await db.query('set role authenticated');
  await assert.rejects(db.query('select public.edit_tree_adoption($1,$2,$3::jsonb)', [requestId, edited.updated_at, changes]), /Sem permissão/);
  await db.query('reset role');
  await db.query("select set_config('test.dispatch','true',false)");
  await db.query('set role authenticated');
  await assert.rejects(db.query('select public.edit_tree_adoption($1,$2,$3::jsonb)', [requestId, edited.updated_at, { ...changes, items: [{ ...changes.items[0], species_id: firstSpecies, provider: 'fornecedor_inexistente' }] }]), /não está disponível/);
  const manager = (await db.query('select to_jsonb(public.edit_tree_adoption($1,$2,$3::jsonb)) as row', [requestId, edited.updated_at, { ...changes, reference_point: 'Referência do gestor' }])).rows[0].row;
  assert.equal(manager.reference_point, 'Referência do gestor');
  await db.query('reset role');
  await db.query("update public.tree_adoption_requests set status='concluida' where id=$1", [requestId]);
  await db.query('set role authenticated');
  await assert.rejects(db.query('select public.edit_tree_adoption($1,$2,$3::jsonb)', [requestId, manager.updated_at, changes]), /já foi encerrado/);
  await db.query('reset role');
  console.log('OK referência, CPF, reenvio idempotente, troca de espécie, reanálise, concorrência, permissões, disponibilidade e encerramento');
} finally {
  await db.end();
  await owner.query(`drop database ${database}`);
  await owner.end();
}
