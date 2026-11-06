import test from 'node:test';
import assert from 'node:assert/strict';
import { profileReportsQuery } from '../lib/profileReports.js';
import { fetchProfileJourneySummary } from '../lib/profileJourneySummary.js';

const rows = [
  { id: 'normal', author_id: 'account-a', origin: 'report', moderation_status: 'pending_approval' },
  { id: 'legacy', author_id: 'account-a', origin: null },
  { id: 'approved', author_id: 'account-a', origin: 'report', moderation_status: 'approved' },
  { id: 'completed', author_id: 'account-a', origin: 'signal', signal_status: 'done', moderation_status: 'pending_approval' },
  { id: 'open', author_id: 'account-a', origin: 'signal', signal_status: 'open' },
  { id: 'empty', author_id: 'account-a', origin: 'signal', signal_status: 'empty' },
  { id: 'unconfirmed', author_id: 'account-a', origin: 'signal', signal_status: null },
  { id: 'other-account', author_id: 'account-b', origin: 'signal', signal_status: 'done' },
];

// Evaluate the small subset of PostgREST predicates used by these queries,
// including SQL null semantics, against mixed reports and patrol signals.
function matches(row, clause) {
  const [column, operator, value] = clause.split('.');
  if (operator === 'is' && value === 'null') return row[column] == null;
  if (row[column] == null) return false;
  if (operator === 'eq') return row[column] === value;
  if (operator === 'neq') return row[column] !== value;
  throw new Error(`Unsupported predicate: ${clause}`);
}

function client() {
  return { from(table) {
    const filters = []; let alternatives = [], head = false;
    return {
      select(_columns, options) { head = Boolean(options?.head); return this; },
      eq(key, value) { filters.push(row => row[key] === value); return this; },
      or(expression) { alternatives = expression.split(','); return this; },
      then(resolve, reject) {
        const data = (table === 'reports' ? rows : []).filter(row => filters.every(filter => filter(row))
          && (!alternatives.length || alternatives.some(clause => matches(row, clause))));
        return Promise.resolve({ data: head ? null : data, count: data.length, error: null }).then(resolve, reject);
      },
    };
  } };
}

test('perfil exibe broncas normais, legadas e sinalizações efetivadas, inclusive em moderação', async () => {
  const { data } = await profileReportsQuery(client(), 'account-a');
  assert.deepEqual(data.map(row => row.id), ['normal', 'legacy', 'approved', 'completed']);
});

test('total de Minhas broncas corresponde à lista, sem sinalizações abertas ou vazias', async () => {
  const database = client();
  const { data } = await profileReportsQuery(database, 'account-a');
  const totals = await fetchProfileJourneySummary(database, 'account-a', 64);
  assert.equal(totals.reports, 4);
  assert.equal(totals.reports, data.length);
});

test('broncas efetivadas continuam vinculadas à conta consultada', async () => {
  const { data } = await profileReportsQuery(client(), 'account-b');
  assert.deepEqual(data.map(row => row.id), ['other-account']);
});
