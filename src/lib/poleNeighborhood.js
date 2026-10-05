import { neighborhoodFromAddress, registeredNeighborhood, neighborhoodKey } from '../../supabase/functions/_shared/reportNeighborhoods.js';

const clean = (value) => typeof value === 'string' ? value.trim() : '';
export const neighborhoodFromProperties = (properties) => Object.entries(properties || {})
  .find(([key, value]) => /^(bairro|neighbou?rhood)$/i.test(key) && clean(value))?.[1]?.trim() || null;

export function poleNeighborhood(pole, neighborhoods = []) {
  const properties = pole.raw_properties || {};
  const explicit = neighborhoodFromProperties(properties.municipal)
    || neighborhoodFromProperties(properties) || neighborhoodFromProperties(properties.kmz);
  if (explicit) return registeredNeighborhood(explicit, neighborhoods) || explicit;
  // source_address do KMZ descreve setores antigos e pode divergir da posição;
  // use o endereço atual que já foi corrigido pelo geocodificador ou pela gestão.
  return neighborhoodFromAddress(pole.address, neighborhoods);
}

export function uniqueLinkedPoleNeighborhood(pole, reports, neighborhoods = []) {
  const linked = reports.filter((report) => String(report.pole_id) === String(pole.id)
    && (report.city_id == null || String(report.city_id) === String(pole.city_id))
    && report.status !== 'duplicate'
    && !['rejected', 'pending_approval'].includes(report.moderation_status)
    && clean(report.neighborhood));
  const names = new Map();
  for (const report of linked) {
    const name = registeredNeighborhood(report.neighborhood, neighborhoods) || clean(report.neighborhood);
    names.set(neighborhoodKey(name), name);
  }
  return names.size === 1 ? [...names.values()][0] : null;
}
