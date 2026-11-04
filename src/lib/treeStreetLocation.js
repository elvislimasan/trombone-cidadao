export function treeStreetAddressName(address) {
  return String(address || '').split(',')[0].split(/\s[-–—]\s/)[0].trim();
}

export function treeStreetSearchKey(value) {
  return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
    .replace(/^(av|avenida)\b/, 'avenida').replace(/^(r|rua)\b/, 'rua')
    .replace(/^(tv|trav|travessa)\b/, 'travessa').replace(/^(pc|praca)\b/, 'praca')
    .replace(/^(rod|rodovia)\b/, 'rodovia');
}

// Não usa aproximação de nomes: só vincula correspondência única da cidade,
// normalizando abreviações de logradouro e os sufixos do endereço completo.
export function findTreeStreet(address, streets, cityId, neighborhoodId) {
  const key = treeStreetSearchKey(treeStreetAddressName(address));
  if (!key) return null;
  let matches = streets.filter(item => String(item.city_id) === String(cityId) && treeStreetSearchKey(item.name) === key);
  if (matches.length > 1 && neighborhoodId) matches = matches.filter(item => String(item.bairro_id) === String(neighborhoodId));
  return matches.length === 1 ? matches[0] : null;
}
