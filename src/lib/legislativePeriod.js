export const LEGISLATIVE_PERIOD_KEY = 'trombone:legislative-period:v1';

export function validLegislativePeriod(value) {
  const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  return Boolean(validDate(value?.start) && validDate(value?.end) && value.start <= value.end);
}

export function restoreLegislativePeriod(params, storage) {
  // Dates in a shared link take precedence, including partial date filters.
  if (params.has('inicio') || params.has('fim')) return params;
  try {
    const saved = JSON.parse(storage.getItem(LEGISLATIVE_PERIOD_KEY));
    if (!validLegislativePeriod(saved)) return params;
    const restored = new URLSearchParams(params);
    restored.set('inicio', saved.start);restored.set('fim', saved.end);
    return restored;
  } catch { return params; }
}

export function saveLegislativePeriod(period, storage) {
  if (!validLegislativePeriod(period)) return false;
  try {
    storage.setItem(LEGISLATIVE_PERIOD_KEY, JSON.stringify({ start: period.start, end: period.end }));
    return true;
  } catch { return false; }
}
