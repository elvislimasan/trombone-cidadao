// Only anonymous Trombone reads and public official reports. No service key.
import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { legislativeOfficialPresence, legislativeOfficialSearch } from '../src/lib/legislative.js';

const env = dotenv.parse(await fs.readFile('.env', 'utf8'));
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
if (new URL(url).hostname !== 'xxdletrjyjajtrmhwzev.supabase.co') throw Error('Somente DEV.');
const db = createClient(url, env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const filters = { start: '2025-01-01', end: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' }) };
const rpc = async (name, args) => { const { data, error } = await db.rpc(name, args);if (error) throw Error(error.message);return data; };
const plain = html => html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();
const normalized = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
async function official(href) {
  const target = new URL(href);if (target.hostname !== 'sapl.floresta.pe.leg.br' || target.protocol !== 'https:') throw Error('Fonte não autorizada.');
  await new Promise(resolve => setTimeout(resolve, 1000));
  try {
    const response = await fetch(href, { redirect: 'error', headers: { 'User-Agent': 'TromboneCidadao-Legislative/1.0', Accept: 'text/html' }, signal: AbortSignal.timeout(30000) });
    const html = await response.text();if (html.length > 2 * 1024 * 1024) throw Error('Relatório acima do limite.');
    return { href, status: response.status, html, text: plain(html) };
  } catch { return { href, status: 0, html: '', text: '' }; }
}
const overview = await rpc('legislative_public', { p_city: 64, p_view: 'overview', p_filters: filters });
if (overview.state !== 'ready') throw Error('Publique o acervo DEV antes de auditar.');
const report = { schema_version: 1, city_id: 64, run_id: overview.source.run_id, verified_at: new Date().toISOString(), period: filters, sessions: null, people: [], limitations: [] };
let presence;
for (const id of [3, 15, 32]) {
  const profile = await rpc('legislative_public', { p_city: 64, p_view: 'parliamentarian', p_filters: { ...filters, parliamentarian_id: id } });
  if (profile.state !== 'ready') throw Error(`Ficha oficial ${id} indisponível.`);
  const activity = await rpc('legislative_parliamentarian_activity', { p_city: 64, p_person: id, p_start: filters.start, p_end: filters.end });
  if (activity.state !== 'ready') throw Error(`Registros de ${id} indisponíveis.`);
  if (!presence) {
    presence = await official(legislativeOfficialPresence(filters, activity.terms));
    const found = normalized(presence.text).match(/totais no periodo sessoes (\d+) ordens do dia (\d+)/);
    const sessions = await rpc('legislative_public', { p_city: 64, p_view: 'sessions', p_filters: filters });
    report.sessions = { trombone: sessions.total, official: found ? Number(found[1]) : null, official_url: presence.href, http_status: presence.status };
  }
  const name = profile.parliamentarian.data.parliamentary_name;
  const rows = [...presence.html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => plain(cell[1])));
  const row = rows.find(cells => normalized(cells[0] || '').startsWith(normalized(name) + ' '));
  const search = await official(legislativeOfficialSearch(filters, profile.parliamentarian.author_ids));
  const searchText = normalized(search.text);
  const count = searchText.match(/(?:total de materias|total de registros|total de resultados)\s*(\d+)/)
    || searchText.match(/(?:foram encontradas|foram encontrados|encontradas|encontrados)\s*(\d+)\s*(?:materias|resultados|registros)/)
    || searchText.match(/(\d+)\s*(?:materias encontradas|resultados encontrados)/);
  const authorReport = await official(legislativeOfficialSearch(filters, profile.parliamentarian.author_ids).replace('/materia/pesquisar-materia', '/sistema/relatorios/materia-por-autor'));
  const compare = (actual, expected, officialUrl) => ({ trombone: actual, official: expected, matches: expected === null ? null : actual === expected, official_url: officialUrl });
  report.people.push({ id, name, official_profile_url: profile.parliamentarian.source_url,
    matters: { ...compare(profile.total, count ? Number(count[1]) : null, search.href), http_status: search.status },
    attendance: compare(activity.attendance.total, row && /^\d+$/.test(row[3]) ? Number(row[3]) : null, presence.href),
    agenda_attendance: compare(activity.agenda_attendance.total, row && /^\d+$/.test(row[5]) ? Number(row[5]) : null, presence.href),
    author_report: { url: authorReport.href, http_status: authorReport.status },
  });
  if (!count && search.status === 200) console.log(JSON.stringify({ parserReview: id, countContext: search.text.match(/.{0,60}(?:[Tt]otal|encontrad).{0,120}/)?.[0] || 'Contagem não localizada no HTML oficial.' }));
}
report.sessions.matches = report.sessions.official === null ? null : report.sessions.trombone === report.sessions.official;
report.limitations = [
  'Conferência de amostra de três parlamentares e do total de sessões; não é auditoria integral de cada documento ou mandato.',
  'O relatório separado de matérias por autor pode falhar na Câmara; a pesquisa oficial é a alternativa identificada em cada comparação.',
  'Grupos são estimativas por regras e locais são extraídos do texto. Não foram auditados integralmente de forma humana.',
  'Não foram confirmados denominadores de frequência, suplências, unanimidade ou execução dos serviços.',
  'A conferência vale para o período e o acervo identificados; novas coletas não recebem automaticamente este selo de comparação.',
];
await fs.mkdir('src/data', { recursive: true });await fs.mkdir('docs/research', { recursive: true });
await fs.writeFile('src/data/legislativeVerification.json', JSON.stringify(report, null, 2) + '\n');
await fs.writeFile(`docs/research/RADAR_LEGISLATIVO_CONFERENCIA_${filters.end}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
