export async function loadTreeAdoptionSettings(client, cityId) {
  if (!cityId) return { plantingEnabled: false, seedlingsEnabled: false };
  const { data, error } = await client.from('tree_adoption_settings')
    .select('city_id,planting_enabled,seedlings_enabled').eq('city_id', cityId).maybeSingle();
  if (error) throw error;
  if (!data) return { plantingEnabled: false, seedlingsEnabled: true };
  const sameCity = String(data.city_id) === String(cityId);
  return { plantingEnabled: sameCity && data.planting_enabled === true, seedlingsEnabled: sameCity && data.seedlings_enabled === true };
}

export async function saveTreeAdoptionSettings(client, cityId, changes) {
  const fields = { plantingEnabled: 'planting_enabled', seedlingsEnabled: 'seedlings_enabled' };
  const entries = Object.entries(fields).filter(([key]) => typeof changes?.[key] === 'boolean');
  if (!cityId || !entries.length) throw new Error('Informe a cidade e a configuração a alterar.');
  const payload = { city_id: cityId, ...Object.fromEntries(entries.map(([key, column]) => [column, changes[key]])) };
  const { data, error } = await client.from('tree_adoption_settings')
    .upsert(payload, { onConflict: 'city_id' })
    .select('city_id,planting_enabled,seedlings_enabled').single();
  if (error) throw error;
  if (String(data?.city_id) !== String(cityId) || entries.some(([key, column]) => data?.[column] !== changes[key])) {
    throw new Error('Não foi possível confirmar a configuração. Tente novamente.');
  }
  return { plantingEnabled: data.planting_enabled === true, seedlingsEnabled: data.seedlings_enabled === true };
}
