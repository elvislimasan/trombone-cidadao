import { guideLocation } from './guideLocation.js';

export async function saveGuideLocation(client, id, position) {
  const point = guideLocation(position);
  if (!point) throw new Error('Marque a localização no mapa antes de salvar.');

  const { data, error } = await client.from('directory')
    .update({ location: `POINT(${point.lng} ${point.lat})` })
    .eq('id', id)
    .select('id, location')
    .single();
  if (error) throw error;
  const saved = guideLocation(data?.location);
  if (!saved || Math.abs(saved.lat - point.lat) > 1e-7 || Math.abs(saved.lng - point.lng) > 1e-7) {
    throw new Error('Não foi possível confirmar a localização salva. Tente novamente.');
  }
  return data;
}
