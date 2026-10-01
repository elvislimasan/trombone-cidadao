// Atualiza apenas dados que o KMZ comprova. Endereços gerados por geocoder
// não são substituídos pelo endereço de setor do arquivo original.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { collectPolesFromKmz } from './import_poles_from_kmz.js';

const FIELDS = 'id,dataset_id,city_id,identifier,latitude,longitude,raw_properties,lamp_type,lamp_power_w,updated_at';

export function parseOptions(args) {
  const options = { cityId: null, kmz: '.trae/documents/FLORESTA.kmz', apply: false, limit: null, projectRef: null };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--kmz') options.kmz = args[++index];
    else if (arg === '--project-ref') options.projectRef = args[++index];
    else if (arg === '--city-id' || arg === '--limit') {
      const value = args[++index];
      if (!/^\d+$/.test(value || '') || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
        throw new Error(`${arg} exige um inteiro positivo`);
      }
      options[arg === '--city-id' ? 'cityId' : 'limit'] = Number(value);
    } else throw new Error(`Argumento inválido: ${arg}`);
  }
  if (!options.cityId || !options.kmz) throw new Error('Informe --city-id e um arquivo KMZ válido');
  if (options.projectRef && !/^[a-z0-9]{20}$/.test(options.projectRef)) throw new Error('Projeto inválido');
  return options;
}

export function matchKmzPole(pole, byIdentifier) {
  const candidates = byIdentifier.get(pole.identifier) || [];
  return candidates.find((source) => Math.abs(Number(pole.latitude) - source.lat) < 0.000002
    && Math.abs(Number(pole.longitude) - source.lng) < 0.000002) || null;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
}

export function kmzUpdate(pole, source) {
  if (!source) return null;
  const oldProperties = pole.raw_properties && typeof pole.raw_properties === 'object'
    && !Array.isArray(pole.raw_properties) ? pole.raw_properties : {};
  const update = {};
  const properties = { ...oldProperties, kmz: source.raw_properties.kmz };
  if (JSON.stringify(canonicalJson(properties)) !== JSON.stringify(canonicalJson(oldProperties))) {
    update.raw_properties = properties;
  }
  if (!String(pole.lamp_type ?? '').trim() && source.lamp_type) update.lamp_type = source.lamp_type;
  if (pole.lamp_power_w == null && source.lamp_power_w) update.lamp_power_w = source.lamp_power_w;
  return Object.keys(update).length ? update : null;
}

async function readPoles(db, cityId) {
  const poles = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from('poles').select(FIELDS).eq('city_id', cityId)
      .order('id').range(from, from + 499);
    if (error) throw new Error(error.message);
    poles.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return poles;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const env = { ...dotenv.parse(await fs.readFile('.env', 'utf8')), ...process.env };
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Credenciais do Supabase ausentes');
  const project = new URL(url).hostname.split('.')[0];
  const linked = (await fs.readFile('supabase/.temp/project-ref', 'utf8')).trim();
  if (options.projectRef && project !== options.projectRef) throw new Error('O projeto do .env difere de --project-ref');
  if (options.apply && project !== linked && options.projectRef !== project) {
    throw new Error('Projeto do .env diferente do vinculado; informe --project-ref para confirmar o alvo da gravação');
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const kmzBuffer = await fs.readFile(options.kmz);
  const contentHash = crypto.createHash('sha256').update(kmzBuffer).digest('hex');
  const sources = await collectPolesFromKmz(kmzBuffer);
  const byIdentifier = new Map();
  for (const source of sources) byIdentifier.set(source.identifier,
    [...(byIdentifier.get(source.identifier) || []), source]);
  const poles = await readPoles(db, options.cityId);
  const datasetIds = [...new Set(poles.map((pole) => pole.dataset_id))];
  const { data: datasets, error: datasetError } = await db.from('pole_datasets')
    .select('id,source,content_hash').in('id', datasetIds);
  if (datasetError) throw new Error(datasetError.message);
  const sourceDatasetIds = new Set((datasets || [])
    .filter((dataset) => dataset.content_hash === contentHash && /kmz/i.test(dataset.source || ''))
    .map((dataset) => dataset.id));
  if (!sourceDatasetIds.size) throw new Error('Nenhum dataset KMZ corresponde ao hash deste arquivo');
  const report = { project, cityId: options.cityId, sourceCount: sources.length, poleCount: poles.length,
    apply: options.apply, matched: 0, changed: 0, missing: 0, concurrent: 0,
    lampTypeFilled: 0, lampPowerFilled: 0, entries: [] };
  const reportPath = path.resolve('.tmp', `pole-kmz-details-${options.cityId}-${Date.now()}.json`);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const checkpoint = () => fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  let processed = 0;
  try {
    for (const pole of poles) {
      if (!sourceDatasetIds.has(pole.dataset_id)) continue;
      if (options.limit && processed >= options.limit) break;
      processed++;
      const source = matchKmzPole(pole, byIdentifier);
      if (!source) { report.missing++; continue; }
      report.matched++;
      const update = kmzUpdate(pole, source);
      if (!update) continue;
      const entry = { id: pole.id, identifier: pole.identifier, fields: Object.keys(update), status: 'proposed' };
      report.entries.push(entry);
      if (!options.apply) { report.changed++; continue; }
      const { data, error } = await db.from('poles').update(update)
        .eq('id', pole.id).eq('dataset_id', pole.dataset_id)
        .eq('city_id', pole.city_id).eq('identifier', pole.identifier)
        .gte('latitude', Number(pole.latitude) - 0.0000001)
        .lte('latitude', Number(pole.latitude) + 0.0000001)
        .gte('longitude', Number(pole.longitude) - 0.0000001)
        .lte('longitude', Number(pole.longitude) + 0.0000001)
        .eq('updated_at', pole.updated_at).select('id').maybeSingle();
      if (error) throw new Error(`Poste ${pole.id}: ${error.message}`);
      if (!data) { report.concurrent++; entry.status = 'changed_during_lookup'; }
      else {
        report.changed++;
        entry.status = 'saved';
        if (update.lamp_type) report.lampTypeFilled++;
        if (update.lamp_power_w) report.lampPowerFilled++;
      }
      await checkpoint();
      if (processed % 100 === 0) console.log(`Processados ${processed} postes; atualizados ${report.changed}`);
    }
  } finally { await checkpoint(); }
  console.log(JSON.stringify({ ...report, entries: undefined, reportPath }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
