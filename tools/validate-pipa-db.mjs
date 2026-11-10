// PostgreSQL descartável e local. Não lê .env, não acessa Supabase remoto.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createPipaTestData, PIPA_TEST_TABLES } from '../scripts/lib/pipaTestData.mjs';

const bin = process.env.POSTGRES_BIN || 'C:/Program Files/PostgreSQL/17/bin';
const root = path.resolve('.tmp', `pipa-db-${Date.now()}`);
await fs.mkdir(root, { recursive: true });
const cluster = path.join(root, 'data');
const initialized = spawnSync(path.join(bin, 'initdb.exe'), ['-D', cluster, '-U', 'pipa_test', '-A', 'trust', '--no-locale', '-E', 'UTF8'], { windowsHide: true, encoding: 'utf8' });
await fs.writeFile(path.join(root, 'init.log'), `${initialized.stdout}\n${initialized.stderr}`);
assert.equal(initialized.status, 0, `initdb falhou: ${root}`);
const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
const server = spawn(path.join(bin, 'postgres.exe'), ['-D', cluster, '-h', '127.0.0.1', '-p', String(port), '-c', 'fsync=off'], { windowsHide: true, stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let client;
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    const candidate = new pg.Client({ host: '127.0.0.1', port, user: 'pipa_test', database: 'postgres', connectionTimeoutMillis: 1000 });
    try { await candidate.connect(); client = candidate; break; } catch { await candidate.end(); await pause(100); }
  }
  assert.ok(client, 'PostgreSQL não iniciou');
  const q = (sql, values) => client.query(sql, values);
  const scalar = async (sql, values) => (await q(sql, values)).rows[0]?.value;
  const uid = Array.from({ length: 8 }, () => randomUUID());
  const [admin, manager, attendant, reader, driverUser, otherDriverUser, outsider, otherManager] = uid;
  const [cityHall, otherCityHall, channel, otherChannel, sibling] = Array.from({ length: 5 }, () => randomUUID());
  await q(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated;
    create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}');
    create table orgao_canais(id uuid primary key,city_id bigint,nome text,ativo boolean default true,canal_triagem boolean default false,
      municipal_modules text[],constraint department_modules_valid check(municipal_modules <@ array['urban_planning','arborization','lighting']::text[]));
    create table prefeituras(id uuid primary key,city_id bigint,status text);
    create table prefeitura_membros(id uuid primary key default gen_random_uuid(),prefeitura_id uuid,user_id uuid,papel text,ativo boolean default true);
    create table orgao_membros(id uuid primary key default gen_random_uuid(),canal_id uuid,user_id uuid,ativo boolean default true);
    create table orgao_membro_acessos(membro_id uuid,cargos text[]);
    create table municipal_account_setup(user_id uuid primary key,created_by uuid);
  `);
  // Carrega os corpos reais que a migração estende, verificando também os patches
  // de compatibilidade sem simular seu texto ou depender de dados de produção.
  for (const [file, name] of [
    ['374_department_scope_and_staff_roles.sql', 'salvar_secretaria_municipal'],
    ['384_activate_categoryless_inventory_departments.sql', 'salvar_secretaria_execucao'],
    ['383_categoryless_department_inventory.sql', 'convidar_funcionario_secretaria'],
    ['385_assign_existing_public_officials.sql', 'municipal_assign_existing_public_official'],
    ['391_municipal_temporary_access.sql', 'validate_municipal_provisioning'],
  ]) {
    const contents = await fs.readFile(`supabase/migrations/${file}`, 'utf8');
    const definition = contents.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?end \\$\\$;`, 'i'))?.[0];
    assert.ok(definition, `Definição ausente: ${name}`); await q(definition);
  }
  await q(await fs.readFile('supabase/migrations/414_operacao_pipa.sql', 'utf8'));
  await q(await fs.readFile('supabase/migrations/415_pipa_routes.sql', 'utf8'));
  await q(await fs.readFile('supabase/migrations/416_pipa_emptying_average.sql', 'utf8'));
  await q(`insert into auth.users(id) select unnest($1::uuid[])`, [uid]);
  await q(`insert into prefeituras values($1,64,'ativa'),($2,65,'ativa')`, [cityHall, otherCityHall]);
  await q(`insert into orgao_canais(id,city_id,nome,municipal_modules) values($1,64,'Água',array['water_supply']),($2,65,'Outra cidade',array['water_supply']),($3,64,'Outra secretaria',array['water_supply'])`, [channel, otherChannel, sibling]);
  await q(`insert into prefeitura_membros(prefeitura_id,user_id,papel) values($1,$2,'administrador'),($1,$3,'colaborador'),($1,$4,'colaborador'),($1,$5,'colaborador'),($6,$7,'colaborador')`, [cityHall, admin, manager, attendant, reader, otherCityHall, otherManager]);
  for (const [user, role, scope] of [[manager, 'gestor', channel], [attendant, 'atendente', channel], [reader, 'leitura', channel], [otherManager, 'gestor', otherChannel]]) {
    await q(`with m as(insert into orgao_membros(canal_id,user_id) values($1,$2) returning id) insert into orgao_membro_acessos select id,array[$3] from m`, [scope, user, role]);
  }
  const as = async (user = '', role = 'authenticated') => { await q('reset role'); await q(`select set_config('test.user_id',$1,false)`, [user]); await q(`set role ${role}`); };
  const denied = async (sql, args, pattern = /permiss|acesso|indisponível|outra secretaria|permission/i) => assert.rejects(() => q(sql, args), pattern);
  const rpc = (name, data) => scalar(`select ${name}($1::jsonb) as value`, [JSON.stringify(data)]);
  const tankData = { channel_id: channel, name: 'Caixa Serra', locality: 'Serra', address: 'Estrada rural', latitude: -8.6, longitude: -38.5, capacity_liters: 20000, provider: 'exercito', responsible_name: 'Pessoa responsável', responsible_document: '52998224725', responsible_phone: '87999999999', responsible_address: 'Sítio Serra' };
  await as('', 'anon'); await denied('select * from pipa_tanks'); await denied('select pipa_access(64)');
  await as(outsider); assert.equal(await scalar('select count(*)::int as value from pipa_tanks'), 0); await denied('select pipa_driver_workspace()'); await denied('select pipa_save_tank($1)', [tankData]);
  await as(manager);
  assert.equal((await scalar('select pipa_access(64) as value')).length, 1);
  const tank = await rpc('pipa_save_tank', tankData);
  await rpc('pipa_save_tank', { ...tankData, id: tank, emptying_days: 10 });
  assert.equal(await scalar('select emptying_days as value from pipa_tanks where id=$1', [tank]), 10);
  await rpc('pipa_save_tank', { ...tankData, id: tank });
  assert.equal(await scalar('select emptying_days as value from pipa_tanks where id=$1', [tank]), 10, 'Cliente antigo preserva a média configurada');
  await denied('select pipa_save_tank($1)', [{ ...tankData, id: tank, emptying_days: 0 }], /1 e 365/);
  await denied('select pipa_save_tank($1)', [{ ...tankData, id: tank, emptying_days: 366 }], /1 e 365/);
  await rpc('pipa_save_tank', { ...tankData, id: tank, emptying_days: null });
  assert.equal(await scalar('select emptying_days as value from pipa_tanks where id=$1', [tank]), null, 'Permite retirar a média sem inventar valor padrão');
  await denied('select pipa_save_tank($1)', [{ ...tankData, responsible_document: '11111111111' }], /check constraint/);
  await denied('select pipa_save_tank($1)', [{ ...tankData, channel_id: otherChannel }]);
  await denied('insert into pipa_tanks(name) values(\'Intrusão\')');
  const driver = await rpc('pipa_save_driver', { channel_id: channel, name: 'Pipeiro municipal', plate: 'ABC1D23', capacity_liters: 10000, provider: 'prefeitura' });
  const driver2 = await rpc('pipa_save_driver', { channel_id: channel, name: 'Segundo pipeiro', plate: 'DEF5678', capacity_liters: 8000, provider: 'prefeitura' });
  const driver3 = await rpc('pipa_save_driver', { channel_id: channel, name: 'Pipeiro com login novo', plate: 'GHI9012', capacity_liters: 8000, provider: 'prefeitura' });
  const account = randomUUID();
  await q('reset role'); await q('insert into auth.users(id) values($1)', [account]);
  await as(manager); await denied('select pipa_link_driver_account($1,$2)', [driver3, account]);
  await q('reset role'); await q(`update auth.users set raw_app_meta_data=jsonb_build_object('pipa_driver',true,'pipa_created_by',$1::text) where id=$2`, [manager, account]);
  await as(outsider); await denied('select pipa_link_driver_account($1,$2)', [driver3, account]);
  await as(manager); await q('select pipa_link_driver_account($1,$2)', [driver3, account]);
  await denied('select pipa_link_driver_account($1,$2)', [driver3, account], /já possui login/);
  await q(`select pipa_set_quota($1,date_trunc('month',now() at time zone 'America/Fortaleza')::date,3)`, [driver]);
  await as(admin);
  const siblingTank = await rpc('pipa_save_tank', { ...tankData, channel_id: sibling, name: 'Caixa isolada' });
  await as(manager); await denied('select pipa_save_tank($1)', [{ ...tankData, id: siblingTank }]);
  await as(attendant);
  assert.equal((await scalar('select pipa_access(64) as value'))[0].manage, false);
  await denied('select pipa_save_driver($1)', [{ channel_id: channel }]);
  const request = await rpc('pipa_create_request', { channel_id: channel, tank_id: tank, kind: 'urgent', requester_name: 'Morador', requester_phone: '87999999999', notes: 'Caixa seca' });
  await denied('select pipa_dispatch($1,$2)', [request, driver]);
  await as(reader); await denied('select pipa_create_request($1)', [{ channel_id: channel }]);
  assert.equal(await scalar('select count(*)::int as value from pipa_tanks'), 1);
  await as(manager); await q('select pipa_dispatch($1,$2)', [request, driver]);
  await q('reset role'); await q('update pipa_drivers set user_id=$1 where id=$2', [driverUser, driver]);
  await q('update pipa_drivers set user_id=$1 where id=$2', [otherDriverUser, driver2]);
  await as(otherDriverUser); await denied('select pipa_start_trip(null,$1)', [request]);
  await as(driverUser);
  assert.equal(await scalar('select count(*)::int as value from pipa_tanks'), 0, 'pipeiro não lê responsáveis diretamente');
  const ws = await scalar('select pipa_driver_workspace() as value');
  assert.equal(ws.tanks.length, 1); assert.equal(ws.quota, 3); assert.ok(!('responsible_document' in ws.tanks[0])); assert.ok(!('requester_phone' in ws.requests[0]));
  assert.equal(await scalar('select pipa_start_trip(null,$1) as value', [request]), request);
  assert.equal(await scalar('select pipa_start_trip($1,null) as value', [tank]), request, 'iniciar duas vezes mantém uma só viagem');
  const delivery = { id: randomUUID(), request_id: request, source: 'gps', liters: 10000, latitude: -8.6, longitude: -38.5, accuracy_m: 12, level_after_percent: 100 };
  await denied('select pipa_record_delivery($1)', [{ ...delivery, level_after_percent:101 }], /0 a 100/);
  await denied('select pipa_record_delivery($1)', [{ ...delivery, latitude: -9 }], /Aproxime/);
  await denied('select pipa_record_delivery($1)', [{ ...delivery, accuracy_m: 200 }], /GPS impreciso/);
  await denied('select pipa_record_delivery($1)', [{ ...delivery, liters: 20000 }], /Volume incompatível/);
  assert.equal(await rpc('pipa_record_delivery', delivery), delivery.id);
  assert.equal(await rpc('pipa_record_delivery', delivery), delivery.id, 'retry não duplica entrega');
  await rpc('pipa_record_delivery', { ...delivery, level_after_percent:50 });
  await as(manager);assert.equal(await scalar('select level_after_percent as value from pipa_deliveries where id=$1',[delivery.id]),100,'Nível observado é imutável em nova tentativa');await as(driverUser);
  await denied('select pipa_record_delivery($1)', [{ ...delivery, id: randomUUID() }], /já atendida/);
  await as(manager);
  const delivered = (await q('select * from pipa_deliveries')).rows[0];
  assert.equal(delivered.provider, 'prefeitura'); assert.equal(delivered.tank_id, tank);
  assert.equal(await scalar('select provider as value from pipa_tanks where id=$1', [tank]), 'exercito', 'entrega municipal não muda o vínculo da caixa');
  assert.equal(await scalar('select status as value from pipa_requests where id=$1', [request]), 'completed');
  await denied('update pipa_deliveries set loads=50');
  const oneOff = await rpc('pipa_create_request', { channel_id: channel, kind: 'one_off', requester_name: 'Moradora rural', locality: 'Lagoa', address: 'Casa azul', latitude: -8.61, longitude: -38.51 });
  const manual = { id: randomUUID(), request_id: oneOff, driver_id: driver, source: 'manual', delivered_at: new Date().toISOString(), loads: 1, liters: 5000, notes: 'Sem sinal no local' };
  await rpc('pipa_record_delivery', manual);
  const past = { id: randomUUID(), tank_id: tank, driver_id: driver, source: 'manual', delivered_at: '2026-10-10T12:00:00-03:00', loads: 3, liters: 30000, notes: 'Importação do controle anterior' };
  await rpc('pipa_record_delivery', past);
  await denied('select pipa_record_delivery($1)', [{ ...past, id: randomUUID(), delivered_at: '2099-01-01T12:00:00Z' }], /sem data futura/);
  await denied('select pipa_record_delivery($1)', [{ ...past, id: randomUUID(), tank_id: siblingTank }], /destino desta secretaria/);
  const cross = await scalar('select count(*)::int as value from pipa_deliveries'); assert.equal(cross, 3);
  await as(otherManager); assert.equal(await scalar('select count(*)::int as value from pipa_deliveries'), 0);
  await as(manager);
  const routeTank = await rpc('pipa_save_tank', { ...tankData, name: 'Segunda parada' });
  const routeData = { id: randomUUID(), driver_id: driver, name: 'Rota da secretaria', scheduled_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' }), tank_ids: [routeTank, tank] };
  assert.equal(await rpc('pipa_plan_route', routeData), routeData.id);
  assert.equal(await rpc('pipa_plan_route', routeData), routeData.id, 'Repetir o salvamento não duplica paradas');
  await denied('select pipa_plan_route($1)', [{ ...routeData, id: randomUUID(), tank_ids: [tank, tank] }], /sem repetir/);
  await denied('select pipa_plan_route($1)', [{ ...routeData, id: randomUUID(), tank_ids: [tank, siblingTank] }], /somente caixas ativas/);
  assert.equal(await scalar('select count(*)::int as value from pipa_routes'), 1, 'Falha parcial desfaz toda a rota');
  await as(attendant); await denied('select pipa_plan_route($1)', [{ ...routeData, id: randomUUID() }]);
  await as(otherManager); assert.equal(await scalar('select count(*)::int as value from pipa_routes'), 0);
  await as(otherDriverUser); await denied('select pipa_plan_route($1)', [{ ...routeData, id: randomUUID() }]);
  await as(driverUser);
  const planned = await scalar('select pipa_driver_workspace() as value');
  assert.equal(planned.routes[0].source, 'municipality'); assert.equal(planned.routes[0].stops[0].tank_id, routeTank);
  assert.ok(!JSON.stringify(planned.routes).includes('responsible_'));
  assert.equal(await scalar('select count(*)::int as value from pipa_routes'), 0, 'Pipeiro consulta somente a projeção segura');
  await denied('select pipa_cancel_route($1)', [routeData.id]);
  const ownRoute = { ...routeData, id: randomUUID(), name: 'Minha rota', tank_ids: [tank] };
  await rpc('pipa_plan_route', ownRoute);
  assert.equal((await scalar('select pipa_driver_workspace() as value')).routes.find(r => r.id === ownRoute.id).source, 'driver');
  const firstStop = planned.routes[0].stops[0].request_id;
  await q('select pipa_start_trip(null,$1)', [firstStop]);
  await denied('select pipa_change_destination($1)', [siblingTank], /caixa ativa/);
  const outsideTank = await (async () => { await as(manager); const id = await rpc('pipa_save_tank', { ...tankData, name: 'Fora da rota' }); await as(driverUser); return id; })();
  const outsideTrip = await scalar('select pipa_change_destination($1) as value', [outsideTank]);
  const outsideDelivery = { ...delivery, id: randomUUID(), request_id: outsideTrip };
  await rpc('pipa_record_delivery', outsideDelivery);
  const afterOutside = await scalar('select pipa_driver_workspace() as value');
  assert.equal(afterOutside.routes.find(r => r.id === routeData.id).stops[0].status, 'assigned', 'Entrega fora da rota preserva a parada anterior');
  await q('select pipa_start_trip(null,$1)', [firstStop]);
  await rpc('pipa_record_delivery', { ...delivery, id: randomUUID(), request_id: firstStop });
  assert.equal((await scalar('select pipa_driver_workspace() as value')).routes.find(r => r.id === routeData.id).stops[0].status, 'completed');
  await q('select pipa_cancel_route($1)', [ownRoute.id]);
  await as(manager); await q('select pipa_cancel_route($1)', [routeData.id]);
  assert.equal(await scalar('select count(*)::int as value from pipa_requests where route_id=$1 and status=\'completed\'', [routeData.id]), 1, 'Cancelar preserva entregas concluídas');
  await rpc('pipa_save_driver', { id: driver, channel_id: channel, name: 'Nome alterado', plate: 'XYZ1234', capacity_liters: 12000, provider: 'exercito', active: false });
  assert.equal(await scalar('select plate as value from pipa_deliveries where id=$1', [delivery.id]), 'ABC1D23', 'histórico preserva veículo e prestador');
  await as(driverUser); await denied('select pipa_driver_workspace()'); await denied('select pipa_start_trip($1,null)', [tank]); await denied('select pipa_record_delivery($1)', [delivery]);
  await q('reset role');
  const originalTank = (await q('select * from pipa_tanks where id=$1', [tank])).rows[0];
  const seed = createPipaTestData({ channelId: channel, actorId: admin });
  const insertSeed = async () => {
    for (const table of PIPA_TEST_TABLES) {
      const key = table === 'pipa_quotas' ? 'driver_id,month' : 'id';
      await q(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},$1::jsonb) on conflict(${key}) do nothing`, [JSON.stringify(seed[table])]);
    }
  };
  await insertSeed();
  const counts = [];
  for (const table of PIPA_TEST_TABLES) counts.push(await scalar(`select count(*)::int as value from public.${table}`));
  await insertSeed();
  for (let index = 0; index < PIPA_TEST_TABLES.length; index++) assert.equal(await scalar(`select count(*)::int as value from public.${PIPA_TEST_TABLES[index]}`), counts[index], 'Reexecutar o seed não duplica registros');
  assert.deepEqual((await q('select * from pipa_tanks where id=$1', [tank])).rows[0], originalTank, 'Seed preserva cadastros existentes');
  console.log(JSON.stringify({ migrations: [414,415,416], emptyingAverage: true, observedLevel: true, routes: true, ownRoutes: true, outsideRouteDelivery: true, routeIsolation: true, privateTables: true, roles: true, isolation: true, driverAccount: true, gps: true, idempotency: true, oneOff: true, manual: true, immutableHistory: true, disabledDriver: true, testSeed: true, seedRerun: true }));
} finally { await client?.end(); server.kill(); }
