import { poleNeighborhood } from './poleNeighborhood.js';
import { registeredNeighborhood, neighborhoodKey } from '../../supabase/functions/_shared/reportNeighborhoods.js';
const cleanNeighborhood = (value) => typeof value === 'string' ? value.trim() : '';

export function problemPolesByNeighborhood(poles, orders, reports = [], includePoleIds = false, neighborhoods = []) {
  const neighborhoodByPole = new Map();
  const latestByPole = (rows, field) => {
    const found = new Map();
    for (const row of rows) {
      if (field === 'neighborhood' && (row.status === 'duplicate'
        || ['rejected', 'pending_approval'].includes(row.moderation_status))) continue;
      const name = cleanNeighborhood(row[field]);
      if (row.pole_id != null && name) {
        const key = String(row.pole_id);
        const previous = found.get(key);
        if (!previous || String(row.created_at || '') > String(previous.created_at || '')) {
          found.set(key, { name, created_at: row.created_at });
        }
      }
    }
    return found;
  };
  const fromReports = latestByPole(reports, 'neighborhood');
  const fromOrders = latestByPole(orders, 'bairro');
  for (const [key, value] of fromReports) neighborhoodByPole.set(key, value.name);
  for (const [key, value] of fromOrders) neighborhoodByPole.set(key, value.name);

  const counts = new Map();
  for (const pole of poles) {
    if (pole.lighting_status === 'removido' || (!pole.is_broken && !['apagado', 'manutencao'].includes(pole.lighting_status))) continue;
    const candidate = poleNeighborhood(pole, neighborhoods)
      || neighborhoodByPole.get(String(pole.id))
      || 'Bairro não informado';
    const name = registeredNeighborhood(candidate, neighborhoods) || candidate;
    const key = neighborhoodKey(name);
    const row = counts.get(key) || { name, count: 0, ...(includePoleIds ? { poleIds: [] } : {}) };
    row.count += 1;
    if (includePoleIds) row.poleIds.push(pole.id);
    counts.set(key, row);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
}
