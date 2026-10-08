export const DEFAULT_NEIGHBORHOOD_COLOR = '#bfe1ee';

export const neighborhoodColor = (color) => /^#[0-9a-f]{6}$/i.test(color || '')
  ? color.toLowerCase() : DEFAULT_NEIGHBORHOOD_COLOR;

// GeoJSON e banco usam [longitude, latitude]; a inversão fica na camada Leaflet.
export function openBoundaryRing(points) {
  if (!Array.isArray(points)) return [];
  const ring = points.map((point) => Array.isArray(point) ? [...point] : point);
  if (ring.length > 1 && Array.isArray(ring[0]) && Array.isArray(ring.at(-1))
    && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
  return ring;
}

const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (p, a, b) => Math.abs(cross(a, b, p)) < 1e-12
  && p[0] >= Math.min(a[0], b[0]) - 1e-12 && p[0] <= Math.max(a[0], b[0]) + 1e-12
  && p[1] >= Math.min(a[1], b[1]) - 1e-12 && p[1] <= Math.max(a[1], b[1]) + 1e-12;

export function boundaryValidationError(points) {
  const ring = openBoundaryRing(points);
  if (ring.length < 3) return 'Marque pelo menos três pontos para fechar a área do bairro.';
  if (ring.some((p) => !Array.isArray(p) || p.length !== 2
    || !p.every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) {
    return 'O contorno contém coordenadas inválidas.';
  }
  if (new Set(ring.map((p) => p.join(','))).size !== ring.length) return 'Remova os pontos repetidos do contorno.';
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const previous = ring[(i + ring.length - 1) % ring.length];
    if (onSegment(previous, a, b) || onSegment(b, previous, a)) return 'O contorno não pode cruzar nem sobrepor seus próprios lados.';
    for (let j = i + 2; j < ring.length; j += 1) {
      if (i === 0 && j === ring.length - 1) continue;
      const c = ring[j], d = ring[(j + 1) % ring.length];
      if ((cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
        || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d)) {
        return 'O contorno não pode cruzar nem sobrepor seus próprios lados.';
      }
    }
  }
  // Coordenadas relativas evitam perda de precisão em polígonos pequenos.
  const area2 = ring.reduce((sum, point, i) => sum + cross(ring[0], point, ring[(i + 1) % ring.length]), 0);
  if (Math.abs(area2) < 1e-12) return 'Os pontos precisam formar uma área, e não uma linha.';
  return null;
}

export function boundaryPoints(boundary) {
  const geometry = boundary?.type === 'Feature' ? boundary.geometry : boundary;
  if (geometry?.type !== 'Polygon' || geometry.coordinates?.length !== 1) return [];
  const points = openBoundaryRing(geometry.coordinates[0]);
  return boundaryValidationError(points) ? [] : points;
}

export function boundaryWkt(points) {
  const error = boundaryValidationError(points);
  if (error) throw new Error(error);
  const ring = openBoundaryRing(points);
  return `SRID=4326;POLYGON((${[...ring, ring[0]].map((p) => p.join(' ')).join(',')}))`;
}

export function pointInBoundary([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[j], b = ring[i];
    if (onSegment([x, y], a, b)) return true;
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function boundaryLabelPoint(ring) {
  const center = ring.reduce((sum, p) => [sum[0] + p[0] / ring.length, sum[1] + p[1] / ring.length], [0, 0]);
  if (pointInBoundary(center, ring)) return center;
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  for (let x = 1; x < 10; x += 1) {
    for (let y = 1; y < 10; y += 1) {
      const point = [minX + (Math.max(...xs) - minX) * x / 10, minY + (Math.max(...ys) - minY) * y / 10];
      if (pointInBoundary(point, ring)) return point;
    }
  }
  return ring[0];
}

export async function loadNeighborhoodBoundaries(supabase, cityId) {
  if (!cityId) return [];
  const { data, error } = await supabase.from('pavement_neighborhood_boundaries')
    .select('*, bairro:bairros!inner(id,name,city_id)').eq('bairro.city_id', cityId).order('bairro_id');
  if (error) throw error;
  return data || [];
}

export async function saveNeighborhoodBoundary({ supabase, bairro, points, color, previous, source }) {
  if (!bairro?.id || !bairro.city_id) throw new Error('Selecione um bairro da cidade atual.');
  const values = { boundary: boundaryWkt(points), color: neighborhoodColor(color) };
  if (source) values.source = source;
  const table = supabase.from('pavement_neighborhood_boundaries');
  const query = previous
    ? table.update(values).eq('bairro_id', bairro.id).eq('updated_at', previous.updated_at)
    : table.insert({ ...values, bairro_id: bairro.id });
  const { data, error } = await query.select('*, bairro:bairros!inner(id,name,city_id)').single();
  if (error) {
    if (source && error.code === 'PGRST204') throw new Error('Para salvar a origem da importação, aplique a atualização dos bairros (migração 354).');
    if (error.code === '23505' || error.code === 'PGRST116') throw new Error('Este contorno foi alterado por outra pessoa. Feche e reabra o editor para carregar a versão atual.');
    throw error;
  }
  if (!data) throw new Error('Não foi possível confirmar o salvamento do contorno.');
  return data;
}

export async function removeNeighborhoodBoundary({ supabase, previous }) {
  const { data, error } = await supabase.from('pavement_neighborhood_boundaries')
    .delete().eq('bairro_id', previous.bairro_id).eq('updated_at', previous.updated_at)
    .select('bairro_id').single();
  if (error) {
    if (error.code === 'PGRST116') throw new Error('Este contorno foi alterado por outra pessoa. Feche e reabra o editor para carregar a versão atual.');
    throw error;
  }
  if (!data) throw new Error('Não foi possível confirmar a remoção do contorno.');
}
