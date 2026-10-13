import { rotaDoVereador } from './pavementStreetHistory.js';

// Slugs são únicos por cidade. Um link sem cidade só é recuperável sem ambiguidade.
export async function legacyCouncilorRoute(client, slug) {
  if (!slug) return null;
  const { data, error } = await client.from('councilors')
    .select('city_id, slug').eq('slug', slug).limit(2);
  if (error) throw error;
  if (data?.length !== 1) return null;
  return rotaDoVereador(data[0].city_id, data[0].slug);
}
