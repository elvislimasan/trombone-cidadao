import { adoptionItems, ADOPTION_PROVIDERS } from './treeAdoption.js';
import { cityStateUf } from './cityLocation.js';
import { pickupDetails } from './treePickup.js';

const coordinate = (value, limit) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;

export function pickupDirectionsUrl(details, city) {
  const address = typeof details?.address === 'string' ? details.address.trim() : '';
  let destination;
  if (coordinate(details?.latitude, 90) && coordinate(details?.longitude, 180)) destination = `${Number(details.latitude)},${Number(details.longitude)}`;
  else if (address) {
    const context = city?.name && !address.toLocaleLowerCase('pt-BR').includes(city.name.toLocaleLowerCase('pt-BR')) ? [city.name, cityStateUf(city)] : [];
    destination = [address, ...context].filter(Boolean).join(', ');
  }
  if (!destination) return null;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination })}`;
}

export function adoptionPickupLocations(request, catalog = {}, city) {
  if (request?.status !== 'pronta_retirada' || request.request_type !== 'muda' || catalog.error) return [];
  const items = adoptionItems(request);
  // A single-item approval can change both species and provider. Multiple-item
  // approvals preserve each item's own provider in the existing database flow.
  const targets = items.length > 1 ? items : [{ species_id: request.approved_species_id || items[0]?.species_id || request.species_id, provider: request.confirmed_provider || items[0]?.provider || request.provider }];
  const sameCity = row => row?.city_id == null || request.city_id == null || String(row.city_id) === String(request.city_id);
  const context = city && (city.id == null || request.city_id == null || String(city.id) === String(request.city_id)) ? city : undefined;
  const locations = new Map();
  for (const target of targets) {
    if (!target.provider) continue;
    const nursery = catalog.nurseries?.find(row => row.provider === target.provider && sameCity(row));
    const availability = catalog.availability?.find(row => row.species_id === target.species_id && row.provider === target.provider && sameCity(row.species) && (!row.nursery || (sameCity(row.nursery) && row.nursery.provider === target.provider)));
    // When a nursery exists, its current location wins even if it was removed;
    // old availability must not send someone to an outdated pickup address.
    const source = nursery || availability;
    const details = pickupDetails(source);
    const href = pickupDirectionsUrl(details, context);
    const label = nursery?.name || availability?.nursery?.name || ADOPTION_PROVIDERS[target.provider] || 'Local de retirada';
    const key = `${target.provider}:${href || details.address || ''}`;
    if (!locations.has(key)) locations.set(key, { key, label, address: details.address || '', href });
  }
  return [...locations.values()];
}
