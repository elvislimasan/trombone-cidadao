// Preenche apenas endereços vazios. Sem --apply, mostra o inventário sem alterar dados.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { reverseGeocodePin } from '../src/lib/reverseGeocodePin.js';
import { polePosition } from '../src/lib/poleAddress.js';

const EMPTY_ADDRESS = 'address.is.null,address.eq.""';
const FIELDS = 'id,city_id,identifier,plate,address,latitude,longitude,lamp_type,lamp_power_w,lighting_status';
const usage = `Uso: npm run poles:addresses -- --city-id ID [--pole-id ID] [--limit N] [--apply]
Sem --apply, apenas lista quantos postes estão sem endereço.
Com --apply, consulta o reverse geocode e salva endereço e histórico, um poste por vez.
--pole-id usa o ID do banco, e não o número/placa do poste.`;

export function parseOptions(args) {
  const options = { apply: false, help: false, cityId: null, poleId: null, limit: null };
  const names = { '--city-id': 'cityId', '--pole-id': 'poleId', '--limit': 'limit' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--help') options.help = true;
    else if (names[arg]) {
      const value = args[++i];
      if (!/^\d+$/.test(value || '') || !Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
        throw new Error(`${arg} exige um inteiro positivo.`);
      }
      options[names[arg]] = Number(value);
    } else throw new Error(`Argumento inválido: ${arg}.\n${usage}`);
  }
  if (!options.help && !options.cityId) throw new Error(`Informe --city-id para limitar a atualização ao município.\n${usage}`);
  return options;
}

const candidates = (db, options, fields = FIELDS, selectOptions = {}) => {
  let query = db.from('poles').select(fields, selectOptions).eq('city_id', options.cityId)
    .neq('lighting_status', 'removido').or(EMPTY_ADDRESS);
  if (options.poleId) query = query.eq('id', options.poleId);
  return query;
};

export async function savePoleAddress(db, pole, address) {
  const cleanAddress = typeof address === 'string' ? address.trim() : '';
  if (!cleanAddress || String(pole.address || '').trim() || !polePosition(pole)) return { skipped: true };
  const { data, error } = await db.from('poles').update({ address: cleanAddress, updated_at: new Date().toISOString() })
    .eq('id', pole.id).eq('city_id', pole.city_id).eq('latitude', pole.latitude).eq('longitude', pole.longitude)
    .neq('lighting_status', 'removido').or(EMPTY_ADDRESS).select(FIELDS).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { skipped: true };
  const history = {
    pole_id: data.id, city_id: data.city_id, pole_number: data.identifier || data.plate || String(data.id),
    address: data.address, old_power_w: data.lamp_power_w, new_power_w: data.lamp_power_w,
    old_lamp_type: data.lamp_type, new_lamp_type: data.lamp_type,
    old_status: data.lighting_status, new_status: data.lighting_status, action: 'updated', changed_by: null,
  };
  const { error: historyError } = await db.from('pole_lighting_changes').insert(history);
  return { saved: data, history, historyError: historyError?.message || null };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) { console.log(usage); return; }
  const env = { ...dotenv.parse(await fs.readFile('.env', 'utf8')), ...process.env };
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('URL ou SUPABASE_SERVICE_ROLE_KEY ausente no .env.');
  const project = new URL(url).hostname.split('.')[0];
  const linked = (await fs.readFile('supabase/.temp/project-ref', 'utf8')).trim();
  if (project !== linked) throw new Error('O .env aponta para um projeto diferente do Supabase vinculado.');
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) },
  });
  const { count, error } = await candidates(db, options, 'id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  console.log(JSON.stringify({ project, cityId: options.cityId, withoutAddress: count, apply: options.apply, limit: options.limit }));
  if (!options.apply || !count) return;

  const directory = path.resolve('.tmp');
  await fs.mkdir(directory, { recursive: true });
  const reportPath = path.join(directory, `pole-addresses-${options.cityId}-${Date.now()}.json`);
  const report = { project, cityId: options.cityId, startedAt: new Date().toISOString(), entries: [], saved: 0, skipped: 0, unavailable: 0 };
  const checkpoint = () => fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  await checkpoint();
  console.log('Relatório local: ' + reportPath);
  let lastId = 0;
  let processed = 0;
  let consecutiveFailures = 0;
  try {
    while (options.limit == null || processed < options.limit) {
      const pageSize = Math.min(100, options.limit == null ? 100 : options.limit - processed);
      const { data, error: readError } = await candidates(db, options).gt('id', lastId).order('id').limit(pageSize);
      if (readError) throw new Error(readError.message);
      if (!data?.length) break;
      for (const pole of data) {
        lastId = pole.id;
        processed++;
        const position = polePosition(pole);
        const entry = { pole, status: 'pending' };
        report.entries.push(entry);
        if (!position) { entry.status = 'invalid_coordinates'; report.skipped++; await checkpoint(); continue; }
        // Consultas sequenciais e intervalo mínimo também no fallback direto.
        if (processed > 1) await new Promise((resolve) => setTimeout(resolve, 1200));
        const result = await reverseGeocodePin(position, {
          invoke: db.functions.invoke.bind(db.functions),
          fetcher: (input, init) => fetch(input, {
            ...init, signal: AbortSignal.timeout(15000),
            headers: { ...init?.headers, 'User-Agent': 'TromboneCidadao/1.0 (pole-addresses)' },
          }),
        });
        if (!result?.address?.trim()) {
          entry.status = 'unavailable'; report.unavailable++; consecutiveFailures++;
          await checkpoint();
          console.log(`Poste ${pole.id}: endereço indisponível.`);
          if (consecutiveFailures >= 3) throw new Error('Três consultas consecutivas falharam. Execute novamente para retomar os postes sem endereço.');
          continue;
        }
        consecutiveFailures = 0;
        entry.address = result.address.trim();
        entry.status = 'saving';
        await checkpoint();
        const saved = await savePoleAddress(db, pole, entry.address);
        entry.status = saved.skipped ? 'changed_during_lookup' : saved.historyError ? 'history_failed' : 'saved';
        if (saved.skipped) report.skipped++;
        else report.saved++;
        if (saved.historyError) { entry.history = saved.history; entry.historyError = saved.historyError; }
        await checkpoint();
        if (saved.historyError) throw new Error(`Endereço do poste ${pole.id} salvo, mas o histórico falhou: ${saved.historyError}. Consulte o relatório local.`);
        console.log(`Poste ${pole.id}: ${saved.skipped ? 'alterado durante a consulta; ignorado' : entry.address}`);
      }
      if (data.length < pageSize) break;
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    await checkpoint();
    console.log(JSON.stringify({ saved: report.saved, skipped: report.skipped, unavailable: report.unavailable, reportPath }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((cause) => { console.error(cause.message); process.exitCode = 1; });
}
