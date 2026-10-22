import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceOverviewScope, loadAttendanceOverview, overviewReportPath, overviewWeekDays } from '../lib/municipalOverview.js';

const scope = { userId: 'worker', municipality: { id: 'pref', city_id: 64 }, enabledCategoryIds: ['poda', 'iluminacao'], readableChannelIds: ['agri'], categoryChannels: [{ canal_id: 'agri', category_id: 'poda' }, { canal_id: 'light', category_id: 'iluminacao' }] };
function clientFor(rows, { cap = 500, failAfter = Infinity } = {}) {
  const calls = [];
  return { calls, from() {
    let selected = [...rows]; let signal;
    const query = {
      select() { return query; },
      eq(key, value) { calls.push([key, value]); selected = selected.filter(row => String(row[key]) === String(value)); return query; },
      in(key, values) { calls.push([key, values]); selected = selected.filter(row => values.includes(row[key])); return query; },
      or(expression) { if (expression.startsWith('is_petition')) selected = selected.filter(row => !row.is_petition); return query; },
      order() { return query; }, abortSignal(value) { signal = value; return query; },
      range(from, end) { calls.push(['range', from, end]); return Promise.resolve(from >= failAfter ? { error: new Error('Falha no banco') } : { data: selected.slice(from, Math.min(end + 1, from + cap)) }).then(result => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); return result; }); },
    }; return query;
  } };
}
const row = extra => ({ id: crypto.randomUUID(), city_id: 64, category_id: 'poda', status: 'pending', is_public: true, moderation_status: 'approved', created_at: '2026-10-22T12:00:00Z', ...extra });

test('visão geral usa somente categorias dos vínculos com leitura de atendimento', () => {
  assert.deepEqual(attendanceOverviewScope(scope), ['poda']);
  assert.deepEqual(attendanceOverviewScope({ ...scope, activeChannelId: 'light' }), []);
  assert.deepEqual(attendanceOverviewScope({ ...scope, readableChannelIds: [] }), []);
  assert.deepEqual(attendanceOverviewScope({ ...scope, isAdministrator: true }), ['poda', 'iluminacao']);
  assert.deepEqual(attendanceOverviewScope({ ...scope, isAdministrator: true, activeChannelId: 'light' }), ['iluminacao']);
});
test('contagens percorrem limite reduzido do servidor, incluindo ordens vinculadas e separando visibilidade', async () => {
  const client = clientFor([
    ...Array.from({ length: 503 }, () => row({})),
    row({ status: 'in-progress', is_public: false, moderation_status: 'internal', created_by_municipality: 'pref' }),
    row({ status: 'pending_resolution' }), row({ status: 'resolved' }),
    row({ city_id: 65 }), row({ category_id: 'iluminacao' }), row({ is_petition: true }),
    row({ is_public: false, moderation_status: 'internal', created_by_municipality: 'other' }), row({ moderation_status: 'pending' }),
  ], { cap: 100 });
  const summary = await loadAttendanceOverview(client, { municipalityId: 'pref', cityId: 64, categoryIds: ['poda'], now: new Date('2026-10-22T15:00:00Z') });
  assert.equal(summary.total, 506);
  assert.deepEqual(summary.phases.pending, { total: 503, public: 503, internal: 0 });
  assert.deepEqual(summary.phases.in_progress, { total: 2, public: 1, internal: 1 });
  assert.equal(summary.phases.finished.total, 1);
  assert.equal(summary.days.reduce((sum, day) => sum + day.value, 0), 506);
  assert.ok(client.calls.filter(([key]) => key === 'range').length > 5);
  assert.ok(client.calls.some(([key, ids]) => key === 'category_id' && ids.length === 1 && ids[0] === 'poda'));
});
test('falha na segunda página rejeita indicadores parciais; escopo vazio não consulta registros', async () => {
  const client = clientFor(Array.from({ length: 3 }, () => row({})), { cap: 1, failAfter: 1 });
  await assert.rejects(loadAttendanceOverview(client, { municipalityId: 'pref', cityId: 64, categoryIds: ['poda'] }), /Falha no banco/);
  const empty = clientFor([]);
  assert.equal((await loadAttendanceOverview(empty, { municipalityId: 'pref', cityId: 64, categoryIds: [] })).total, 0);
  assert.equal(empty.calls.length, 0);
});
test('links preservam cidade, secretaria, categoria, fase e fila de solicitações internas', () => {
  const url = new URL(overviewReportPath({ ...scope, activeChannelId: 'agri' }, { category: 'poda', phase: 'in_progress', visibility: 'internal' }), 'https://local.test');
  assert.equal(url.pathname, '/prefeitura/broncas');
  assert.deepEqual(Object.fromEntries(url.searchParams), { fase: 'in_progress', visibilidade: 'internas', categoria: 'poda', cidade: '64', secretaria: 'agri' });
});
test('semana tem sete intervalos consecutivos sem sobreposição', () => {
  const days = overviewWeekDays(new Date('2026-10-22T15:00:00Z'));
  assert.equal(days.length, 7);
  for (let index = 1; index < days.length; index++) assert.equal(days[index - 1].end, days[index].start);
});
