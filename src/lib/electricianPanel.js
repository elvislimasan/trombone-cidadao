const PRIORITY_ORDER = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
export const ELECTRICIAN_ACTIVE_STATUSES = ['aberta', 'triagem', 'programada', 'em_andamento'];

export function offerKey(offer) {
  return `${offer.tipo}:${offer.id}`;
}

export function offerGroup(offer) {
  if (offer.prioridade === 'urgente') return 0;
  return offer.tipo === 'ordem' ? 1 : 2;
}

export function sortElectricianOffers(offers, nearby = false) {
  return [...offers].sort((a, b) => {
    const group = offerGroup(a) - offerGroup(b);
    if (group) return group;
    if (nearby) {
      const distance = (a.distancia_m ?? Infinity) - (b.distancia_m ?? Infinity);
      if (distance) return distance;
    }
    const priority = (PRIORITY_ORDER[a.prioridade] ?? 2) - (PRIORITY_ORDER[b.prioridade] ?? 2);
    if (priority) return priority;
    const due = (a.prazo_em ? Date.parse(a.prazo_em) : Infinity) - (b.prazo_em ? Date.parse(b.prazo_em) : Infinity);
    if (due) return due;
    return Date.parse(a.created_at) - Date.parse(b.created_at);
  });
}

export function orderStage(order) {
  if (order.status === 'aguardando_confirmacao') return 'conferencia';
  if (order.status === 'em_andamento') return 'execucao';
  if (ELECTRICIAN_ACTIVE_STATUSES.includes(order.status)) return 'fazer';
  return 'historico';
}

export function formatDistance(meters) {
  if (!Number.isFinite(Number(meters)) || meters == null) return '';
  const value = Number(meters);
  return value < 1000 ? `${Math.round(value)} m` : `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

export function distanceBetweenPoints(origin, destination) {
  const coordinates = [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude];
  if (coordinates.some((value) => value == null || !Number.isFinite(Number(value)))) return null;
  const [lat1, lon1, lat2, lon2] = coordinates.map(Number);
  if (Math.abs(lat1) > 90 || Math.abs(lat2) > 90 || Math.abs(lon1) > 180 || Math.abs(lon2) > 180) return null;
  const radians = Math.PI / 180;
  const latitude = (lat2 - lat1) * radians;
  const longitude = (lon2 - lon1) * radians;
  const arc = Math.sin(latitude / 2) ** 2
    + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(longitude / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}
