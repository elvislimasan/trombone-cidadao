import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGISLATIVE_PERIOD_KEY, restoreLegislativePeriod, saveLegislativePeriod } from '../lib/legislativePeriod.js';

const period = { start: '2026-03-01', end: '2026-10-31' };
const memory = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('the saved period restores both dates without losing search or person filters', () => {
  const storage = memory();
  assert.equal(saveLegislativePeriod(period, storage), true);
  const params = new URLSearchParams('busca=escola&parlamentar=15');
  const restored = restoreLegislativePeriod(params, storage);
  assert.equal(restored.get('inicio'), period.start);assert.equal(restored.get('fim'), period.end);
  assert.equal(restored.get('busca'), 'escola');assert.equal(restored.get('parlamentar'), '15');
  assert.equal(params.has('inicio'), false);
});

test('explicit shared dates take precedence over local preferences, even for one date', () => {
  const storage = memory();saveLegislativePeriod(period, storage);
  for (const query of ['inicio=2025-01-01&fim=2025-12-31', 'inicio=2025-01-01', 'fim=2025-12-31']) {
    const params = new URLSearchParams(query);
    assert.equal(restoreLegislativePeriod(params, storage), params);
  }
});

test('invalid, corrupt or unavailable storage keeps the default period usable', () => {
  const storage = memory(), params = new URLSearchParams();
  assert.equal(restoreLegislativePeriod(params, storage), params);
  for (const value of ['{', 'null', JSON.stringify({ start: '2026-02-30', end: '2026-03-31' }), JSON.stringify({ start: period.end, end: period.start })]) {
    storage.setItem(LEGISLATIVE_PERIOD_KEY, value);
    assert.equal(restoreLegislativePeriod(params, storage), params);
  }
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(restoreLegislativePeriod(params, blocked), params);
  assert.equal(saveLegislativePeriod(period, blocked), false);
});

test('invalid ranges never overwrite the last applied valid period', () => {
  const storage = memory();saveLegislativePeriod(period, storage);
  for (const value of [{ start: '2026-02-30', end: period.end }, { start: period.end, end: period.start }, { start: '', end: '' }]) assert.equal(saveLegislativePeriod(value, storage), false);
  assert.deepEqual(JSON.parse(storage.getItem(LEGISLATIVE_PERIOD_KEY)), period);
});
