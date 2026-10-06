import { polePosition } from './poleAddress.js';
import { haversineDistanceKm } from './geoUtils.js';

export async function createReportPole({ client, cityId, location, identifier, address }) {
  if (!cityId || !Number.isFinite(Number(cityId)) || Number(cityId) <= 0) {
    throw new Error('Não foi possível identificar a cidade do poste. Confira a localização e tente novamente.');
  }
  const { data, error } = await client.rpc('create_pending_pole', {
    p_lat: location.lat,
    p_lng: location.lng,
    p_identifier: identifier,
    p_address: address || null,
    p_plate: null,
    p_city_id: Number(cityId),
  });
  if (error) throw error;
  const pole = Array.isArray(data) ? data[0] : data;
  if (!pole?.pole_id) throw new Error('Não foi possível obter o ID do poste criado.');
  if (pole.validation_status !== 'approved') {
    throw new Error('O cadastro de postes precisa ser atualizado no banco para aparecer no mapa.');
  }
  const position = polePosition(pole);
  if (!position) throw new Error('O poste cadastrado retornou uma localização inválida.');
  return { ...pole, latitude: position.lat, longitude: position.lng, is_broken: !!pole.is_broken, distance_m: 0 };
}

// Mantém o poste recém-cadastrado visível enquanto a consulta remota atualiza.
export function mergeNearbyReportPoles(remote, local, location) {
  const seen = new Set();
  const nearbyLocal = local.flatMap((pole) => {
    const position = polePosition(pole);
    if (!position || !location) return [];
    const distanceKm = haversineDistanceKm(position, location);
    if (distanceKm == null) return [];
    const distance = distanceKm * 1000;
    return distance <= 80 ? [{ ...pole, distance_m: Math.round(distance) }] : [];
  });
  return [...nearbyLocal, ...(remote || [])].filter((pole) => {
    const key = String(pole?.pole_id ?? '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
