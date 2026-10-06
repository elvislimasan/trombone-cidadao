import { reverseGeocodePin } from './reverseGeocodePin.js';

// A lista de postes pode ter sido carregada antes do backfill. Consultar o
// endereço atual antes das alternativas evita depender dessa lista antiga.
export async function resolveReportPoleAddress(client, poleId, location, { lookup = reverseGeocodePin } = {}) {
  const { lat, lng } = location || {};
  if (!poleId || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const { data, error } = await client.from('poles').select('address,city_id')
      .eq('id', poleId).eq('latitude', lat).eq('longitude', lng).maybeSingle();
    if (!error && typeof data?.address === 'string' && data.address.trim()) {
      return { address: data.address.trim(), city_id: data.city_id };
    }
  } catch { /* Uma falha de leitura não impede consultar as outras fontes. */ }

  try {
    const { data, error } = await client.rpc('mapped_street_address_for_pole', { p_pole_id: poleId }).maybeSingle();
    if (!error && typeof data?.address === 'string' && data.address.trim()) {
      return { address: data.address.trim() };
    }
  } catch { /* A rua mapeada é uma sugestão opcional. */ }

  try {
    return await lookup({ lat, lng }, { invoke: client.functions.invoke.bind(client.functions) });
  } catch {
    return null;
  }
}
