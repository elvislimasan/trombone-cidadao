import test from 'node:test';
import assert from 'node:assert/strict';
import { legislativePresenceRatio, legislativeSalaryBase } from '../lib/legislativeProfile.js';

test('percentual usa sessões e registros completos sem inferir faltas', () => {
  assert.equal(legislativePresenceRatio({ sessions: 87, presence_complete: true }, { presences: 82 }), 94);
  assert.equal(legislativePresenceRatio({ sessions: 87, presence_complete: true }, { presences: 0 }), 0);
  for (const [data, person] of [
    [{ sessions: 0, presence_complete: true }, { presences: 0 }],
    [{ sessions: 87, presence_complete: false }, { presences: 82 }],
    [{ sessions: 87, presence_complete: true }, { presences: null }],
    [{ sessions: 87, presence_complete: true }, { presences: 88 }],
    [{ sessions: 87, presence_complete: true }, { presences: 82, conflicts: 1 }],
    [null, null],
  ]) assert.equal(legislativePresenceRatio(data, person), null);
});

test('salário-base tem fonte, cidade e legislatura explícitas', () => {
  const period = { start: '2025-01-01', end: '2026-11-23' };
  assert.equal(legislativeSalaryBase(64, period).amount, 10432);
  assert.match(legislativeSalaryBase(64, period).source, /sapl\.floresta\.pe\.leg\.br\/norma\/2218/);
  assert.equal(legislativeSalaryBase(65, period), null);
  assert.equal(legislativeSalaryBase(64, { ...period, start: '2024-01-01' }), null);
  assert.equal(legislativeSalaryBase(64, { ...period, end: '2029-01-01' }), null);
});
