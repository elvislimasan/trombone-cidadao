export const legislativeServiceColors = Object.freeze({ pavimentacao: '#d92d20', esgoto: '#139d89', iluminacao: '#d69219', poda: '#238b57', limpeza: '#4383cd', agua: '#24899f', outros: '#7b8595' });

export function legislativePlaceSummary(groups) {
  const matters = new Set(), places = new Set(), services = new Map();
  for (const group of groups) {
    places.add(group.location_key);
    if (!services.has(group.service)) services.set(group.service, new Set());
    for (const matter of group.matters || []) { matters.add(matter.id);services.get(group.service).add(matter.id); }
  }
  return { places: places.size, matters: matters.size, reviewed: groups.filter(group => group.reviewed).length,
    services: [...services].map(([key, ids]) => ({ key, value: ids.size, color: legislativeServiceColors[key] || legislativeServiceColors.outros })).sort((a,b) => b.value-a.value) };
}

export function legislativeRecentMonths(months, filters) {
  if (!filters?.start || !filters?.end || filters.end < filters.start) return [];
  const end = new Date(`${filters.end.slice(0,7)}-01T12:00:00Z`), first = filters.start.slice(0,7);
  const result = [];
  for (let index=5; index>=0; index--) {
    const date = new Date(end);date.setUTCMonth(date.getUTCMonth()-index);
    const key = date.toISOString().slice(0,7);if (key < first) continue;
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).toISOString().slice(0,10);
    result.push({ key, label: new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'}).format(date).replace('.',''), year: date.getUTCFullYear(),
      value: months.find(row => row.month === key)?.total || 0, start: `${key}-01` < filters.start ? filters.start : `${key}-01`, end: lastDay > filters.end ? filters.end : lastDay });
  }
  return result;
}
