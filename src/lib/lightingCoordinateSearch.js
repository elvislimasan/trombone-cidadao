import { polePosition } from './poleAddress.js';
import { haversineDistanceKm } from './geoUtils.js';

const POLE_FIELDS = 'id,city_id,identifier,plate,address,latitude,longitude,lamp_type,lamp_power_w,lighting_status,is_broken,updated_at,raw_properties';

export function parseLightingCoordinates(value) {
  const text = String(value ?? '').trim().replace(/−/g, '-').replace(/^\((.*)\)$/s, '$1').trim();
  const dot = '[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
  const local = '[+-]?(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)';
  const match = text.match(new RegExp(`^(${dot})\\s*(?:[,;]|\\s)\\s*(${dot})$`))
    || text.match(new RegExp(`^(${local})\\s*(?:;|,\\s+|\\s)\\s*(${local})$`));
  return match ? polePosition({ latitude: match[1].replace(',', '.'), longitude: match[2].replace(',', '.') }) : null;
}

export function filterLightingPoles(request, filters) {
  if (!filters.removed && filters.status !== 'removido') request = request.neq('lighting_status', 'removido');
  if (filters.status === 'apagado') request = request.neq('lighting_status', 'removido').or('lighting_status.eq.apagado,lighting_status.eq.manutencao,is_broken.eq.true');
  else if (filters.status === 'aceso') request = request.or('lighting_status.eq.aceso,lighting_status.eq.nao_informado').or('is_broken.eq.false,is_broken.is.null');
  else if (filters.status !== 'all') request = request.eq('lighting_status', filters.status);
  return request;
}

export function lightingCoordinateBounds(point, radius) {
  const position = polePosition({ latitude: point?.lat, longitude: point?.lng });
  if (!position || !Number.isFinite(radius) || radius <= 0 || radius > 500) throw new Error('Informe coordenadas válidas e um raio de até 500 m.');
  const angle = radius / 6371000;
  const latitudeDelta = angle * 180 / Math.PI;
  const south = Math.max(-90, position.lat - latitudeDelta);
  const north = Math.min(90, position.lat + latitudeDelta);
  if (south === -90 || north === 90) return { south, north, west: -180, east: 180 };
  const longitudeDelta = Math.asin(Math.min(1, Math.sin(angle) / Math.cos(position.lat * Math.PI / 180))) * 180 / Math.PI;
  const wrap = (longitude) => ((longitude + 180) % 360 + 360) % 360 - 180;
  return { south, north, west: wrap(position.lng - longitudeDelta), east: wrap(position.lng + longitudeDelta) };
}

export async function loadLightingPolesNearCoordinates(client, { cityId, point, radius = 100, filters = { status: 'all', removed: false }, signal }) {
  if (!Number.isSafeInteger(Number(cityId)) || Number(cityId) <= 0) throw new Error('Escolha uma prefeitura antes de pesquisar.');
  const bounds = lightingCoordinateBounds(point, radius);
  const matches = [];
  // Read every page of the bounding box before sorting by exact distance.
  for (let from = 0; ; from += 500) {
    if (signal?.aborted) throw new DOMException('Busca cancelada.', 'AbortError');
    let request = client.from('poles').select(POLE_FIELDS).eq('city_id', Number(cityId))
      .gte('latitude', bounds.south).lte('latitude', bounds.north);
    request = bounds.west <= bounds.east
      ? request.gte('longitude', bounds.west).lte('longitude', bounds.east)
      : request.or(`longitude.gte.${bounds.west},longitude.lte.${bounds.east}`);
    request = filterLightingPoles(request, filters).order('id').range(from, from + 499);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    for (const pole of data || []) {
      const position = polePosition(pole);
      if (!position) continue;
      const distance = haversineDistanceKm(point, position) * 1000;
      if (distance <= radius) matches.push({ ...pole, latitude: position.lat, longitude: position.lng, distance_m: distance });
    }
    if ((data || []).length < 500) break;
  }
  matches.sort((a, b) => a.distance_m - b.distance_m || Number(a.id) - Number(b.id));
  return { data: matches.slice(0, 20), count: matches.length };
}
