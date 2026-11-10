import { pipaDay } from './pipa';

export const pipaRouteSource = source => source === 'municipality' ? 'Planejada pela prefeitura' : 'Planejada pelo pipeiro';
export function pipaRouteStops(route, requests = []) {
  return (route.stops || requests.filter(r => r.route_id === route.id).map(r => ({ request_id: r.id, tank_id: r.tank_id, status: r.status, position: r.route_position }))).slice().sort((a, b) => a.position - b.position);
}
export function pipaRoutePending(route, requests) {
  return !route.cancelled && pipaRouteStops(route, requests).some(s => ['assigned', 'in_transit'].includes(s.status));
}
export function pipaDefaultRoute(routes = [], requests = [], today = pipaDay()) {
  return routes.filter(r => r.scheduled_date <= today && pipaRoutePending(r, requests)).sort((a, b) => Number(b.source === 'municipality') - Number(a.source === 'municipality') || a.scheduled_date.localeCompare(b.scheduled_date))[0];
}
export function pipaRouteTanks(tanks, route, requests = []) {
  if (!route) return tanks;
  const ids = new Set(pipaRouteStops(route, requests).filter(s => ['assigned', 'in_transit'].includes(s.status)).map(s => s.tank_id));
  return tanks.filter(t => ids.has(t.id));
}
