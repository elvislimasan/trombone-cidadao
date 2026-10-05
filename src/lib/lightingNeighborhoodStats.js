const cleanNeighborhood = (value) => typeof value === 'string' ? value.trim() : '';
const fromProperties = (properties) => Object.entries(properties || {})
  .find(([key, value]) => /^(bairro|neighbou?rhood)$/i.test(key) && cleanNeighborhood(value))?.[1];

export function problemPolesByNeighborhood(poles, orders, reports = [], includePoleIds = false) {
  const neighborhoodByPole = new Map();
  const latestByPole = (rows, field) => {
    const found = new Map();
    for (const row of rows) {
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
    if (!pole.is_broken && !['apagado', 'manutencao'].includes(pole.lighting_status)) continue;
    const properties = pole.raw_properties || {};
    const name = cleanNeighborhood(fromProperties(properties))
      || cleanNeighborhood(fromProperties(properties.kmz))
      || cleanNeighborhood(fromProperties(properties.municipal))
      || neighborhoodByPole.get(String(pole.id))
      || 'Bairro não informado';
    const key = name.toLocaleLowerCase('pt-BR');
    const row = counts.get(key) || { name, count: 0, ...(includePoleIds ? { poleIds: [] } : {}) };
    row.count += 1;
    if (includePoleIds) row.poleIds.push(pole.id);
    counts.set(key, row);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
}
