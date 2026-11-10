import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createPipaTestData, PIPA_TEST_MARKER, PIPA_LEGACY_TEST_MARKER, PIPA_TEST_TABLES, pipaTestRowKey } from './lib/pipaTestData.mjs';

const DEVELOPMENT_PROJECT = 'xxdletrjyjajtrmhwzev';
const usage = 'Uso: npm run pipa:seed -- --city-id 64 [--channel-id UUID] [--apply]\nSem --apply, consulta o destino e mostra a quantidade de dados a inserir. Usa somente o projeto de desenvolvimento configurado no .env.';
export function parsePipaSeedOptions(args) {
  const options = { cityId: null, channelId: null, apply: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--help') options.help = true;
    else if (arg === '--city-id') {
      const value = args[++i];
      if (!/^\d+$/.test(value || '') || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new Error('Informe um --city-id válido.');
      options.cityId = Number(value);
    } else if (arg === '--channel-id') {
      const value = args[++i];
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value || '')) throw new Error('Informe um --channel-id válido.');
      options.channelId = value;
    } else throw new Error(`Argumento inválido: ${arg}.\n${usage}`);
  }
  if (!options.help && !options.cityId) throw new Error(usage);
  return options;
}
function check(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}
async function readSeedRows(db, table, data) {
  if (table === 'pipa_quotas') {
    const keys = new Set(data[table].map(row => pipaTestRowKey(table, row)));
    const rows = check(await db.from(table).select('driver_id,month').in('driver_id', data.pipa_drivers.map(row => row.id)), `Consultar ${table}`);
    return rows.filter(row => keys.has(pipaTestRowKey(table, row)));
  }
  const fields = table === 'pipa_tanks' ? 'id,channel_id,name,notes' : table === 'pipa_drivers' ? 'id,channel_id,name' : 'id,channel_id,notes';
  const rows = check(await db.from(table).select(fields).in('id', data[table].map(row => row.id)), `Consultar ${table}`);
  for (const row of rows) {
    const expected = data[table].find(item => item.id === row.id);
    const identified = row.notes?.startsWith(PIPA_TEST_MARKER) || row.notes?.startsWith(PIPA_LEGACY_TEST_MARKER)
      || (table === 'pipa_drivers' && [expected.name, `[TESTE] ${expected.name}`].includes(row.name));
    if (row.channel_id !== expected.channel_id || !identified) {
      throw new Error(`Um identificador do seed já pertence a outro registro em ${table}. Nenhum dado foi alterado.`);
    }
  }
  return rows;
}
export async function main(args = process.argv.slice(2)) {
  const options = parsePipaSeedOptions(args);
  if (options.help) { console.log(usage); return; }
  const env = { ...dotenv.parse(await fs.readFile('.env', 'utf8')), ...process.env };
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente no .env.');
  const hostname = new URL(url).hostname;
  const linked = (await fs.readFile('supabase/.temp/project-ref', 'utf8')).trim();
  if (hostname !== `${DEVELOPMENT_PROJECT}.supabase.co` || linked !== DEVELOPMENT_PROJECT
    || (env.VITE_SUPABASE_URL && new URL(env.VITE_SUPABASE_URL).hostname !== hostname)) {
    throw new Error('O seed aceita somente o projeto de desenvolvimento, com .env e vínculo Supabase correspondentes.');
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) } });
  const city = check(await db.from('cities').select('id,name,states(uf)').eq('id', options.cityId).single(), 'Consultar cidade');
  if (city.name !== 'Floresta' || city.states?.uf !== 'PE') throw new Error('As coordenadas deste conjunto de testes foram preparadas para Floresta–PE.');
  const municipality = check(await db.from('prefeituras').select('id').eq('city_id', city.id).eq('status', 'ativa').single(), 'Consultar prefeitura');
  let channelsQuery = db.from('orgao_canais').select('id,nome,city_id').eq('city_id', city.id).eq('ativo', true).eq('canal_triagem', false).contains('municipal_modules', ['water_supply']);
  if (options.channelId) channelsQuery = channelsQuery.eq('id', options.channelId);
  const channels = check(await channelsQuery, 'Consultar secretarias');
  if (channels.length !== 1) throw new Error('Selecione uma única secretaria habilitada para Operação-pipa usando --channel-id.');
  const channel = channels[0];
  const actor = check(await db.from('prefeitura_membros').select('user_id').eq('prefeitura_id', municipality.id).eq('ativo', true).eq('papel', 'administrador').order('user_id').limit(1).maybeSingle(), 'Consultar administrador');
  if (!actor) throw new Error('A prefeitura precisa de um administrador ativo para a auditoria do seed.');
  const data = createPipaTestData({ channelId: channel.id, actorId: actor.user_id });
  const existingEntries = await Promise.all(PIPA_TEST_TABLES.map(async table => [table, await readSeedRows(db, table, data)]));
  const existing = Object.fromEntries(existingEntries), pending = {};
  const plateRows = check(await db.from('pipa_drivers').select('id,plate').eq('channel_id', channel.id).in('plate', data.pipa_drivers.map(row => row.plate)), 'Conferir placas de teste');
  if (plateRows.some(row => !data.pipa_drivers.some(driver => driver.id === row.id && driver.plate === row.plate))) throw new Error('Uma placa de teste já está em uso por outro cadastro. Nenhum dado foi alterado.');
  for (const table of PIPA_TEST_TABLES) {
    const keys = new Set(existing[table].map(row => pipaTestRowKey(table, row)));
    pending[table] = data[table].filter(row => !keys.has(pipaTestRowKey(table, row)));
  }
  const tankCount = await db.from('pipa_tanks').select('id', { count: 'exact', head: true }).eq('channel_id', channel.id);
  check(tankCount, 'Conferir caixas existentes');
  const summary = { project: DEVELOPMENT_PROJECT, city: `${city.name}–${city.states.uf}`, channel: channel.nome, channel_id: channel.id,
    apply: options.apply, originalTanksPreserved: tankCount.count - existing.pipa_tanks.length,
    dataset: Object.fromEntries(PIPA_TEST_TABLES.map(table => [table, data[table].length])),
    toInsert: Object.fromEntries(PIPA_TEST_TABLES.map(table => [table, pending[table].length])) };
  console.log(JSON.stringify(summary, null, 2));
  if (!options.apply) return summary;
  const inserted = {};
  for (const table of PIPA_TEST_TABLES) {
    if (!pending[table].length) { inserted[table] = 0; continue; }
    const onConflict = table === 'pipa_quotas' ? 'driver_id,month' : 'id';
    const rows = check(await db.from(table).upsert(pending[table], { onConflict, ignoreDuplicates: true }).select(onConflict), `Inserir ${table}`);
    inserted[table] = rows.length;
  }
  const verified = {};
  for (const table of PIPA_TEST_TABLES) {
    verified[table] = (await readSeedRows(db, table, data)).length;
    if (verified[table] !== data[table].length) throw new Error(`Verificação incompleta em ${table}. Execute novamente: os identificadores são estáveis e não duplicam registros.`);
  }
  console.log(JSON.stringify({ completed: true, inserted, verified }, null, 2));
  return { ...summary, inserted, verified };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
