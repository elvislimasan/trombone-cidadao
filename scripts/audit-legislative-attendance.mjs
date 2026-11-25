// Anonymous DEV reads and one public SAPL report. No credentials or reasons are printed.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { legislativeOfficialPresence } from '../src/lib/legislative.js';

const env = dotenv.parse(await fs.readFile('.env', 'utf8'));
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
assert.equal(new URL(url).hostname, 'xxdletrjyjajtrmhwzev.supabase.co', 'Somente DEV.');
const db = createClient(url, env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const filters = { start: '2025-01-01', end: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' }) };
const { data, error } = await db.rpc('legislative_attendance', { p_city: 64, p_start: filters.start, p_end: filters.end });
assert.ifError(error);assert.equal(data.state, 'ready');
const officialUrl = legislativeOfficialPresence(filters, data.legislature_ids.map(id => ({ data: { legislature_id: id } })));
const response = await fetch(officialUrl, { redirect: 'error', signal: AbortSignal.timeout(30000) });
assert.equal(response.status, 200);
const html = await response.text();assert.ok(html.length < 2 * 1024 * 1024);
const plain = value => value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+/g, ' ').trim();
const fold = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
assert.ok(fold(plain(html)).includes('ausencias justificadas em sessao'), 'Confirme o formato das colunas oficiais.');
const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => plain(cell[1]))).filter(cells => cells.length === 8);
const people = data.people.map(person => {
  const matches = rows.filter(cells => fold(cells[0].split(' / ')[0]) === fold(person.name));
  const official = matches.length === 1 ? matches[0] : null;
  return { id: person.id, presences: person.presences, justified: person.justified, conflicts: person.conflicts,
    official_presences: official && /^\d+$/.test(official[3]) ? Number(official[3]) : null,
    official_justified: official && /^\d+$/.test(official[7]) ? Number(official[7]) : null,
    matched: !!official };
});
for (const person of people) {
  if (!person.matched) continue;
  assert.equal(person.presences, person.official_presences, `Presenças divergentes: parlamentar ${person.id}`);
  if (data.absence_complete && person.conflicts === 0) assert.equal(person.justified, person.official_justified, `Justificadas divergentes: parlamentar ${person.id}`);
}
assert.ok(people.filter(person => person.matched).length >= 3, 'A conferência exige ao menos três correspondências inequívocas.');
assert.equal(data.totals.unexcused, null, 'Não inferir faltas não justificadas.');
const result = { city_id: 64, run_id: data.run_id, checked_at: new Date().toISOString(), period: filters, official_url: officialUrl,
  presence_complete: data.presence_complete, absence_complete: data.absence_complete, sessions: data.sessions,
  matched: people.filter(person => person.matched).length, people };
await fs.mkdir('.tmp/legislative-research', { recursive: true });
await fs.writeFile('.tmp/legislative-research/attendance-audit.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ state: 'verified', people: people.length, matched: result.matched, presenceComplete: data.presence_complete, absenceComplete: data.absence_complete, totals: data.totals }));
