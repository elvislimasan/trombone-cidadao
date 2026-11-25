// Reviewed statutory base, not a payroll feed. Do not extrapolate to another term/city.
const FLORESTA = Object.freeze({
  cityId: 64,
  seats: 13,
  monthlyCents: 1043200,
  start: '2025-01-01',
  endExclusive: '2029-01-01',
  term: '2025–2028',
  reference: 'Resolução 8/2023 · base de 2025',
  salarySource: 'https://sapl.floresta.pe.leg.br/norma/2218',
  termSource: 'https://sapl.floresta.pe.leg.br/media/sapl/public/sessaoplenaria/540/ata/ata_sessao_solene_de_posse_2025.pdf',
});
const midnight = date => Date.parse(`${date}T00:00:00-03:00`);

export function legislativeRemuneration(cityId) {
  return Number(cityId) === FLORESTA.cityId ? FLORESTA : null;
}

export function legislativeCurrentRemuneration(cityId, timestamp = Date.now()) {
  const policy = legislativeRemuneration(cityId);
  return policy && Number.isFinite(timestamp) && timestamp >= midnight(policy.start) && timestamp < midnight(policy.endExclusive) ? policy : null;
}

// Full calendar months plus the elapsed fraction of this month, in Fortaleza (UTC−3).
// No accumulated increments: resuming a background tab recomputes from the clock.
export function legislativeAccruedSalary(policy, timestamp) {
  if (!policy || !Number.isFinite(timestamp)) return null;
  const start = midnight(policy.start), end = midnight(policy.endExclusive);
  const instant = Math.max(start, Math.min(timestamp, end));
  const local = new Date(instant - 3 * 60 * 60 * 1000);
  const year = local.getUTCFullYear(), month = local.getUTCMonth();
  const first = new Date(start - 3 * 60 * 60 * 1000);
  const wholeMonths = (year - first.getUTCFullYear()) * 12 + month - first.getUTCMonth();
  const monthStart = Date.UTC(year, month, 1, 3), nextMonth = Date.UTC(year, month + 1, 1, 3);
  const fraction = (instant - monthStart) / (nextMonth - monthStart);
  return Math.floor(policy.seats * policy.monthlyCents * (wholeMonths + fraction));
}
