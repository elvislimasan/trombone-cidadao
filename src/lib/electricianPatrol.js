import { haversine, NAV_ALERTA } from '@/lib/navGeo';

export const ELECTRICIAN_PATROL_ALERT_MS = 15000;
export const ELECTRICIAN_PATROL_FETCH_RADIUS_M = 150;

export function patrolPositionIsPrecise(position) {
  return Number.isFinite(position?.lat) && Math.abs(position.lat) <= 90
    && Number.isFinite(position?.lng) && Math.abs(position.lng) <= 180
    && Number.isFinite(position?.accuracy) && position.accuracy >= 0
    && position.accuracy <= NAV_ALERTA.precisaoMaximaM;
}

export function brokenPole(pole) {
  return pole?.lighting_status !== 'removido'
    && (pole?.is_broken || ['apagado', 'manutencao'].includes(pole?.lighting_status));
}

export function closestPatrolPole(position, poles, dismissed = new Set()) {
  if (!patrolPositionIsPrecise(position)) return null;
  const nearby = poles.filter((pole) => brokenPole(pole) && !dismissed.has(String(pole.id))
    && Number.isFinite(pole.latitude) && Number.isFinite(pole.longitude))
    .map((pole) => ({ pole, distance: haversine(position, { lat: pole.latitude, lng: pole.longitude }) }))
    .filter((item) => item.distance <= NAV_ALERTA.distanciaAlertaM)
    .sort((a, b) => a.distance - b.distance);
  return nearby[0] || null;
}

export function patrolPoleBounds(position) {
  const deltaLat = ELECTRICIAN_PATROL_FETCH_RADIUS_M / 111320;
  const deltaLng = deltaLat / Math.max(Math.cos(position.lat * Math.PI / 180), 0.01);
  return { south: position.lat - deltaLat, north: position.lat + deltaLat,
    west: position.lng - deltaLng, east: position.lng + deltaLng };
}
