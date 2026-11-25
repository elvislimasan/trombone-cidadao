import { legislativeChartCount } from './legislativeCharts';
import { legislativeRemuneration } from './legislativeRemuneration';

// Ratio of published records to sessions, not an inferred attendance or absence rate.
export function legislativePresenceRatio(data, person) {
  const sessions = legislativeChartCount(data?.sessions), presences = legislativeChartCount(person?.presences);
  if (!data?.presence_complete || person?.conflicts > 0 || !sessions || presences === null || presences > sessions) return null;
  return Math.round(presences / sessions * 100);
}

// A cited statutory base, not net pay or a claim about the latest payroll.
export function legislativeSalaryBase(cityId, filters) {
  const policy = legislativeRemuneration(cityId);
  if (!policy || !filters?.start || !filters?.end || filters.end < filters.start || filters.start < policy.start || filters.end >= policy.endExclusive) return null;
  return { amount: policy.monthlyCents / 100, reference: policy.reference, source: policy.salarySource };
}
