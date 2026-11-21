// Read-only smoke check. No credentials or source response bodies are printed.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const env = dotenv.parse(await fs.readFile('.env', 'utf8'));
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
if (new URL(url).hostname !== 'xxdletrjyjajtrmhwzev.supabase.co') throw Error('Somente desenvolvimento.');
const anon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
assert.ok(anon, 'Configure a chave pública de desenvolvimento.');
const db = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) } });
const results = [];
let directory;
for (const [view, filters] of [['overview', {}], ['matters', { page: 2 }], ['matter', { id: 7190 }], ['sessions', {}], ['session', { id: 541 }], ['directory', {}], ['recurrences', {}], ['parliamentarian', { parliamentarian_id: 15 }], ['matters', { territory: 'tres marias' }]]) {
  const started = Date.now();const { data, error } = await db.rpc('legislative_public', { p_city: 64, p_view: view, p_filters: filters });
  assert.ifError(error);assert.equal(data.state, 'ready');
  assert.ok(!Object.hasOwn(data, 'requested_by'));
  if (view === 'overview') { assert.ok(data.total >= 1118);assert.equal(Object.values(data.groups).reduce((a,b)=>a+b,0),data.total); }
  if (view === 'directory') directory=data.parliamentarians;
  if (view === 'parliamentarian') assert.equal(data.parliamentarian.id,15);
  if (view === 'matter') { assert.ok(data.matter.authors.length);assert.ok(Array.isArray(data.related)); }
  results.push({ view, ms: Date.now() - started, ...(data.total !== undefined ? { total: data.total } : {}), ...(data.metrics ? { metrics: data.metrics } : {}), ...(view==='overview'?{groups:data.groups}: {}) });
}
let checkedProfiles=0;
if(process.argv.includes('--all-profiles'))for(const person of directory){
  const result=await db.rpc('legislative_public',{p_city:64,p_view:'parliamentarian',p_filters:{parliamentarian_id:person.id}});assert.ifError(result.error);assert.equal(result.data.state,'ready');assert.equal(result.data.parliamentarian.id,person.id);checkedProfiles++;
}
const other = await db.rpc('legislative_public', { p_city: 65 });assert.ifError(other.error);assert.equal(other.data.state, 'unconfigured');
const privateRead = await db.from('legislative_versions').select('id').limit(1);assert.ok(privateRead.error, 'Snapshots must stay private.');
const endpoint = `${url}/functions/v1/collect-legislative-data`;
const noSession = await fetch(endpoint, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: '{"action":"start","city_id":64}', signal: AbortSignal.timeout(20000) });assert.equal(noSession.status, 401);
const invalidBody = await fetch(endpoint, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: '{}'.repeat(3000), signal: AbortSignal.timeout(20000) });assert.equal(invalidBody.status, 400);
await fs.mkdir('.tmp/legislative-research', { recursive: true });
await fs.writeFile('.tmp/legislative-research/dev-public-verification.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify({ project: 'xxdletrjyjajtrmhwzev', publicViews: results, checkedProfiles, cityIsolation: true, privateSnapshots: true, collectorAuthentication: true, boundedRequest: true }));
