export const ELECTRICIAN_SERVICE_LABELS = {
  lamp_replacement: 'Troca de lâmpada',
  arm_installation: 'Instalação de braço de luz',
  other: 'Outro serviço',
  unknown: 'Não informado',
};

export function summarizeElectricianWork(orders, now = new Date()) {
  const completed = orders.filter((order) => order.status === 'concluida');
  const poleIds = new Set(completed.map((order) => order.pole_id).filter(Boolean));
  const serviceCounts = Object.fromEntries(Object.keys(ELECTRICIAN_SERVICE_LABELS).map((key) => [key, 0]));
  const neighborhoodCounts = new Map();
  let thisMonth = 0;

  for (const order of completed) {
    const type = Object.hasOwn(ELECTRICIAN_SERVICE_LABELS, order.service_type) ? order.service_type : 'unknown';
    serviceCounts[type] += 1;
    const neighborhood = order.bairro?.trim();
    if (neighborhood) neighborhoodCounts.set(neighborhood, (neighborhoodCounts.get(neighborhood) || 0) + 1);
    const date = order.concluida_em ? new Date(order.concluida_em) : null;
    if (date && !Number.isNaN(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) thisMonth += 1;
  }

  return {
    poles: poleIds.size,
    completed: completed.length,
    thisMonth,
    neighborhoods: neighborhoodCounts.size,
    services: Object.entries(serviceCounts).map(([key, count]) => ({ key, label: ELECTRICIAN_SERVICE_LABELS[key], count })).filter((item) => item.count > 0),
    topNeighborhoods: [...neighborhoodCounts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR')).slice(0, 5),
    recent: [...completed].sort((a, b) => Date.parse(b.concluida_em || b.executada_em || '') - Date.parse(a.concluida_em || a.executada_em || '')).slice(0, 5),
  };
}
