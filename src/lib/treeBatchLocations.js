import { treePayload } from './arborization.js';
import { findTreeStreet } from './treeStreetLocation.js';
import { neighborhoodFromAddress, registeredNeighborhood, neighborhoodKey } from '../../supabase/functions/_shared/reportNeighborhoods.js';

export const treeBatchPointKey = (point, cityId) => `${cityId}:${Number(point.latitude).toFixed(7)},${Number(point.longitude).toFixed(7)}`;

export async function lookupTreeBatchLocation(lookup, point, signal, timeoutMs = 12000) {
  let timer;
  let onAbort;
  try {
    return await Promise.race([
      Promise.resolve().then(() => lookup(point)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Tempo de consulta excedido.')), timeoutMs);
        onAbort = () => reject(new Error('Consulta cancelada.'));
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// O mesmo endereço preenche a prévia e o payload. Só associa IDs únicos da cidade.
export function applyTreeBatchAddress(point, location, cityId, { neighborhoods = [], streets = [] }) {
  const localNeighborhoods = neighborhoods.filter(item => String(item.city_id) === String(cityId));
  const address = location?.address?.trim() || '';
  const name = location?.suburb?.trim()
    ? registeredNeighborhood(location.suburb, localNeighborhoods)
    : neighborhoodFromAddress(address, localNeighborhoods);
  const matches = name ? localNeighborhoods.filter(item => neighborhoodKey(item.name) === neighborhoodKey(name)) : [];
  const neighborhood = matches.length === 1 ? matches[0] : null;
  const street = findTreeStreet(address, streets, cityId, neighborhood?.id);
  return { ...point, address, street_id: street?.id || '', street_name: street?.name || '',
    bairro_id: neighborhood?.id || '', neighborhood: neighborhood?.name || location?.suburb?.trim() || '',
    ...(point.manualStreet ? { street_id: point.street_id || '', street_name: point.street_name || '' } : {}),
    ...(point.manualAddress ? { address: point.address || '' } : {}),
    ...(point.manualNeighborhood ? { bairro_id: point.bairro_id || '', neighborhood: point.neighborhood || '' } : {}),
  };
}

export async function treeBatchPayloads(values, points, cityId, {
  neighborhoods = [], streets = [], lookup, cache = new Map(), onProgress, signal, timeoutMs = 12000,
}) {
  if (!points.length) throw new Error('Marque pelo menos uma árvore no mapa.');
  // Valida o lote inteiro antes de consultar endereços. Campos compartilhados
  // nunca podem substituir a localização ou o endereço individual dos pins.
  const payloads = points.map(point => treePayload({ ...values,
    latitude: point.latitude, longitude: point.longitude,
    address: '', neighborhood: '', bairro_id: '', street_id: '', street_name: '',
  }, cityId));
  const localNeighborhoods = neighborhoods.filter(item => String(item.city_id) === String(cityId));
  onProgress?.({ completed: 0, total: payloads.length });
  // Consultas sequenciais evitam disparar uma rajada ao geocodificador.
  for (const [index, payload] of payloads.entries()) {
    if (signal?.aborted) throw new Error('Consulta cancelada.');
    const point = points[index];
    const manualStreet = streets.find(street => street.id === point.street_id && String(street.city_id) === String(cityId));
    const manualNeighborhood = localNeighborhoods.find(item => item.id === point.bairro_id);
    const key = treeBatchPointKey(payload, cityId);
    let location = cache.get(key);
    if (!location && !manualStreet && !(point.manualAddress && point.address?.trim())) {
      try {
        location = await lookupTreeBatchLocation(lookup, { lat: payload.latitude, lng: payload.longitude }, signal, timeoutMs);
        if (!location?.address?.trim() && !location?.suburb?.trim()) throw new Error('Endereço indisponível.');
      } catch {
        if (signal?.aborted) throw new Error('Consulta cancelada.');
        throw new Error(`Não foi possível identificar o endereço do ponto ${index + 1}. Nenhuma árvore foi salva. Volte à localização para corrigir o endereço ou tente novamente.`);
      }
      cache.set(key, location);
    }
    if (signal?.aborted) throw new Error('Consulta cancelada.');
    location ||= {};
    const legacyManual = point.addressStatus === undefined;
    const resolved = applyTreeBatchAddress({ ...point,
      ...(legacyManual && manualStreet ? { manualStreet: true, manualAddress: true, address: manualStreet.name, street_name: manualStreet.name } : {}),
      ...(legacyManual && manualNeighborhood ? { manualNeighborhood: true, neighborhood: manualNeighborhood.name } : {}),
    }, location, cityId, { neighborhoods, streets });
    const street = streets.find(item => item.id === resolved.street_id && String(item.city_id) === String(cityId));
    const neighborhood = localNeighborhoods.find(item => item.id === resolved.bairro_id);
    payload.address = resolved.address?.trim() || null;
    payload.street_id = street?.id || null;
    payload.street_name = street?.name || null;
    // O banco exige o ID de um bairro da cidade e normaliza seu nome pelo catálogo.
    payload.bairro_id = neighborhood?.id || null;
    payload.neighborhood = neighborhood?.name || null;
    onProgress?.({ completed: index + 1, total: payloads.length });
  }
  return payloads;
}
