import { haversine, NAV_ALERTA } from '@/lib/navGeo';
import { poleNeighborhood } from '@/lib/poleNeighborhood';
import { neighborhoodKey } from '../../supabase/functions/_shared/reportNeighborhoods.js';

export const ELECTRICIAN_PATROL_ALERT_MS = 15000;
export const ELECTRICIAN_PATROL_FETCH_RADIUS_M = 150;
export const PATROL_SERVICE_TYPES = [['all', 'Todos os serviços'], ['lamp_off', 'Poste apagado'], ['no_lighting', 'Poste sem iluminação'], ['other', 'Outros']];
export const DEFAULT_PATROL_FILTERS = Object.freeze({ neighborhood: '', serviceType: 'all', order: 'nearest' });

export function patrolFiltersFromSearch(search) {
  const params = new URLSearchParams(search);
  return { neighborhood: params.get('bairro') || '',
    serviceType: PATROL_SERVICE_TYPES.some(([id]) => id === params.get('servico')) ? params.get('servico') : 'all',
    order: params.get('ordem') === 'oldest' ? 'oldest' : 'nearest' };
}

export function patrolSearch(search, mode, filters) {
  const params = new URLSearchParams(search);
  params.set('modo', mode);
  for (const [key, value] of [['bairro', filters.neighborhood], ['servico', filters.serviceType], ['ordem', filters.order]]) {
    if (value && value !== 'all' && value !== 'nearest') params.set(key, value);
    else params.delete(key);
  }
  return `?${params}`;
}

// O subtipo e a idade vêm das solicitações abertas. O estado do poste é a
// alternativa para problemas que ainda não têm uma solicitação vinculada.
export function filterPatrolPoles(poles, services = [], filters = DEFAULT_PATROL_FILTERS) {
  const byPole = new Map();
  for (const service of services) {
    const id = String(service.pole_id);
    if (!byPole.has(id)) byPole.set(id, []);
    byPole.get(id).push(service);
  }
  return poles.flatMap(pole => {
    if (pole.lighting_status === 'removido') return [];
    const neighborhood = poleNeighborhood(pole, filters.neighborhood ? [{ name: filters.neighborhood }] : []);
    const linked = byPole.get(String(pole.id)) || [];
    const issues = linked.length ? linked : brokenPole(pole) ? [{ issue_type: pole.lighting_status === 'apagado' ? 'lamp_off' : 'other', created_at: pole.updated_at }] : [];
    const matching = issues.filter(issue => {
      const type = issue.issue_type || 'other';
      return (!filters.neighborhood || neighborhoodKey(issue.neighborhood || issue.bairro || neighborhood) === neighborhoodKey(filters.neighborhood))
        && (filters.serviceType === 'all' || (filters.serviceType === 'other' ? !['lamp_off', 'no_lighting'].includes(type) : type === filters.serviceType));
    });
    if (!matching.length) return [];
    const dates = matching.map(issue => Date.parse(issue.created_at)).filter(Number.isFinite);
    return [{ ...pole, patrol_issues: matching, patrol_oldest_at: dates.length ? Math.min(...dates) : Infinity }];
  });
}

export function patrolPositionIsPrecise(position) {
  return Number.isFinite(position?.lat) && Math.abs(position.lat) <= 90
    && Number.isFinite(position?.lng) && Math.abs(position.lng) <= 180
    && Number.isFinite(position?.accuracy) && position.accuracy >= 0
    && position.accuracy <= NAV_ALERTA.precisaoMaximaM;
}

export function brokenPole(pole) {
  return pole?.lighting_status !== 'removido'
    && (pole?.is_broken || ['apagado', 'manutencao'].includes(pole?.lighting_status) || pole?.patrol_issues?.length > 0);
}

export function closestPatrolPole(position, poles, dismissed = new Set(), order = 'nearest') {
  if (!patrolPositionIsPrecise(position)) return null;
  const nearby = poles.filter((pole) => brokenPole(pole) && !dismissed.has(String(pole.id))
    && Number.isFinite(pole.latitude) && Number.isFinite(pole.longitude))
    .map((pole) => ({ pole, distance: haversine(position, { lat: pole.latitude, lng: pole.longitude }) }))
    .filter((item) => item.distance <= NAV_ALERTA.distanciaAlertaM)
    .sort((a, b) => (order === 'oldest' ? (a.pole.patrol_oldest_at ?? Infinity) - (b.pole.patrol_oldest_at ?? Infinity) : 0) || a.distance - b.distance);
  return nearby[0] || null;
}

export function patrolPoleBounds(position) {
  const deltaLat = ELECTRICIAN_PATROL_FETCH_RADIUS_M / 111320;
  const deltaLng = deltaLat / Math.max(Math.cos(position.lat * Math.PI / 180), 0.01);
  return { south: position.lat - deltaLat, north: position.lat + deltaLat,
    west: position.lng - deltaLng, east: position.lng + deltaLng };
}
