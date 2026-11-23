import test from 'node:test';
import assert from 'node:assert/strict';
import { legislativeAccruedSalary, legislativeCurrentRemuneration, legislativeRemuneration } from '../lib/legislativeRemuneration.js';

const time = value => Date.parse(value);
const policy = legislativeRemuneration(64);
const monthlyCents = 13 * 1043200;

test('estimativa tem cidade, cargos, fonte e legislatura delimitadas', () => {
  assert.equal(policy.seats, 13);
  assert.equal(policy.monthlyCents, 1043200);
  assert.match(policy.salarySource, /sapl\.floresta\.pe\.leg\.br\/norma\/2218/);
  assert.equal(legislativeRemuneration(65), null);
  assert.equal(legislativeCurrentRemuneration(64, time('2024-12-31T23:59:59-03:00')), null);
  assert.equal(legislativeCurrentRemuneration(64, time('2025-01-01T00:00:00-03:00')), policy);
  assert.equal(legislativeCurrentRemuneration(64, time('2028-12-31T23:59:59-03:00')), policy);
  assert.equal(legislativeCurrentRemuneration(64, time('2029-01-01T00:00:00-03:00')), null);
  assert.equal(legislativeCurrentRemuneration(64, NaN), null);
});

test('meses completos somam a base mensal sem 13º ou férias implícitos', () => {
  assert.equal(legislativeAccruedSalary(policy, time('2025-01-01T00:00:00-03:00')), 0);
  assert.equal(legislativeAccruedSalary(policy, time('2025-02-01T00:00:00-03:00')), monthlyCents);
  assert.equal(legislativeAccruedSalary(policy, time('2026-01-01T00:00:00-03:00')), monthlyCents * 12);
  assert.equal(legislativeAccruedSalary(policy, time('2029-01-01T00:00:00-03:00')), monthlyCents * 48);
});

test('fração usa dias reais do mês, horário de Fortaleza e ano bissexto', () => {
  assert.equal(legislativeAccruedSalary(policy, time('2025-01-16T12:00:00-03:00')), monthlyCents / 2);
  assert.equal(legislativeAccruedSalary(policy, time('2025-02-15T00:00:00-03:00')), monthlyCents * 1.5);
  assert.equal(legislativeAccruedSalary(policy, time('2028-02-15T12:00:00-03:00')), monthlyCents * 37.5);
  assert.ok(legislativeAccruedSalary(policy, time('2025-02-01T02:59:59Z')) < monthlyCents);
  assert.equal(legislativeAccruedSalary(policy, time('2025-02-01T03:00:00Z')), monthlyCents);
});

test('contador recalcula tempo real, cresce a cada segundo e não passa do mandato', () => {
  const now = time('2026-11-23T09:00:00-03:00');
  assert.ok(legislativeAccruedSalary(policy, now + 1000) > legislativeAccruedSalary(policy, now));
  assert.equal(legislativeAccruedSalary(policy, time('2030-01-01T00:00:00-03:00')), monthlyCents * 48);
  assert.equal(legislativeAccruedSalary(policy, time('2024-01-01T00:00:00-03:00')), 0);
  assert.equal(legislativeAccruedSalary(null, now), null);
  assert.equal(legislativeAccruedSalary(policy, NaN), null);
});
