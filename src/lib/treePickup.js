export const PICKUP_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const PICKUP_DAY_NAMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export const emptyPickupPeriod = () => ({ days: [], from: '', to: '' });
const ADDRESS_LABEL = 'Endereço de retirada: ';
const HOURS_LABEL = 'Dias e horários: ';
const NOTES_LABEL = 'Orientações adicionais: ';
const usedPeriods = schedule => schedule.filter(period => period.days.length || period.from || period.to);

// Mesmo critério do mapa de iluminação: um ponto cadastrado na cidade,
// sem depender de geocodificação pelo nome para abrir o mapa.
export async function loadPickupMapCenter(client, cityId) {
  if (cityId == null) return null;
  for (const table of ['city_trees', 'poles']) {
    try {
      const { data, error } = await client.from(table).select('latitude,longitude').eq('city_id', cityId)
        .not('latitude', 'is', null).not('longitude', 'is', null).limit(1).maybeSingle();
      if (error || data?.latitude == null || data?.longitude == null) continue;
      const lat = Number(data.latitude), lng = Number(data.longitude);
      if (Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180) return { lat, lng };
    } catch { /* Sem ponto acessível, o mapa mantém sua centralização alternativa. */ }
  }
  return null;
}

export function pickupDetails(row) {
  if (row?.pickup_details) return { address: '', latitude: null, longitude: null, schedule: [], notes: '', legacy_hours: '', ...row.pickup_details };
  const lines = (row?.instructions || '').split(/\r?\n/);
  const address = lines[0]?.startsWith(ADDRESS_LABEL) ? lines.shift().slice(ADDRESS_LABEL.length) : '';
  const legacy_hours = lines[0]?.startsWith(HOURS_LABEL) ? lines.shift().slice(HOURS_LABEL.length) : '';
  if (lines[0]?.startsWith(NOTES_LABEL)) lines[0] = lines[0].slice(NOTES_LABEL.length);
  return { address, latitude: null, longitude: null, schedule: [], notes: lines.join('\n'), legacy_hours };
}

export function validatePickup(details) {
  if (details.address.length > 300 || details.notes.length > 1000) return 'Use até 300 caracteres no endereço e 1.000 nas orientações.';
  if ((details.latitude == null) !== (details.longitude == null)
    || (details.latitude != null && (!Number.isFinite(details.latitude) || Math.abs(details.latitude) > 90 || !Number.isFinite(details.longitude) || Math.abs(details.longitude) > 180))) return 'Marque um ponto válido no mapa.';
  const periods = usedPeriods(details.schedule);
  if (periods.length > 14) return 'Cadastre no máximo 14 períodos de atendimento.';
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  for (const [index, period] of periods.entries()) {
    if (!period.days.length || period.days.some(day => !Number.isInteger(day) || day < 0 || day > 6) || !time.test(period.from) || !time.test(period.to)) return `Selecione os dias e os dois horários do período ${index + 1}.`;
    if (period.from >= period.to) return `O horário final do período ${index + 1} deve ser posterior ao inicial.`;
    if (periods.slice(0, index).some(other => period.days.some(day => other.days.includes(day)) && period.from < other.to && period.to > other.from)) return 'Existem períodos sobrepostos no mesmo dia da semana. Confira os horários.';
  }
  return '';
}

export function pickupPayload(details) {
  const schedule = usedPeriods(details.schedule).map(period => ({ ...period, days: [...new Set(period.days)].sort((a, b) => a - b) }));
  return { address: details.address.trim(), latitude: details.latitude, longitude: details.longitude, schedule, notes: details.notes.trim(), legacy_hours: schedule.length ? '' : details.legacy_hours || '' };
}

export function pickupInstructions(details) {
  const value = pickupPayload(details);
  if (!value.address && !value.schedule.length && value.latitude == null && !value.legacy_hours) return value.notes;
  return [value.address && ADDRESS_LABEL + value.address, ...value.schedule.map(period => `${HOURS_LABEL}${period.days.map(day => PICKUP_DAYS[day]).join(', ')} · ${period.from} às ${period.to}`), value.legacy_hours && HOURS_LABEL + value.legacy_hours, value.latitude != null && `Localização: https://www.google.com/maps/search/?api=1&query=${value.latitude},${value.longitude}`, value.notes && NOTES_LABEL + value.notes].filter(Boolean).join('\n');
}
