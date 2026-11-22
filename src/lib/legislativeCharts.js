import { LEGISLATIVE_GROUPS } from './legislative';

export const LEGISLATIVE_CHART_COLORS = Object.freeze({ melhorias: '#139d89', cobrancas: '#df594b', homenagens: '#d69219', leis: '#4383cd', outros: '#7b8595' });
export const legislativeChartCount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export function legislativeGroupChart(groups) {
  const rows = Object.entries(LEGISLATIVE_GROUPS).map(([key, label]) => ({ key, label, value: legislativeChartCount(groups?.[key]), color: LEGISLATIVE_CHART_COLORS[key] }));
  return { rows, total: rows.reduce((sum, row) => sum + (row.value ?? 0), 0), complete: rows.every(row => row.value !== null) };
}

export function legislativeChartScale(values) {
  const largest = Math.max(0, ...values.filter(value => legislativeChartCount(value) !== null));
  if (!largest) return { max: 1, ticks: [0, 1] };
  const roughStep = Math.max(1, largest / 5), magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = [1, 2, 5, 10].find(multiplier => multiplier * magnitude >= roughStep) * magnitude;
  const max = Math.ceil(largest / step) * step;
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, index) => index * step) };
}
