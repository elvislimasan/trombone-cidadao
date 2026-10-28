import { BRAZIL_STATE_NAMES as STATE_NAMES, normalizeStateUf as normalizeUf } from './cityLocation.js';

// A versão anterior podia guardar uma cidade homônima de outra UF.
const memCache = new Map();
const pending = new Map();
const LS_PREFIX = 'tc_citygeo_v2_';
const normalize = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
const municipalityKey = value => normalize(value).replace(/^municipio de\s+/, '');
const validPoint = point => point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180;

export function matchingCityPoint(result, name, requestedUf) {
  const address = result?.address || {};
  const uf = normalizeUf(address['ISO3166-2-lvl4'] || address.state_code || address.state);
  // No Brasil, `municipality` pode conter a região geográfica do IBGE.
  // O nome da cidade vem antes dessa divisão regional.
  const municipality = address.city || address.town || address.village || address.county || address.municipality || result?.name;
  if (address.country_code?.toLowerCase() !== 'br' || !uf || (requestedUf && uf !== normalizeUf(requestedUf))
    || municipalityKey(municipality) !== municipalityKey(name)) return null;
  if (result.lat == null || result.lon == null || !String(result.lat).trim() || !String(result.lon).trim()) return null;
  const point = { lat: Number(result.lat), lng: Number(result.lon) };
  return validPoint(point) ? { ...point, city: municipalityKey(name), uf } : null;
}

/** Retorna o centro do município conferido por nome + UF, ou null. */
export async function geocodeCity(name, uf) {
  if (!name) return null;
  const stateUf = normalizeUf(uf);
  if (uf && !stateUf) return null;
  const key = `${municipalityKey(name)}|${stateUf}`;
  // Centro já utilizado nos mapas do projeto, independente de rede/cache legado.
  if (key === 'floresta|PE') return { lat: -8.597031, lng: -38.574217 };
  if (memCache.has(key)) return memCache.get(key);
  try {
    const stored = JSON.parse(localStorage.getItem(LS_PREFIX + key) || 'null');
    if (validPoint(stored) && stored.city === municipalityKey(name) && stored.uf && (!stateUf || stored.uf === stateUf)) {
      const point = { lat: stored.lat, lng: stored.lng };
      memCache.set(key, point); return point;
    }
  } catch { /* Cache opcional. */ }
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      for (const [field, value] of Object.entries({ format: 'jsonv2', country: 'Brasil', countrycodes: 'br', city: name,
        addressdetails: '1', limit: '8', 'accept-language': 'pt-BR', ...(stateUf ? { state: STATE_NAMES[stateUf] } : {}) })) url.searchParams.set(field, value);
      const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!response.ok) return null;
      const data = await response.json();
      const candidates = (Array.isArray(data) ? data : []).map(result => matchingCityPoint(result, name, stateUf)).filter(Boolean);
      if (!candidates.length || (!stateUf && new Set(candidates.map(item => item.uf)).size > 1)) return null;
      const selected = candidates[0], point = { lat: selected.lat, lng: selected.lng };
      memCache.set(key, point);
      try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(selected)); } catch { /* Cache opcional. */ }
      return point;
    } catch { return null; }
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
