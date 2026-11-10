export const PIPA_PATH = '/prefeitura/operacao-pipa';
export const PIPA_DRIVER_PATH = '/operacao-pipa/pipeiro';
export const PIPA_PROVIDERS = { prefeitura: 'Prefeitura', exercito: 'Exército Brasileiro' };
export const PIPA_KINDS = { regular: 'Rotina', urgent: 'Urgente · caixa seca', one_off: 'Carrada avulsa' };
export const PIPA_STATUSES = { pending: 'Pendente', assigned: 'Direcionada', in_transit: 'Em rota', completed: 'Atendida', cancelled: 'Cancelada' };
export const pipaNumber = value => Number(value || 0).toLocaleString('pt-BR');
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' });
export const pipaDay = (date = new Date()) => dayFormatter.format(new Date(date));
export const pipaMonth = date => pipaDay(date).slice(0, 7) + '-01';
export const pipaDateTime = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'short' }) : '—';
export function pipaPeriod(preset, now = new Date()) {
  const today = pipaDay(now), [year, month] = today.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1, 12));
  if (preset === 'previous') return { from: pipaMonth(previous), to: pipaDay(new Date(Date.UTC(year, month - 1, 0, 12))) };
  if (preset === 'year') return { from: `${year}-01-01`, to: today };
  if (preset === 'last12') return { from: pipaDay(new Date(Date.UTC(year - 1, month - 1, Number(today.slice(-2)), 12))), to: today };
  return { from: `${today.slice(0, 7)}-01`, to: today };
}
export function pipaCalendarMonth(value) {
  const [year, month] = value.split('-').map(Number);
  return { from: value + '-01', to: pipaDay(new Date(Date.UTC(year, month, 0, 12))) };
}
export function pipaMaskCpf(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, '$1-$2');
}
export function pipaPhoneDigits(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('55') && [12, 13].includes(digits.length) ? digits.slice(2) : digits;
}
export function pipaValidPhone(value) {
  const digits = pipaPhoneDigits(value);
  return /^[1-9]{2}\d{8,9}$/.test(digits) && !/^(\d)\1+$/.test(digits);
}
export function pipaValidCpf(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  for (let length = 9; length <= 10; length++) {
    const sum = [...digits.slice(0, length)].reduce((total, digit, i) => total + Number(digit) * (length + 1 - i), 0);
    if (((sum * 10) % 11) % 10 !== Number(digits[length])) return false;
  }
  return true;
}
export function pipaCoordinates(latitude, longitude) {
  return latitude !== '' && longitude !== '' && latitude != null && longitude != null
    && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
    && Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180;
}
export async function pipaFreshPosition(position, geolocation, now = Date.now()) {
  const age = now - Number(position?.timestamp);
  // O acompanhamento já fornece amostras recentes. Evita reiniciar o sensor
  // ao confirmar a descarga; uma amostra antiga exige uma nova leitura.
  if (position && Number.isFinite(age) && age >= 0 && age <= 5000) {
    return { coords: { latitude: position.lat, longitude: position.lng, accuracy: position.accuracy }, timestamp: position.timestamp };
  }
  if (!geolocation) throw new Error('GPS indisponível neste aparelho.');
  return new Promise((resolve, reject) => geolocation.getCurrentPosition(resolve,
    () => reject(new Error('Não foi possível obter uma localização atual. Permita o GPS ou solicite um lançamento manual à secretaria.')),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }));
}
export function pipaCapabilities(workspace, channels = workspace.waterChannels || []) {
  const allowed = channels.filter(c => !workspace.activeChannelId || c.id === workspace.activeChannelId);
  return { channels: allowed, canRead: allowed.length > 0, canManage: allowed.some(c => c.manage), canRequest: allowed.some(c => c.request) };
}
export function pipaStatistics(data, filters, now = new Date()) {
  const { deliveries = [], tanks = [], drivers = [], requests = [], quotas = [] } = data;
  const period = deliveries.filter(d => {
    const day = pipaDay(d.delivered_at);
    return day >= filters.from && day <= filters.to
      && (!filters.provider || d.provider === filters.provider)
      && (!filters.driver || d.driver_id === filters.driver)
      && (!filters.locality || d.locality === filters.locality);
  });
  const previous = pipaPeriod('previous', now), last12 = pipaPeriod('last12', now);
  const deliveredLastMonth = new Set(deliveries.filter(d => d.provider === 'prefeitura' && d.tank_id && pipaDay(d.delivered_at) >= previous.from && pipaDay(d.delivered_at) <= previous.to).map(d => d.tank_id)).size;
  const annualLoads = deliveries.filter(d => pipaDay(d.delivered_at) >= last12.from && pipaDay(d.delivered_at) <= last12.to).reduce((n, d) => n + d.loads, 0);
  const group = key => {
    const result = new Map();
    period.forEach(d => {
      const id = key(d);
      const row = result.get(id) || { id, loads: 0, liters: 0, tankIds: new Set(), localities: new Set(), prefeitura: 0, exercito: 0 };
      row.loads += d.loads; row.liters += d.liters; row[d.provider] += d.loads;
      if (d.tank_id) row.tankIds.add(d.tank_id);
      row.localities.add(d.locality); result.set(id, row);
    });
    return [...result.values()].map(r => ({ ...r, tanks: r.tankIds.size, localities: [...r.localities].sort(), tankIds: undefined }));
  };
  const month = filters.from.slice(0, 7) + '-01';
  const driverGroups = new Map(group(d => d.driver_id).map(row => [row.id, row]));
  const monthlyLoads = new Map();
  deliveries.filter(d => pipaDay(d.delivered_at).slice(0, 7) === month.slice(0, 7)).forEach(d => monthlyLoads.set(d.driver_id, (monthlyLoads.get(d.driver_id) || 0) + d.loads));
  return {
    period, loads: period.reduce((n, d) => n + d.loads, 0), liters: period.reduce((n, d) => n + d.liters, 0),
    tanksServed: new Set(period.filter(d => d.tank_id).map(d => d.tank_id)).size,
    prefeituraTanks: tanks.filter(t => t.active && t.provider === 'prefeitura').length,
    exercitoTanks: tanks.filter(t => t.active && t.provider === 'exercito').length,
    deliveredLastMonth, annualLoads,
    urgent: requests.filter(r => r.kind === 'urgent' && !['completed', 'cancelled'].includes(r.status)).length,
    byLocality: group(d => d.locality).sort((a, b) => b.loads - a.loads),
    byMonth: group(d => pipaDay(d.delivered_at).slice(0, 7)).sort((a, b) => a.id.localeCompare(b.id)),
    byDriver: drivers.map(d => ({ ...d, ...(driverGroups.get(d.id) || { loads: 0, liters: 0, tanks: 0, localities: [] }),
      name: d.name, quota: quotas.find(q => q.driver_id === d.id && q.month === month)?.loads ?? null,
      monthLoads: monthlyLoads.get(d.id) || 0,
    })).sort((a, b) => b.loads - a.loads),
  };
}
