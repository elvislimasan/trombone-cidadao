import { polePosition } from './poleAddress.js';
import { haversineDistanceKm } from './geoUtils.js';
import { poleNeighborhood } from './poleNeighborhood.js';
import { resolveRegisteredNeighborhood } from '../../supabase/functions/_shared/reportNeighborhoods.js';

// Cidade e coordenadas devem vir do mesmo cadastro. A cidade do usuário, do
// formulário ou de uma lista antiga não confirma a localização deste poste.
export async function resolveReportSubmissionLocation({ client, formData, resolveCityIdFromLocation, getResolvedNeighborhood }) {
  let location = formData.location;
  if (formData.category === 'iluminacao' && formData.pole_id) {
    const { data: pole, error } = await client.from('poles')
      .select('latitude,longitude,city_id,address,raw_properties')
      .eq('id', formData.pole_id).maybeSingle();
    if (error) throw error;
    location = pole && polePosition(pole);
    if (!location) throw new Error('Não foi possível confirmar a localização do poste selecionado.');
    const cityId = Number(pole.city_id);
    if (Number.isSafeInteger(cityId) && cityId > 0) {
      let neighborhood = null;
      try {
        const { data, error: neighborhoodError } = await client.from('bairros').select('name').eq('city_id', cityId);
        if (!neighborhoodError && data) {
          neighborhood = resolveRegisteredNeighborhood({
            neighborhood: poleNeighborhood(pole, data), address: formData.address || pole.address,
          }, data);
        }
      } catch { /* Bairro é opcional; sua consulta não pode impedir o envio. */ }
      return { location, city_id: cityId, neighborhood };
    }
  }
  const cityId = await resolveCityIdFromLocation(location);
  return { location, city_id: cityId, neighborhood: cityId == null ? null : getResolvedNeighborhood() };
}

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
