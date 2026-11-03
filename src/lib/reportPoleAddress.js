import { reverseGeocodePin } from './reverseGeocodePin.js';

// A lista de postes pode ter sido carregada antes do backfill. Consultar o
// endereço atual antes das alternativas evita depender dessa lista antiga.
export async function resolveReportPoleAddress(client, poleId, location, { lookup = reverseGeocodePin } = {}) {
  const { lat, lng } = location || {};
  if (!poleId || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let cityId = null;
  try {
    const { data, error } = await client.from('poles').select('address,city_id')
      .eq('id', poleId).eq('latitude', lat).eq('longitude', lng).maybeSingle();
    if (!error && Number.isSafeInteger(Number(data?.city_id)) && Number(data?.city_id) > 0) cityId = data.city_id;
    if (!error && typeof data?.address === 'string' && data.address.trim()) {
      return { address: data.address.trim(), city_id: data.city_id };
    }
  } catch { /* Uma falha de leitura não impede consultar as outras fontes. */ }

  try {
    const { data, error } = await client.rpc('mapped_street_address_for_pole', { p_pole_id: poleId }).maybeSingle();
    if (!error && typeof data?.address === 'string' && data.address.trim()) {
      return { address: data.address.trim(), ...(cityId != null ? { city_id: cityId } : {}) };
    }
  } catch { /* A rua mapeada é uma sugestão opcional. */ }

  try {
    const result = await lookup({ lat, lng }, { invoke: client.functions.invoke.bind(client.functions) });
    return cityId != null ? { ...result, city_id: cityId } : result;
  } catch {
    return cityId != null ? { city_id: cityId } : null;
  }
}
