import test from 'node:test';
import assert from 'node:assert/strict';
import { legislativeChartCount, legislativeChartScale, legislativeGroupChart } from '../lib/legislativeCharts.js';

test('gráficos distinguem ausência de contagem de um zero publicado', () => {
  assert.equal(legislativeChartCount(null), null);
  assert.equal(legislativeChartCount(undefined), null);
  assert.equal(legislativeChartCount(-1), null);
  assert.equal(legislativeChartCount(NaN), null);
  assert.equal(legislativeChartCount(0), 0);
  const partial = legislativeGroupChart({ melhorias: 23, cobrancas: 0, leis: 1 });
  assert.equal(partial.total, 24);
  assert.equal(partial.complete, false);
  assert.equal(partial.rows.find(row => row.key === 'outros').value, null);
});

test('distribuição usa todos os totais agregados, incluindo grupos zerados', () => {
  const chart = legislativeGroupChart({ melhorias: 23450, cobrancas: 0, homenagens: 100, leis: 200, outros: 125 });
  assert.equal(chart.total, 23875);
  assert.equal(chart.rows.length, 5);
  assert.equal(chart.complete, true);
});

test('eixos acomodam contagens grandes, vazias e ausentes sem divisões por zero', () => {
  for (const values of [[], [0, 0], [null, undefined], [1], [23, 1, 1], [44739, 200]]) {
    const { max, ticks } = legislativeChartScale(values);
    assert.ok(Number.isFinite(max) && max > 0);
    assert.ok(max >= Math.max(0, ...values.filter(value => typeof value === 'number')));
    assert.equal(ticks[0], 0);
    assert.equal(ticks.at(-1), max);
  }
});
