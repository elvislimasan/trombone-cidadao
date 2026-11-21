import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSaplPlan, fetchSaplPage, normalizeSaplRow, saplUrl } from '../../supabase/functions/_shared/legislative/sapl.js';
import { legislativeFilters, legislativeMatterFilters, legislativeOfficialPresence, legislativeOfficialSearch, legislativePreview, legislativeRecordTarget } from '../lib/legislative.js';
import { normalizeLegislativeView, readLegislativeView } from '../lib/legislativeView.js';

const job = buildSaplPlan(2025, 2026).find(row => row.key === 'matters-2025');
const raw = { id: 17, numero: 1, ano: 2025, tipo: 1, data_apresentacao: '2025-01-02', ementa: '<p>Uma &amp; outra</p>', autores: [2, 2, 3], ip: 'private', user: 45, metadata: { token: 'secret' } };
const response = (rows, changes = {}) => new Response(JSON.stringify({ pagination: { page: 1, total_entries: rows.length, total_pages: 1, next_page: null, ...changes }, results: rows }), { headers: { 'content-type': 'application/json' } });

test('normalization whitelists public fields and canonicalizes official document URLs', () => {
  const row = normalizeSaplRow('matters', { ...raw, texto_original: 'http://sapl.floresta.pe.leg.br/media/document.pdf' });
  assert.deepEqual(row.payload.author_ids, [2, 3]);assert.equal(row.payload.summary, 'Uma & outra');
  assert.equal(row.payload.document_url, 'https://sapl.floresta.pe.leg.br/media/document.pdf');
  for (const key of ['ip', 'user', 'metadata', 'token']) assert.ok(!Object.hasOwn(row.payload, key));
  assert.equal(saplUrl('javascript:alert(1)'), null);assert.equal(saplUrl('https://sapl.floresta.pe.leg.br.evil.test/api/'), null);
  assert.equal(saplUrl('http://localhost/'), null);assert.equal(saplUrl('https://user:password@sapl.floresta.pe.leg.br/'), null);
  assert.equal(saplUrl('https://www.youtube.com/watch?v=1'), null);
});
test('institutional authors never become parliamentarians by interpreting their object id', () => {
  assert.equal(normalizeSaplRow('authors', { id: 1, tipo: 2, object_id: 17, nome: 'Mesa Diretora' }).payload.parliamentarian_id, null);
  assert.equal(normalizeSaplRow('authors', { id: 1, tipo: 1, autor_related: { value: 17 } }).payload.parliamentarian_id, 17);
});
test('collection plans cover each year and do not rely on ignored nested filters', () => {
  const plan = buildSaplPlan(2025, 2026);
  assert.deepEqual(plan.filter(row => row.kind === 'matters').map(row => row.params.ano), [2025, 2026]);
  assert.deepEqual(plan.find(row => row.kind === 'authorships').params, {});
  assert.deepEqual(plan.find(row => row.kind === 'sessions').params, { data_inicio__gte: '2025-01-01' });
  assert.throws(() => buildSaplPlan(2026, 2025));
});
test('pagination uses SAPL metadata and validates server-side year filtering', async () => {
  const result = await fetchSaplPage(job, 1, { fetchImpl: async url => { const parsed = new URL(url);assert.equal(parsed.searchParams.get('ano'), '2025');assert.equal(parsed.searchParams.get('page_size'), '100');return response([raw]); } });
  assert.equal(result.total, 1);assert.equal(result.records[0].external_id, 17);
  await assert.rejects(fetchSaplPage(job, 1, { fetchImpl: async () => response([{ ...raw, ano: 2024 }]) }), /ignorou/);
  await assert.rejects(fetchSaplPage(job, 1, { fetchImpl: async () => response([raw], { next_page: 1 }) }), /cíclica/);
  await assert.rejects(fetchSaplPage(job, 1, { fetchImpl: async () => response([raw, raw]) }), /repetiu/);
  await assert.rejects(fetchSaplPage(job, 1, { fetchImpl: async () => response([raw], { total_pages: -1 }) }), /Paginação/);
  await assert.rejects(fetchSaplPage(job, 1, { fetchImpl: async () => new Response('<html>login</html>', { headers: { 'content-type': 'text/html' } }) }), /JSON/);
  await assert.rejects(fetchSaplPage({ ...job, path: '../../admin' }, 1), /autorizado/);
});
test('zero ballots are distinct from missing vote counts', () => {
  assert.equal(normalizeSaplRow('ballot_types', { id: 0, nome: 'Não informado' }).external_id, 0);
  assert.equal(normalizeSaplRow('ballots', { id: 1, numero_votos_nao: 0 }).payload.no, 0);
  assert.equal(normalizeSaplRow('ballots', { id: 1 }).payload.no, null);
});
test('retryable responses preserve rate limiting rather than silently dropping a page', async () => {
  await assert.rejects(fetchSaplPage(job, 1, { fetchImpl: async () => new Response('', { status: 429, headers: { 'retry-after': '120' } }) }), error => error.retryable && error.retryAfter === 120);
  await assert.rejects(fetchSaplPage(job, 1, { fetchImpl: async () => new Response('', { status: 429, headers: { 'retry-after': new Date(Date.now() + 120000).toUTCString() } }) }), error => error.retryable && error.retryAfter >= 119 && error.retryAfter <= 121);
});

test('plain groups and territorial/person filters survive navigation without retaining a stale page', () => {
  const filters = legislativeFilters(new URLSearchParams('territorio=Tr%C3%AAs+Marias&grupo=cobrancas&parlamentar=15&pagina=4'));
  assert.equal(filters.territory, 'Três Marias');assert.equal(filters.group, 'cobrancas');assert.equal(filters.parliamentarianId, 15);
  const params = legislativeMatterFilters(filters);assert.equal(params.get('grupo'), 'cobrancas');assert.equal(params.get('parlamentar'), '15');assert.equal(params.get('pagina'), null);
  assert.equal(legislativeFilters(new URLSearchParams('parlamentar=90071992547409999&grupo=rank')).parliamentarianId, null);
});

test('official links carry date/author scope and never silently select only ordinary sessions', () => {
  const filters = { start: '2025-01-01', end: '2026-11-13', typeId: 21 };
  const matter = new URL(legislativeOfficialSearch(filters, [30]));assert.equal(matter.hostname, 'sapl.floresta.pe.leg.br');
  assert.equal(matter.searchParams.get('autoria__autor'), '30');assert.equal(matter.searchParams.get('data_apresentacao_0'), '01/01/2025');assert.equal(matter.searchParams.get('tipo'), '21');
  const presence = new URL(legislativeOfficialPresence(filters, [{ data: { legislature_id: 9, started_on: '2025-01-01', ended_on: '2026-12-31' } }]));
  assert.equal(presence.searchParams.get('legislatura'), '9');assert.equal(presence.searchParams.get('tipo'), '');
  assert.equal(new URL(legislativeOfficialSearch(filters, [30, 31])).searchParams.has('autoria__autor'), false);
});
test('period and filter parsing limits public queries without inventing source coverage', () => {
  const filters = legislativeFilters(new URLSearchParams('inicio=invalid&pagina=-4&tipo=invalid&tema=invalid'));
  assert.equal(filters.start, '2025-01-01');assert.equal(filters.page, 1);assert.equal(filters.typeId, null);assert.equal(filters.topic, null);
  assert.equal(legislativeFilters(new URLSearchParams('inicio=2025-02-30&pagina=1.5&vereador=------------------------------------')).start, '2025-01-01');
  assert.equal(legislativeFilters(new URLSearchParams('pagina=1.5')).page, 1);
  assert.equal(normalizeSaplRow('sessions', { id: 1, data_inicio: '2025-02-30' }).payload.date, null);
});

test('related records accept only known Trombone routes and send identifiers without fetching user URLs', () => {
  const id = '20000000-0000-4000-8000-000000000001';
  assert.deepEqual(legislativeRecordTarget(`/bronca/${id}`), { kind: 'report', target_id: id });
  assert.deepEqual(legislativeRecordTarget(`https://trombonecidadao.com.br/mapa-pavimentacao/rua/${id}?city=64`), { kind: 'street', target_id: id });
  assert.equal(legislativeRecordTarget(`javascript:/bronca/${id}`), null);
  assert.equal(legislativeRecordTarget(`/admin/${id}`), null);
  assert.equal(legislativeRecordTarget('/bronca/invalid'), null);
});

test('mobile and desktop visual preferences remain independent and tolerate unavailable storage', () => {
  const preferences = normalizeLegislativeView({ mobile: { layout: 'list', summary: false, distribution: true }, desktop: { layout: 'invalid', summary: 'false' } });
  assert.deepEqual(preferences.mobile, { layout: 'list', summary: false, distribution: true });
  assert.deepEqual(preferences.desktop, { layout: 'cards', summary: true, distribution: false });
  assert.equal(readLegislativeView({ getItem() { throw Error('Storage unavailable'); } }).mobile.layout, 'cards');
  assert.equal(readLegislativeView({ getItem() { return '{malformed'; } }).desktop.summary, true);
});

test('citizen previews omit only a recognized request opening and preserve negations and source details', () => {
  const purpose = 'não retirar as árvores da Rua São José, mas realizar a poda conforme avaliação técnica.';
  const opening = 'Solicito à Mesa, após cumpridas as formalidades regimentais, ' + 'ouvida a equipe responsável e a administração municipal, '.repeat(4);
  const original = opening + 'no sentido de ' + purpose;
  assert.equal(legislativePreview(original, 'melhorias'), '… ' + purpose);
  assert.equal(legislativePreview(original, 'leis'), original);
  assert.equal(legislativePreview('Solicita limpeza na rua.', 'melhorias'), 'Solicita limpeza na rua.');
});
