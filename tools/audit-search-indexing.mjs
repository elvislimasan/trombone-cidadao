// Read-only audit of a Search Console CSV using public pages and the anon API.
// Usage: node tools/audit-search-indexing.mjs <csv> <report.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'dotenv';
import { XMLParser } from 'fast-xml-parser';
import { guideCategoryCounts } from '../src/lib/guideCategories.js';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node tools/audit-search-indexing.mjs <csv> <report.json>');
const env = { ...parse(readFileSync('.env')), ...process.env };
const apiUrl = new URL(env.VITE_SUPABASE_URL || env.SUPABASE_URL);
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
// Never use a service-role key: visibility must match an anonymous visitor.
const claims = JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64url').toString());
if (claims.role !== 'anon' || apiUrl.protocol !== 'https:') throw new Error('An HTTPS API and an anon key are required');
const run = promisify(execFile);
async function http(url, headers = []) {
  try {
    const { stdout } = await run('curl.exe', ['--silent', '--show-error', '--max-time', '25',
      '--dump-header', '-', '--user-agent', 'Googlebot', ...headers.flatMap((header) => ['--header', header]), url], { maxBuffer: 5_000_000 });
    // curl can emit a proxy CONNECT header before the origin response.
    const responses = [...stdout.matchAll(/^HTTP\/[^\r\n]+\r?\n[\s\S]*?\r?\n\r?\n/gm)];
    const response = responses.at(-1);
    if (!response) return { error: 'No HTTP response' };
    const head = response[0];
    const body = stdout.slice(response.index + head.length);
    return {
      status: Number(head.match(/^HTTP\/\S+ (\d+)/)[1]),
      content_type: head.match(/^content-type:\s*(.+)/im)?.[1].trim() || null,
      location: head.match(/^location:\s*(.+)/im)?.[1].trim() || null,
      body,
    };
  } catch {
    // Do not print child-process arguments, which contain the anon key.
    return { error: 'HTTP request failed (network, TLS or timeout)' };
  }
}
async function api(table, select, filters = {}) {
  const url = new URL(`/rest/v1/${table}`, apiUrl);
  url.searchParams.set('select', select);
  for (const [field, value] of Object.entries(filters)) url.searchParams.set(field, value);
  const result = await http(url.href, [`apikey: ${anonKey}`, `Authorization: Bearer ${anonKey}`]);
  if (result.error || result.status !== 200) return { error: result.error || `HTTP ${result.status}` };
  try { return { data: JSON.parse(result.body) }; } catch { return { error: 'Invalid API JSON' }; }
}
function classify(url) {
  const path = new URL(url).pathname.split('/').filter(Boolean);
  if (path[0] === 'guia-da-cidade') return path[1] === 'categoria' ? 'categories' : path[1] === 'guia' ? 'directory' : 'guide';
  return { bronca: 'reports', noticias: 'news', 'abaixo-assinado': 'petitions', 'obras-publicas': 'works', share: 'share', estatisticas: 'stats' }[path[0]] || 'profiles';
}
const urls = readFileSync(input, 'utf8').trim().split(/\r?\n/).slice(1).map((line) => {
  const [url, last_crawl, validation_status] = line.split(',');
  const parsed = new URL(url);
  if (!['trombonecidadao.com.br', 'www.trombonecidadao.com.br'].includes(parsed.hostname) || parsed.protocol !== 'https:') throw new Error('Only public site URLs are allowed');
  return { url, last_crawl, validation_status, group: classify(url) };
});
const ids = (group) => `in.(${[...new Set(urls.filter((row) => row.group === group).map((row) => new URL(row.url).pathname.split('/').at(-1)))].join(',')})`;
const resources = {
  categories: ['directory_categories', 'id,name,parent_id,active'],
  directory: ['directory', 'id,name,description,category_id,category_ids,status', { status: 'eq.approved' }],
  reports: ['reports', 'id,title,description,status,moderation_status', { id: ids('reports') }],
  news: ['news', 'id,title,subtitle,description', { id: ids('news') }],
  petitions: ['petitions', 'id,title,description,status', { id: ids('petitions') }],
  works: ['public_works', 'id,title,description', { id: ids('works') }],
  profiles: ['profiles', 'username,public_profile_enabled', { username: `in.(${urls.filter((row) => row.group === 'profiles').map((row) => new URL(row.url).pathname.slice(1)).join(',')})` }],
};
const data = Object.fromEntries(await Promise.all(Object.entries(resources).map(async ([group, args]) => [group, await api(...args)])));
const categories = new Map((data.categories.data || []).filter((row) => row.active).map((row) => [row.id, row]));
const categoryCounts = guideCategoryCounts(data.directory.data || [], categories);
const localSitemap = new Set(new XMLParser().parse(readFileSync('public/sitemap.xml', 'utf8')).urlset.url.map((row) => row.loc));
const queue = [...urls];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) {
    const row = queue.shift();
    const url = new URL(row.url);
    const id = url.pathname.split('/').at(-1);
    const record = data[row.group]?.data?.find((item) => (row.group === 'profiles' ? item.username : item.id) === id);
    const result = await http(row.url);
    row.http = { status: result.status ?? null, error: result.error ?? null, location: result.location ?? null,
      content_type: result.content_type ?? null, root_empty: /<div\s+id=["']root["']\s*>\s*<\/div>/.test(result.body || ''),
      title: result.body?.match(/<title>(.*?)<\/title>/s)?.[1] || null };
    row.lookup_error = data[row.group]?.error || (row.group === 'categories' ? data.directory.error : null) || null;
    row.public_record_found = Boolean(record);
    row.title = record?.title || record?.name || null;
    row.status = record?.status || null;
    row.moderation_status = record?.moderation_status || null;
    row.text_length = record?.description?.replace(/<[^>]*>/g, ' ').trim().length ?? null;
    if (row.group === 'categories') { row.active = record?.active ?? null; row.approved_entries = row.lookup_error ? null : categoryCounts.get(id) || 0; }
    if (row.group === 'profiles') row.public_profile_enabled = record?.public_profile_enabled ?? null;
    url.hostname = 'trombonecidadao.com.br';
    url.searchParams.delete('categoria');
    if (row.group === 'share') url.pathname = url.pathname.replace(/^\/share\//, '/');
    if (row.group === 'guide' && url.searchParams.get('cidade') === 'todas') url.searchParams.delete('cidade');
    row.canonical = url.href;
    row.in_local_sitemap = localSitemap.has(row.canonical);
    if (row.canonical !== row.url) {
      const canonicalResult = await http(row.canonical);
      row.canonical_http = { status: canonicalResult.status ?? null, error: canonicalResult.error ?? null, location: canonicalResult.location ?? null };
    }
  }
}));
const endpoints = {};
for (const name of ['robots.txt', 'sitemap.xml']) {
  const result = await http(`https://trombonecidadao.com.br/${name}`);
  endpoints[name] = { status: result.status ?? null, content_type: result.content_type ?? null, error: result.error ?? null };
  if (name === 'robots.txt' && result.status === 200) endpoints[name].body = result.body;
  if (name === 'sitemap.xml' && result.status === 200) {
    try {
      const published = new Set(new XMLParser().parse(result.body).urlset.url.map((row) => row.loc));
      endpoints[name].urls = published.size;
      endpoints[name].matches_local = published.size === localSitemap.size && [...localSitemap].every((url) => published.has(url));
      for (const row of urls) row.in_published_sitemap = published.has(row.canonical);
    } catch { endpoints[name].error = 'Invalid sitemap XML'; }
  }
}
const report = { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date()), source: 'Search Console CSV supplied by user', total: urls.length,
  counts: Object.fromEntries([...new Set(urls.map((row) => row.group))].map((group) => [group, urls.filter((row) => row.group === group).length])),
  note: 'Public anon API and HTTP GET as Googlebot; redirects not followed; TLS validation enabled. Initial HTML only, no JavaScript rendering or Search Console inspection.',
  api_errors: Object.fromEntries(Object.entries(data).filter(([, result]) => result.error).map(([group, result]) => [group, result.error])),
  endpoints, urls };
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ total: report.total, counts: report.counts, api_errors: report.api_errors, endpoints,
  http_statuses: Object.fromEntries([...new Set(urls.map((row) => row.http.status))].map((status) => [status, urls.filter((row) => row.http.status === status).length])),
  empty_categories: urls.filter((row) => row.group === 'categories' && row.approved_entries === 0 && !row.lookup_error).length,
  missing_public_pages: urls.filter((row) => row.public_record_found && !row.in_local_sitemap && !row.lookup_error
    && (row.group !== 'categories' || row.active && row.approved_entries > 0)
    && (row.group !== 'reports' || row.moderation_status === 'approved' && row.status !== 'duplicate')
    && (row.group !== 'petitions' || ['open', 'closed', 'victory'].includes(row.status))
    && (row.group !== 'profiles' || row.public_profile_enabled)).map((row) => row.canonical) }, null, 2));
