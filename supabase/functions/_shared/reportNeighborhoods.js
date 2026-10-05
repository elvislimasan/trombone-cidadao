// Só associa nomes inequívocos a bairros cadastrados no município consultado.
export const neighborhoodKey = (value) => String(value || '').trim().normalize('NFD')
  .replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
  .replace(/[^a-z0-9]+/g, ' ').trim();

export function registeredNeighborhood(value, neighborhoods) {
  const key = neighborhoodKey(value);
  if (!key) return null;
  const names = [...new Set(neighborhoods
    .filter((item) => neighborhoodKey(item.name) === key
      || (key === 'dner' && neighborhoodKey(item.name) === 'sao francisco de assis dner'))
    .map((item) => item.name.trim()))];
  return names.length === 1 ? names[0] : null;
}

export function neighborhoodFromAddress(address, neighborhoods) {
  const normalized = neighborhoodKey(address);
  const explicit = [];
  for (const item of neighborhoods) {
    const key = neighborhoodKey(item.name);
    if (!key) continue;
    const aliases = key === 'sao francisco de assis dner' ? [key, 'dner'] : [key];
    for (const alias of aliases) {
      if (new RegExp(`(?:^| )bairro ${alias}(?=$| )`).test(normalized)
        || (alias === 'dner' && /(?:^| )(?:no|na|do|da) dner(?=$| )/.test(normalized))) {
        explicit.push(item.name.trim());
      }
    }
  }
  // Compare segmentos completos: "Rua do Centro" não significa bairro Centro.
  const segments = String(address || '').split(/\s+[-–—]\s+|[,;]/u).slice(1)
    .map((value) => value.replace(/^\s*bairro\s*:?\s+/iu, ''));
  const names = [...new Set([...explicit, ...segments.map((value) => registeredNeighborhood(value, neighborhoods)).filter(Boolean)])];
  return names.length === 1 ? names[0] : null;
}

export function resolveRegisteredNeighborhood({ neighborhood, address }, neighborhoods) {
  // Bairro composto/desconhecido vindo da geo exige revisão; não escolha um
  // dos bairros arbitrariamente a partir de outro fragmento do endereço.
  if (String(neighborhood || '').trim()) return registeredNeighborhood(neighborhood, neighborhoods) || neighborhood.trim();
  return neighborhoodFromAddress(address, neighborhoods);
}
