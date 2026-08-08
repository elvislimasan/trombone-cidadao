// Forward geocode de cidade (nome + UF → coordenadas) via Nominatim.
// Usado para centralizar mapas na cidade selecionada quando não há marcadores
// próprios (ex.: cidade sem obras cadastradas ainda). Resultado é cacheado em
// memória e em localStorage para evitar chamadas repetidas ao Nominatim.

const memCache = new Map();
const LS_PREFIX = 'tc_citygeo_';

const keyFor = (name, uf) => `${(name || '').trim().toLowerCase()}|${(uf || '').trim().toLowerCase()}`;

const readLs = (key) => {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng)) return v;
  } catch {}
  return null;
};

const writeLs = (key, val) => {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch {}
};

/**
 * Retorna { lat, lng } da cidade ou null.
 * @param {string} name nome da cidade
 * @param {string} uf   sigla do estado (opcional, melhora a precisão)
 */
export async function geocodeCity(name, uf) {
  if (!name) return null;
  const key = keyFor(name, uf);
  if (memCache.has(key)) return memCache.get(key);
  const cached = readLs(key);
  if (cached) { memCache.set(key, cached); return cached; }

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('country', 'Brasil');
    url.searchParams.set('city', name);
    if (uf) url.searchParams.set('state', uf);
    url.searchParams.set('limit', '1');
    url.searchParams.set('accept-language', 'pt-BR');

    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const first = Array.isArray(data) && data[0];
    if (!first) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const val = { lat, lng };
    memCache.set(key, val);
    writeLs(key, val);
    return val;
  } catch {
    return null;
  }
}
