// Sem --apply, gera uma prévia local sem alterar o banco conectado.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { reverseGeocodePin } from '../src/lib/reverseGeocodePin.js';
import { OPEN_REPORT_STATUSES } from '../src/lib/municipalReports.js';

const FIELDS = 'id,city_id,address,neighborhood,location';
const EMPTY_NEIGHBORHOOD = 'neighborhood.is.null,neighborhood.eq.""';
const usage = `Uso: npm run reports:neighborhoods -- --city-id ID [--limit N] [--geocode] [--apply]
Preenche bairros vazios de broncas em aberto, sem modificar o endereço.
Sem --apply, salva apenas uma prévia em .tmp.
Por padrão, usa bairros cadastrados na cidade e explícitos no endereço.
--geocode também consulta as coordenadas quando o endereço não identifica o bairro.`;

export function parseOptions(args) {
  const options = { cityId: null, limit: null, geocode: false, apply: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') options.help = true;
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--geocode') options.geocode = true;
    else if (arg === '--city-id' || arg === '--limit') {
      const value = args[++i];
      if (!/^\d+$/.test(value || '') || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
        throw new Error(`${arg} exige um inteiro positivo.`);
      }
      options[arg === '--city-id' ? 'cityId' : 'limit'] = Number(value);
    } else throw new Error(`Argumento inválido: ${arg}.\n${usage}`);
  }
  if (!options.help && !options.cityId) throw new Error(`Informe --city-id.\n${usage}`);
  return options;
}

const normalize = (value) => String(value || '').trim().normalize('NFD')
  .replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');

export function neighborhoodFromAddress(address, neighborhoods) {
  const normalizedAddress = normalize(address);
  const dner = neighborhoods.find((item) => normalize(item.name) === normalize('São Francisco de Assis (DNER)'))?.name?.trim();
  // DNER é o nome local abreviado do bairro cadastrado. Só usa a associação
  // quando a cidade consultada contém esse nome canônico.
  const dnerMention = /\b(?:bairro|no|na|do|da)\s+dner\b/u.test(normalizedAddress);
  const explicitlyNamed = neighborhoods.filter((item) => {
    const name = normalize(item.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\bbairro\\s*:?\\s*${name}(?=$|[^\\p{L}\\p{N}])`, 'u').test(normalizedAddress);
  }).map((item) => item.name.trim());
  if (dner && dnerMention) explicitlyNamed.push(dner);
  if (new Set(explicitlyNamed).size === 1) return explicitlyNamed[0];
  if (explicitlyNamed.length) return null;
  // Compare segmentos completos: "Rua do Centro" não significa bairro Centro.
  const segments = String(address || '').split(/\s+[-–—]\s+|[,;]/u).slice(1)
    .map((value) => normalize(value.replace(/^\s*bairro\s*:?\s+/iu, '')));
  const matches = neighborhoods.filter((item) => segments.includes(normalize(item.name)))
    .map((item) => item.name.trim());
  if (dner && segments.includes('dner')) matches.push(dner);
  const names = [...new Set(matches)];
  return names.length === 1 ? names[0] : null;
}

export function reportPosition(report) {
  const location = report.location;
  const coordinates = location?.type === 'Point' ? location.coordinates : null;
  const [lng, lat] = coordinates || [location?.lng, location?.lat];
  if ([lat, lng].some((value) => value == null || String(value).trim() === '')) return null;
  const latitude = Number(lat);
  const longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { lat: latitude, lng: longitude } : null;
}

export async function resolveReportNeighborhood(db, report, neighborhoods, { geocode = false, lookup } = {}) {
  const explicit = neighborhoodFromAddress(report.address, neighborhoods);
  if (explicit) return { neighborhood: explicit, source: 'address' };
  if (!geocode) return { neighborhood: null, reason: 'needs_geocode' };
  const position = reportPosition(report);
  if (!position) return { neighborhood: null, reason: 'invalid_coordinates' };
  const result = await lookup(position);
  const rawNeighborhood = String(result?.suburb || '').trim();
  if (!rawNeighborhood || normalize(rawNeighborhood) === normalize(result?.city)) {
    return { neighborhood: null, reason: 'neighborhood_unavailable' };
  }
  if (!result?.city || !result?.state_uf) return { neighborhood: null, reason: 'city_unresolved' };
  const city = await db.rpc('match_city', { p_name: result.city, p_uf: result.state_uf });
  if (city.error) throw new Error(city.error.message);
  if (Number(city.data) !== Number(report.city_id)) return { neighborhood: null, reason: 'city_mismatch' };
  // O geocodificador pode devolver "Né Maniçoba - AABB". Isso não identifica
  // qual dos dois bairros é o correto; só gravar um nome do cadastro exato.
  const neighborhood = neighborhoods.find((item) => normalize(item.name) === normalize(rawNeighborhood))?.name?.trim();
  if (!neighborhood) return { neighborhood: null, reason: 'neighborhood_not_registered', candidate: rawNeighborhood };
  return { neighborhood, source: 'coordinates' };
}

export async function saveReportNeighborhood(db, report, neighborhood) {
  const clean = String(neighborhood || '').trim();
  if (!clean || String(report.neighborhood || '').trim()) return { skipped: true };
  const position = reportPosition(report);
  if (report.location != null && !position) return { skipped: true };
  let request = db.from('reports').update({ neighborhood: clean })
    .eq('id', report.id).eq('city_id', report.city_id).in('status', OPEN_REPORT_STATUSES);
  request = report.neighborhood == null ? request.is('neighborhood', null) : request.eq('neighborhood', report.neighborhood);
  request = report.address == null ? request.is('address', null) : request.eq('address', report.address);
  // Não preencher a partir de um marcador que foi movido durante a consulta.
  request = position ? request.eq('location', `SRID=4326;POINT(${position.lng} ${position.lat})`) : request.is('location', null);
  const { data, error } = await request.select(FIELDS).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { saved: data } : { skipped: true };
}

const candidates = (db, options, fields = FIELDS, selectOptions = {}) => db.from('reports')
  .select(fields, selectOptions).eq('city_id', options.cityId).in('status', OPEN_REPORT_STATUSES)
  .or('moderation_status.eq.approved,moderation_status.is.null')
  .or('is_petition.eq.false,is_petition.is.null').or(EMPTY_NEIGHBORHOOD);

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) { console.log(usage); return; }
  const env = { ...dotenv.parse(await fs.readFile('.env', 'utf8')), ...process.env };
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('URL ou SUPABASE_SERVICE_ROLE_KEY ausente no .env.');
  const project = new URL(url).hostname.split('.')[0];
  const linked = (await fs.readFile('supabase/.temp/project-ref', 'utf8')).trim();
  if (project !== linked) throw new Error('O .env aponta para um projeto diferente do Supabase vinculado.');
  const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) },
  });
  const inventory = await candidates(db, options, 'id', { count: 'exact', head: true });
  if (inventory.error) throw new Error(inventory.error.message);
  const neighborhoods = [];
  for (let from = 0; ; from += 500) {
    const result = await db.from('bairros').select('name').eq('city_id', options.cityId).order('id').range(from, from + 499);
    if (result.error) throw new Error(result.error.message);
    neighborhoods.push(...result.data);
    if (result.data.length < 500) break;
  }
  const report = { project, ...options, missing: inventory.count, startedAt: new Date().toISOString(), entries: [], ready: 0, saved: 0, skipped: 0, unresolved: 0 };
  await fs.mkdir('.tmp', { recursive: true });
  const reportPath = path.resolve('.tmp', `report-neighborhoods-${options.cityId}-${Date.now()}.json`);
  const checkpoint = () => fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  await checkpoint();
  console.log(JSON.stringify({ project, cityId: options.cityId, missing: report.missing, apply: options.apply, geocode: options.geocode, reportPath }));
  let lastId;
  let lookups = 0;
  const lookup = async (position) => {
    if (lookups++) await new Promise((resolve) => setTimeout(resolve, 1200));
    return reverseGeocodePin(position, {
      invoke: db.functions.invoke.bind(db.functions),
      fetcher: (input, init) => fetch(input, {
        ...init, signal: AbortSignal.timeout(15000),
        headers: { ...init?.headers, 'User-Agent': 'TromboneCidadao/1.0 (report-neighborhoods)' },
      }),
    });
  };
  try {
    while (options.limit == null || report.entries.length < options.limit) {
      const pageSize = Math.min(100, options.limit == null ? 100 : options.limit - report.entries.length);
      let request = candidates(db, options).order('id').limit(pageSize);
      if (lastId) request = request.gt('id', lastId);
      const result = await request;
      if (result.error) throw new Error(result.error.message);
      if (!result.data?.length) break;
      for (const item of result.data) {
        lastId = item.id;
        const entry = { report: item, status: 'pending' };
        report.entries.push(entry);
        await checkpoint();
        const resolved = await resolveReportNeighborhood(db, item, neighborhoods, { geocode: options.geocode, lookup });
        Object.assign(entry, resolved);
        if (!resolved.neighborhood) { entry.status = 'unresolved'; report.unresolved++; }
        else {
          entry.status = 'ready'; report.ready++;
          // O snapshot original fica em disco antes de qualquer gravação.
          await checkpoint();
          if (options.apply) {
            const saved = await saveReportNeighborhood(db, item, resolved.neighborhood);
            entry.status = saved.skipped ? 'changed_during_lookup' : 'saved';
            if (saved.skipped) report.skipped++; else report.saved++;
          }
        }
        await checkpoint();
        if (report.entries.length % 25 === 0) console.log(JSON.stringify({ processed: report.entries.length, ready: report.ready, saved: report.saved, unresolved: report.unresolved }));
      }
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    await checkpoint();
    console.log(JSON.stringify({ processed: report.entries.length, ready: report.ready, saved: report.saved, skipped: report.skipped, unresolved: report.unresolved, reportPath }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((cause) => { console.error(cause.message); process.exitCode = 1; });
}
