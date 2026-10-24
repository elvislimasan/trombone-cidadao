import { treePayload } from './arborization.js';
import { neighborhoodFromAddress, registeredNeighborhood, neighborhoodKey } from '../../supabase/functions/_shared/reportNeighborhoods.js';

async function lookupWithTimeout(lookup, point, signal, timeoutMs) {
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

export async function treeBatchPayloads(values, points, cityId, {
  neighborhoods = [], lookup, cache = new Map(), onProgress, signal, timeoutMs = 12000,
}) {
  if (!points.length) throw new Error('Marque pelo menos uma árvore no mapa.');
  // Valida o lote inteiro antes de consultar endereços. Campos compartilhados
  // nunca podem substituir a localização ou o endereço individual dos pins.
  const payloads = points.map(point => treePayload({ ...values,
    latitude: point.latitude, longitude: point.longitude,
    address: '', neighborhood: '', bairro_id: '',
  }, cityId));
  const localNeighborhoods = neighborhoods.filter(item => String(item.city_id) === String(cityId));
  onProgress?.({ completed: 0, total: payloads.length });
  // Consultas sequenciais evitam disparar uma rajada ao geocodificador.
  for (const [index, payload] of payloads.entries()) {
    if (signal?.aborted) throw new Error('Consulta cancelada.');
    const key = `${cityId}:${payload.latitude.toFixed(7)},${payload.longitude.toFixed(7)}`;
    let location = cache.get(key);
    if (!location) {
      try {
        location = await lookupWithTimeout(lookup, { lat: payload.latitude, lng: payload.longitude }, signal, timeoutMs);
        if (!location?.address?.trim() && !location?.suburb?.trim()) throw new Error('Endereço indisponível.');
      } catch {
        if (signal?.aborted) throw new Error('Consulta cancelada.');
        throw new Error(`Não foi possível identificar o endereço do ponto ${index + 1}. Nenhuma árvore foi salva. Tente salvar novamente ou remova esse ponto.`);
      }
      cache.set(key, location);
    }
    if (signal?.aborted) throw new Error('Consulta cancelada.');
    const name = location.suburb?.trim()
      ? registeredNeighborhood(location.suburb, localNeighborhoods)
      : neighborhoodFromAddress(location.address, localNeighborhoods);
    const matches = name ? localNeighborhoods.filter(item => neighborhoodKey(item.name) === neighborhoodKey(name)) : [];
    const neighborhood = matches.length === 1 ? matches[0] : null;
    payload.address = location.address?.trim() || null;
    // O banco exige o ID de um bairro da cidade e normaliza seu nome pelo catálogo.
    payload.bairro_id = neighborhood?.id || null;
    payload.neighborhood = neighborhood?.name || null;
    onProgress?.({ completed: index + 1, total: payloads.length });
  }
  return payloads;
}
