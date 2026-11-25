// Dedicated DEV worker provisioning. Never prints secret values.
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const action = process.argv[2];
if (!['--prepare', '--apply', '--verify'].includes(action) || process.argv.length !== 3) throw Error('Use --prepare, --apply ou --verify.');
const env = dotenv.parse(await fs.readFile('.env', 'utf8'));
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
if (new URL(url).hostname !== 'xxdletrjyjajtrmhwzev.supabase.co') throw Error('Somente desenvolvimento.');
const file = '.tmp/legislative-dev-worker.env';
if (action === '--prepare') {
  await fs.mkdir('.tmp', { recursive: true });
  try { await fs.access(file); } catch { await fs.writeFile(file, `LEGISLATIVE_WORKER_SECRET=${randomBytes(48).toString('base64url')}\n`, { flag: 'wx', mode: 0o600 }); }
  console.log('Arquivo dedicado preparado em .tmp/legislative-dev-worker.env; enviar à função DEV antes de --apply.');
} else {
  const worker = dotenv.parse(await fs.readFile(file, 'utf8'));
  if ((worker.LEGISLATIVE_WORKER_SECRET || '').length < 32 || !env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Credenciais de configuração ausentes.');
  const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (action === '--apply') {
    const { data, error } = await db.rpc('legislative_configure_worker', { p_url: `${url}/functions/v1/collect-legislative-data`, p_secret: worker.LEGISLATIVE_WORKER_SECRET, p_enabled: true, p_auto_publish: true });
    if (error) throw Error(error.message);
    console.log(JSON.stringify({ project: 'xxdletrjyjajtrmhwzev', ...data }));
  } else {
    const { data: source, error } = await db.from('legislative_sources').select('daily_enabled,auto_publish,last_daily_on').eq('city_id', 64).single();
    if (error) throw Error(error.message);
    assert.equal(source.daily_enabled, true);assert.equal(source.auto_publish, true);
    assert.equal(source.last_daily_on, new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' }), 'Este teste só roda após uma coleta de hoje, para não iniciar outra carga.');
    const response = await fetch(`${url}/functions/v1/collect-legislative-data`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-legislative-worker-secret': worker.LEGISLATIVE_WORKER_SECRET }, body: '{"action":"tick"}', signal: AbortSignal.timeout(45000) });
    assert.equal(response.status, 200, 'O worker deve aceitar seu segredo dedicado.');
    const result = await response.json();assert.equal(result.pages, 0);assert.deepEqual(result.errors, []);
    const receipt = { project: 'xxdletrjyjajtrmhwzev', ...source, dedicatedAuthentication: true, idleTick: true, verified_at: new Date().toISOString() };
    await fs.writeFile('.tmp/legislative-research/dev-worker-verification.json', JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  }
}
