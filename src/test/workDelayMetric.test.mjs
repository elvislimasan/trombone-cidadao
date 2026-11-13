import assert from 'node:assert/strict';
import test from 'node:test';
import { getAvailableWorkDelayUnits, getWorkDelayMetric, resolveWorkDelayUnit } from '@/lib/workDelayMetric';

const day = value => Date.parse(`${value}T00:00:00Z`) / 86400000;
const delay = (expected, actual) => ({ expectedDay: day(expected), actualDay: day(actual), metricNumber: Math.abs(day(actual) - day(expected)), isOverdue: day(actual) > day(expected), isDueToday: actual === expected });

test('uses exact days and the correct singular', () => {
  assert.deepEqual(getWorkDelayMetric(delay('2026-01-01', '2026-01-02')), { value: 1, number: '1', label: 'DIA DE ATRASO' });
  assert.equal(getWorkDelayMetric(delay('2026-01-01', '2026-05-04')).number, '123');
});

test('counts complete calendar months rather than fixed groups of 30 days', () => {
  assert.equal(getWorkDelayMetric(delay('2026-01-15', '2026-05-14'), 'months').number, '3');
  assert.equal(getWorkDelayMetric(delay('2026-01-15', '2026-05-15'), 'months').number, '4');
  assert.deepEqual(getWorkDelayMetric(delay('2026-01-31', '2026-02-28'), 'months'), { value: 1, number: '1', label: 'MÊS DE ATRASO' });
});

test('handles complete years and leap-day anniversaries', () => {
  assert.deepEqual(getAvailableWorkDelayUnits(delay('2024-02-29', '2025-02-27')), ['days', 'months']);
  assert.deepEqual(getAvailableWorkDelayUnits(delay('2024-02-29', '2025-02-28')), ['days', 'months', 'years']);
  assert.deepEqual(getWorkDelayMetric(delay('2024-02-29', '2025-02-28'), 'years'), { value: 1, number: '1', label: 'ANO DE ATRASO' });
  assert.equal(getWorkDelayMetric(delay('2024-02-29', '2026-02-28'), 'years').label, 'ANOS DE ATRASO');
});

test('keeps remaining months when displaying years', () => {
  const data = delay('2024-12-13', '2026-11-13');
  assert.equal(getWorkDelayMetric(data, 'months').number, '23');
  assert.deepEqual(getWorkDelayMetric(data, 'years'), { value: 1, number: '1', label: 'ANO E 11 MESES DE ATRASO' });
  assert.equal(getWorkDelayMetric(delay('2024-12-13', '2026-01-13'), 'years').label, 'ANO E 1 MÊS DE ATRASO');
  assert.equal(getWorkDelayMetric(delay('2024-12-13', '2027-01-13'), 'years').label, 'ANOS E 1 MÊS DE ATRASO');
  assert.equal(getWorkDelayMetric(delay('2024-12-13', '2027-11-13'), 'years').label, 'ANOS E 11 MESES DE ATRASO');
  assert.equal(getWorkDelayMetric(delay('2024-12-13', '2026-11-12'), 'years').label, 'ANO E 10 MESES DE ATRASO');
  assert.equal(getWorkDelayMetric(delay('2024-01-31', '2025-02-28'), 'years').label, 'ANO E 1 MÊS DE ATRASO');
  assert.equal(getWorkDelayMetric(delay('2024-12-13', '2026-12-13'), 'years').label, 'ANOS DE ATRASO');
});

test('unavailable units fall back to days without displaying a fraction', () => {
  const data = delay('2026-11-01', '2026-11-08');
  assert.deepEqual(getAvailableWorkDelayUnits(data), ['days']);
  for (const unit of ['months', 'years']) {
    assert.deepEqual(getWorkDelayMetric(data, unit), { value: 7, number: '7', label: 'DIAS DE ATRASO' });
    assert.equal(resolveWorkDelayUnit(data, unit), 'days');
  }
  assert.deepEqual(getAvailableWorkDelayUnits(delay('2026-01-31', '2026-02-27')), ['days']);
  assert.deepEqual(getAvailableWorkDelayUnits(delay('2026-01-31', '2026-02-28')), ['days', 'months']);
});

test('uses the same calendar rules for future deadlines', () => {
  assert.deepEqual(getWorkDelayMetric(delay('2026-05-31', '2026-01-31'), 'months'), { value: 4, number: '4', label: 'MESES PARA O PRAZO' });
  assert.equal(getWorkDelayMetric(delay('2026-11-09', '2026-11-08'), 'years').label, 'DIA PARA O PRAZO');
  assert.deepEqual(getWorkDelayMetric(delay('2026-11-13', '2024-12-13'), 'years'), { value: 1, number: '1', label: 'ANO E 11 MESES PARA O PRAZO' });
});

test('the deadline day remains zero and explicitly says today in every unit', () => {
  for (const unit of ['days', 'months', 'years']) assert.deepEqual(getWorkDelayMetric(delay('2026-11-08', '2026-11-08'), unit), { value: 0, number: '0', label: 'PRAZO VENCE HOJE' });
});
