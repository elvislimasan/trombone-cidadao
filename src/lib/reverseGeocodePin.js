// O mesmo resultado atende ao campo de endereço e à resolução da cidade.
// A função do projeto é a fonte principal; a consulta direta cobre falhas de
// deploy/rede da função sem deixar o formulário preso em uma resposta vazia.
const pending = new Map();
const cache = new Map();

const STATE_UF = {
  Acre: 'AC', Alagoas: 'AL', Amapá: 'AP', Amazonas: 'AM', Bahia: 'BA', Ceará: 'CE',
  'Distrito Federal': 'DF', 'Espírito Santo': 'ES', Goiás: 'GO', Maranhão: 'MA',
  'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS', 'Minas Gerais': 'MG', Pará: 'PA',
  Paraíba: 'PB', Paraná: 'PR', Pernambuco: 'PE', Piauí: 'PI', 'Rio de Janeiro': 'RJ',
  'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', Rondônia: 'RO', Roraima: 'RR',
  'Santa Catarina': 'SC', 'São Paulo': 'SP', Sergipe: 'SE', Tocantins: 'TO',
};

export function normalizeReverseGeocode(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const details = payload.raw?.address || payload.address || {};
  const fields = typeof details === 'object' && details !== null ? details : {};
  const detailedCity = String(fields.city || '').trim();
  const county = String(fields.county || '').trim();
  const city = String(payload.city || (
    detailedCity && county && detailedCity !== county ? county :
      detailedCity || fields.town || fields.village || county || fields.municipality || ''
  )).trim();
  const iso = String(fields['ISO3166-2-lvl4'] || '').trim();
  const state_uf = String(payload.state_uf || (iso.startsWith('BR-') ? iso.slice(3) : STATE_UF[fields.state] || '')).trim();
  const suburb = String(payload.suburb || fields.suburb || fields.neighbourhood || fields.quarter || '').trim();
  const road = String(fields.road || fields.pedestrian || fields.footway || '').trim();
  const number = String(fields.house_number || '').trim();
  const address = typeof payload.address === 'string'
    ? payload.address.trim()
    : [[road, number].filter(Boolean).join(', '), suburb, city, fields.state]
      .filter(Boolean).join(' - ') || String(payload.display_name || '').trim();
  return { address: address || null, city: city || null, state_uf: state_uf || null, suburb: suburb || null };
}

export async function reverseGeocodePin(location, { invoke, fetcher = fetch, zoom = 18 } = {}) {
  if (location?.lat == null || location?.lng == null) return null;
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const key = `${lat.toFixed(5)},${lng.toFixed(5)},${zoom}`;
  if (cache.has(key)) return cache.get(key);
  if (pending.has(key)) return pending.get(key);

  const task = (async () => {
    let result = null;
    try {
      const { data, error } = await invoke('reverse-geocode', { body: { lat, lng, zoom } });
      if (!error) result = normalizeReverseGeocode(data);
    } catch { /* A consulta direta abaixo ainda pode funcionar. */ }

    if (!result?.address || !result?.city || !result?.state_uf) {
      try {
        const url = new URL('https://nominatim.openstreetmap.org/reverse');
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('lat', String(lat));
        url.searchParams.set('lon', String(lng));
        url.searchParams.set('zoom', String(zoom));
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('accept-language', 'pt-BR');
        const response = await fetcher(url.toString(), { headers: { Accept: 'application/json' } });
        if (response.ok) {
          const direct = normalizeReverseGeocode(await response.json());
          result = {
            address: result?.address || direct?.address || null,
            city: result?.city || direct?.city || null,
            state_uf: result?.state_uf || direct?.state_uf || null,
            suburb: result?.suburb || direct?.suburb || null,
          };
        }
      } catch { /* O endereço pode ser informado manualmente. */ }
    }

    if (result?.address && result?.city && result?.state_uf) cache.set(key, result);
    return result;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}
