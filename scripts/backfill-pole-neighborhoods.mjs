// Prévia por padrão; --apply grava somente o bairro e sua fonte.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { reverseGeocodePin } from '../src/lib/reverseGeocodePin.js';
import { polePosition } from '../src/lib/poleAddress.js';
import { neighborhoodFromProperties, poleNeighborhood, uniqueLinkedPoleNeighborhood } from '../src/lib/poleNeighborhood.js';
import { registeredNeighborhood } from '../supabase/functions/_shared/reportNeighborhoods.js';

const FIELDS = 'id,city_id,address,latitude,longitude,raw_properties,updated_at,lighting_status';
const usage = 'Uso: npm run poles:neighborhoods -- --city-id ID [--limit N] [--geocode] [--apply]';
export function parseOptions(args) {
  const options = { cityId: null, limit: null, geocode: false, apply: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--geocode') options.geocode = true;
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--city-id' || arg === '--limit') {
      const value = args[++i];
      if (!/^\d+$/.test(value || '') || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new Error(`${arg} exige um inteiro positivo.`);
      options[arg === '--city-id' ? 'cityId' : 'limit'] = Number(value);
    } else throw new Error(`Argumento inválido: ${arg}. ${usage}`);
  }
  if (!options.cityId) throw new Error(usage);
  return options;
}

export async function resolvePoleNeighborhood(db, pole, neighborhoods, reports = [], { geocode = false, lookup } = {}) {
  const properties = pole.raw_properties || {};
  const explicit = neighborhoodFromProperties(properties.municipal)
    || neighborhoodFromProperties(properties) || neighborhoodFromProperties(properties.kmz);
  if (explicit) return { neighborhood: null, reason: 'already_defined' };
  const fromAddress = poleNeighborhood(pole, neighborhoods);
  if (fromAddress) return { neighborhood: fromAddress, source: 'address' };
  const linked = uniqueLinkedPoleNeighborhood(pole, reports, neighborhoods);
  const fromReport = registeredNeighborhood(linked, neighborhoods);
  if (fromReport) return { neighborhood: fromReport, source: 'linked_report' };
  if (!geocode) return { neighborhood: null, reason: 'needs_geocode' };
  const position = polePosition(pole);
  if (!position) return { neighborhood: null, reason: 'invalid_coordinates' };
  const result = await lookup(position);
  if (!result?.city || !result?.state_uf) return { neighborhood: null, reason: 'city_unresolved' };
  const { data: cityId, error } = await db.rpc('match_city', { p_name: result.city, p_uf: result.state_uf });
  if (error) throw new Error(error.message);
  if (Number(cityId) !== Number(pole.city_id)) return { neighborhood: null, reason: 'city_mismatch' };
  const name = registeredNeighborhood(result.suburb, neighborhoods);
  return name ? { neighborhood: name, source: 'coordinates' }
    : { neighborhood: null, reason: 'neighborhood_unavailable', candidate: result.suburb || null };
}

export async function savePoleNeighborhood(db, pole, result) {
  if (!result.neighborhood) return { skipped: true };
  const raw = pole.raw_properties;
  const properties = { ...(raw || {}), neighborhood: result.neighborhood, neighborhood_source: result.source };
  let query = db.from('poles').update({ raw_properties: properties, updated_at: new Date().toISOString() })
    .eq('id', pole.id).eq('city_id', pole.city_id).neq('lighting_status', 'removido');
  // Protege marcador, endereço e metadados editados enquanto a geo respondia.
  for (const field of ['latitude', 'longitude', 'address', 'updated_at']) {
    query = pole[field] == null ? query.is(field, null) : query.eq(field, pole[field]);
  }
  query = raw == null ? query.is('raw_properties', null) : query.eq('raw_properties', JSON.stringify(raw));
  const { data, error } = await query.select(FIELDS).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { saved: data } : { skipped: true };
}

async function loadAll(db, table, fields, cityId, configure = (query) => query) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await configure(db.from(table).select(fields).eq('city_id', cityId)).order('id').range(from, from + 499);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const env = { ...dotenv.parse(await fs.readFile('.env', 'utf8')), ...process.env };
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Credenciais do Supabase ausentes.');
  const project = new URL(url).hostname.split('.')[0];
  const linked = (await fs.readFile('supabase/.temp/project-ref', 'utf8')).trim();
  if (project !== linked) throw new Error('O .env aponta para um projeto diferente do Supabase vinculado.');
  const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
  });
  const [poles, neighborhoods, reports] = await Promise.all([
    loadAll(db, 'poles', FIELDS, options.cityId, (query) => query.neq('lighting_status', 'removido')),
    loadAll(db, 'bairros', 'id,name', options.cityId),
    loadAll(db, 'reports', 'id,city_id,pole_id,neighborhood,status,moderation_status', options.cityId, (query) => query.not('pole_id', 'is', null)),
  ]);
  await fs.mkdir('.tmp', { recursive: true });
  const reportPath = path.resolve('.tmp', `pole-neighborhoods-${options.cityId}-${Date.now()}.json`);
  const report = { project, ...options, total: poles.length, ready: 0, saved: 0, skipped: 0, unresolved: 0, entries: [] };
  const checkpoint = () => fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  let lookups = 0;
  const lookup = async (position) => {
    if (lookups++) await new Promise((resolve) => setTimeout(resolve, 1200));
    return reverseGeocodePin(position, { invoke: db.functions.invoke.bind(db.functions),
      fetcher: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000),
        headers: { ...init?.headers, 'User-Agent': 'TromboneCidadao/1.0 (pole-neighborhoods)' } }),
    });
  };
  try {
    for (const pole of poles) {
      if (options.limit != null && report.entries.length >= options.limit) break;
      const resolved = await resolvePoleNeighborhood(db, pole, neighborhoods, reports, { geocode: options.geocode, lookup });
      const entry = { pole, ...resolved, status: resolved.neighborhood ? 'ready' : resolved.reason };
      report.entries.push(entry);
      if (resolved.neighborhood) {
        report.ready++;
        if (options.apply) {
          await checkpoint(); // Snapshot anterior salvo antes de gravar.
          const saved = await savePoleNeighborhood(db, pole, resolved);
          entry.status = saved.skipped ? 'changed_during_lookup' : 'saved';
          if (saved.skipped) report.skipped++; else report.saved++;
        }
      } else if (resolved.reason === 'already_defined') report.skipped++;
      else report.unresolved++;
    }
  } finally {
    await checkpoint();
    console.log(JSON.stringify({ project, cityId: options.cityId, apply: options.apply, total: report.total, ready: report.ready,
      saved: report.saved, skipped: report.skipped, unresolved: report.unresolved, reportPath }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((cause) => { console.error(cause.message); process.exitCode = 1; });
}
