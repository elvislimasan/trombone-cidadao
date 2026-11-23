import { legislativeChartCount } from './legislativeCharts';

// Ratio of published records to sessions, not an inferred attendance or absence rate.
export function legislativePresenceRatio(data, person) {
  const sessions = legislativeChartCount(data?.sessions), presences = legislativeChartCount(person?.presences);
  if (!data?.presence_complete || person?.conflicts > 0 || !sessions || presences === null || presences > sessions) return null;
  return Math.round(presences / sessions * 100);
}

// A cited statutory base, not net pay or a claim about the latest payroll.
export function legislativeSalaryBase(cityId, filters) {
  if (Number(cityId) !== 64 || !filters?.start || !filters?.end || filters.end < filters.start || filters.start < '2025-01-01' || filters.end > '2028-12-31') return null;
  return { amount: 10432, reference: 'Resolução 8/2023 · base de 2025', source: 'https://sapl.floresta.pe.leg.br/norma/2218' };
}
