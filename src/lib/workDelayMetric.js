export const WORK_DELAY_UNITS = [
  { id: 'days', label: 'Dias', singular: 'DIA', plural: 'DIAS' },
  { id: 'months', label: 'Meses', singular: 'MÊS', plural: 'MESES' },
  { id: 'years', label: 'Anos', singular: 'ANO', plural: 'ANOS' },
];

// Dias UTC mantêm a mesma base do atrasômetro. Meses e anos são períodos
// completos de calendário, com aniversários limitados ao último dia do mês.
function completeMonths(firstDay, lastDay) {
  const start = new Date(Math.min(firstDay, lastDay) * 86400000);
  const end = new Date(Math.max(firstDay, lastDay) * 86400000);
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
    + end.getUTCMonth() - start.getUTCMonth();
  const lastMonthDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  const anniversaryDay = Math.min(start.getUTCDate(), lastMonthDay);
  if (end.getUTCDate() < anniversaryDay) months -= 1;
  return Math.max(0, months);
}

export function getAvailableWorkDelayUnits(computed) {
  const units = ['days'];
  if (Number.isFinite(computed?.expectedDay) && Number.isFinite(computed?.actualDay)) {
    const months = completeMonths(computed.expectedDay, computed.actualDay);
    if (months >= 1) units.push('months');
    if (months >= 12) units.push('years');
  }
  return units;
}

export function resolveWorkDelayUnit(computed, timeUnit) {
  return getAvailableWorkDelayUnits(computed).includes(timeUnit) ? timeUnit : 'days';
}

export function getWorkDelayMetric(computed, timeUnit = 'days') {
  const unit = WORK_DELAY_UNITS.find(item => item.id === resolveWorkDelayUnit(computed, timeUnit));
  const months = unit.id === 'days' ? 0 : completeMonths(computed.expectedDay, computed.actualDay);
  const value = unit.id === 'years' ? Math.floor(months / 12) : unit.id === 'months' ? months : computed.metricNumber;
  const name = value === 1 ? unit.singular : unit.plural;
  const remainingMonths = unit.id === 'years' ? months % 12 : 0;
  const duration = remainingMonths ? `${name} E ${remainingMonths} ${remainingMonths === 1 ? 'MÊS' : 'MESES'}` : name;
  return {
    value,
    number: new Intl.NumberFormat('pt-BR').format(value),
    label: computed.isDueToday ? 'PRAZO VENCE HOJE' : `${duration} ${computed.isOverdue ? 'DE ATRASO' : 'PARA O PRAZO'}`,
  };
}
