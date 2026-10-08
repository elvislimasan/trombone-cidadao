import { boundaryValidationError, openBoundaryRing } from './neighborhoodBoundary.js';

export const NEIGHBORHOOD_OVERPASS_URL = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
const normalName = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/^bairro\s+(?:(?:de|do|da|dos|das)\s+)?/, '').replace(/\s+/g, ' ');
const samePoint = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1];
const geometryPoints = (geometry) => (geometry || []).map((point) => [point.lon, point.lat]);

export function buildNeighborhoodQuery(city) {
  const uf = String(city?.state?.uf || '').toUpperCase();
  if (!city?.name || !/^[A-Z]{2}$/.test(uf)) throw new Error('Selecione uma cidade e uma UF antes de importar.');
  // Cidades homônimas ficam restritas à UF. A API devolve também o município
  // identificado, para distinguir ausência de bairros de falha no recorte.
  return `[out:json][timeout:25];
area["ISO3166-2"=${JSON.stringify(`BR-${uf}`)}]["admin_level"="4"]->.uf;
rel(area.uf)["boundary"="administrative"]["admin_level"="8"]["name"=${JSON.stringify(city.name)}]->.city;
.city out tags;
.city map_to_area->.municipality;
(nwr(area.municipality)["place"~"^(suburb|neighbourhood|quarter)$"]["name"];
rel(area.municipality)["boundary"="administrative"]["admin_level"="10"]["name"];);
out meta geom;`;
}

function ringFromElement(element) {
  if (element.type === 'way') {
    const points = geometryPoints(element.geometry);
    if (!samePoint(points[0], points.at(-1))) return { error: 'O traçado encontrado não é uma área fechada.' };
    return { points: openBoundaryRing(points) };
  }
  if (element.type !== 'relation') return { error: 'A fonte contém somente um ponto para este bairro, sem delimitação.' };
  const members = element.members || [];
  if (members.some((member) => member.type === 'way' && member.role === 'inner')) {
    return { error: 'A área tem recortes internos e ainda não é compatível com este editor.' };
  }
  if (members.some((member) => member.type === 'way' && !['', 'outer', 'inner'].includes(member.role || ''))) {
    return { error: 'A fonte usa trechos com papéis desconhecidos no contorno.' };
  }
  // A representação histórica do OSM usa papel vazio para o limite externo.
  // Não há inferência de furos: eles continuam sendo rejeitados explicitamente.
  const outer = members.filter((member) => member.type === 'way' && (!member.role || member.role === 'outer')).map((member) => geometryPoints(member.geometry));
  if (!outer.length || outer.some((points) => points.length < 2)) return { error: 'A API não retornou todos os trechos do contorno.' };
  const ring = [...outer.shift()];
  while (!samePoint(ring[0], ring.at(-1))) {
    const index = outer.findIndex((points) => samePoint(points[0], ring.at(-1)) || samePoint(points.at(-1), ring.at(-1)));
    if (index < 0) return { error: 'Os trechos encontrados não formam um contorno fechado.' };
    const next = outer.splice(index, 1)[0];
    if (!samePoint(next[0], ring.at(-1))) next.reverse();
    ring.push(...next.slice(1));
  }
  if (outer.length) return { error: 'O bairro tem áreas separadas e ainda não é compatível com este editor.' };
  return { points: openBoundaryRing(ring) };
}

export function parseNeighborhoodCandidates(data, bairroName, queriedAt = new Date().toISOString()) {
  const names = normalName(bairroName);
  const matches = (data?.elements || []).filter((element) => {
    const tags = element.tags || {};
    const isNeighborhood = ['suburb', 'neighbourhood', 'quarter'].includes(tags.place)
      || (tags.boundary === 'administrative' && tags.admin_level === '10');
    return isNeighborhood && [tags.name, tags['name:pt'], ...(tags.alt_name || '').split(';')].some((name) => name && normalName(name) === names);
  });
  const candidates = [], rejected = [];
  for (const element of matches) {
    const { points, error } = ringFromElement(element);
    const invalid = error || boundaryValidationError(points);
    if (invalid) { rejected.push(invalid); continue; }
    if (!['way', 'relation'].includes(element.type) || !Number.isSafeInteger(element.id) || element.id <= 0) continue;
    candidates.push({
      name: element.tags.name,
      points,
      source: {
        provider: 'osm', object_type: element.type, object_id: element.id, source_name: element.tags.name,
        object_updated_at: element.timestamp || null,
        base_updated_at: data.osm3s?.timestamp_osm_base || null,
        queried_at: queriedAt, modified: false,
      },
    });
  }
  candidates.sort((a, b) => (Date.parse(b.source.object_updated_at) || 0) - (Date.parse(a.source.object_updated_at) || 0));
  return { candidates, rejected, found: matches.length, baseUpdatedAt: data?.osm3s?.timestamp_osm_base || null };
}

export async function fetchNeighborhoodCandidates({ city, bairroName, fetchImpl = fetch, signal }) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 40000);
  try {
    const response = await fetchImpl(NEIGHBORHOOD_OVERPASS_URL, {
      method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({ data: buildNeighborhoodQuery(city) }).toString(),
    });
    if (response.status === 429) throw new Error('A fonte está limitando consultas. Aguarde um pouco antes de tentar novamente.');
    if (!response.ok) throw new Error('A fonte de bairros está indisponível agora. Tente novamente mais tarde.');
    const data = await response.json();
    if (data.remark) throw new Error('A consulta do mapa não foi concluída. Tente novamente mais tarde.');
    const cities = (data.elements || []).filter((element) => element.tags?.boundary === 'administrative' && element.tags?.admin_level === '8');
    if (cities.length !== 1) throw new Error('Não foi possível identificar um único município nesta fonte. O contorno atual foi preservado.');
    return parseNeighborhoodCandidates(data, bairroName);
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('A consulta demorou demais. Tente novamente mais tarde.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export const neighborhoodSourceUrl = (source) => source?.provider === 'osm'
  && ['way', 'relation'].includes(source.object_type) && Number.isSafeInteger(source.object_id) && source.object_id > 0
  ? `https://www.openstreetmap.org/${source.object_type}/${source.object_id}` : null;
