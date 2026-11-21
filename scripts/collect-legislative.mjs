// Development import only. Credentials stay in process memory; no production writes.
import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { startLegislativeRun, collectLegislativeSlice } from '../supabase/functions/_shared/legislative/collector.js';

const args = process.argv.slice(2);
if (args.some(arg => !['--apply', '--publish', '--resume'].includes(arg))) throw Error('Uso: node scripts/collect-legislative.mjs [--apply] [--resume] [--publish]');
if (args.includes('--publish') && !args.includes('--apply')) throw Error('Publicação exige --apply.');
const env = dotenv.parse(await fs.readFile('.env', 'utf8'));
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
if (!url || new URL(url).hostname !== 'xxdletrjyjajtrmhwzev.supabase.co') throw Error('Este importador aceita somente o projeto de desenvolvimento configurado.');
if (!env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Chave de serviço do desenvolvimento ausente.');
const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(45000) }) } });
const check = result => { if (result.error) throw Error(result.error.message);return result.data; };
const source = check(await db.from('legislative_sources').select('*').eq('city_id', 64).single());
console.log(JSON.stringify({ project: 'xxdletrjyjajtrmhwzev', city: 64, source: source.name, dailyEnabled: source.daily_enabled, apply: args.includes('--apply') }));
if (!args.includes('--apply')) process.exit(0);
if (args.includes('--resume')) {
  const failed = check(await db.from('legislative_runs').select('id').eq('source_id', source.id).eq('status', 'failed').order('started_at', { ascending: false }).limit(1).maybeSingle());
  if (failed) check(await db.rpc('legislative_resume_run', { p_run: failed.id }));
}
const ready = args.includes('--publish') ? check(await db.from('legislative_runs').select('id').eq('source_id', source.id).eq('status', 'ready').order('started_at', { ascending: false }).limit(1).maybeSingle()) : null;
const runId = ready?.id || await startLegislativeRun(db, source);
for (;;) {
  const slice = await collectLegislativeSlice(db, runId, { maxPages: 12, maxMs: 40000 });
  const run = check(await db.from('legislative_runs').select('status,summary,error').eq('id', runId).single());
  const jobs = check(await db.from('legislative_jobs').select('received,status,resource_key,error').eq('run_id', runId));
  console.log(JSON.stringify({ runId, status: run.status, pages: slice.pages, received: jobs.reduce((sum, job) => sum + job.received, 0), resourcesDone: jobs.filter(job => job.status === 'done').length, resources: jobs.length, errors: slice.errors }));
  if (run.status === 'failed') throw Error(run.error || 'Coleta falhou.');
  if (['ready', 'published'].includes(run.status)) {
    if (args.includes('--publish') && run.status === 'ready') check(await db.rpc('legislative_publish_run', { p_run: runId }));
    await fs.mkdir('.tmp/legislative-research', { recursive: true });
    await fs.writeFile('.tmp/legislative-research/dev-import-result.json', JSON.stringify({ project: 'xxdletrjyjajtrmhwzev', runId, summary: run.summary, published: args.includes('--publish') || run.status === 'published', finished_at: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify({ completed: true, runId, published: args.includes('--publish'), summary: run.summary }));break;
  }
  if (!slice.pages || slice.errors.length) throw Error('Progresso salvo. Aguarde a retentativa e execute novamente para retomar.');
}
