import { autoresDaRua, chaveDeAutor, slugDeVereador } from './pavementStreetHistory.js';
import { fetchPublicDetail } from './publicDetailResource.js';

export function fetchCouncilorPublicResource(client, cityId, slug) {
  return fetchPublicDetail(async () => {
    const [profile, streets, city] = await Promise.all([
      client.from('councilors').select('*').eq('city_id', cityId).eq('slug', slug).maybeSingle(),
      client.from('pavement_streets').select('id, slug, name, city_id, historical_documents, historical_photos, bairro:bairros!pavement_streets_bairro_id_fkey(name)').eq('city_id', cityId),
      client.from('cities').select('name, states(uf)').eq('id', cityId).maybeSingle(),
    ]);
    // A ausência só é confirmada quando as duas fontes foram consultadas com sucesso.
    if (profile.error || streets.error || city.error) return { error: profile.error || streets.error || city.error };
    const cityStreets = streets.data || [];
    const matchingStreets = cityStreets.filter((street) => autoresDaRua(street).some((author) => slugDeVereador(author) === slug));
    const inferredName = matchingStreets.flatMap(autoresDaRua).find((author) => slugDeVereador(author) === slug);
    const councilor = profile.data || (inferredName ? { id: null, city_id: Number(cityId), name: inferredName, normalized_name: chaveDeAutor(inferredName), slug } : null);
    return { data: councilor ? {
      councilor, streets: matchingStreets, cityStreets,
      cityName: city.data ? `${city.data.name}${city.data.states?.uf ? ` - ${city.data.states.uf}` : ''}` : '',
    } : null };
  });
}
