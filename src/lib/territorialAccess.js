export const TERRITORIAL_BASE = '/prefeitura/gestao-territorial';

export function territorialModules(access, cityId) {
  const hasCity = ids => cityId != null && ids.some(id => String(id) === String(cityId));
  return [
    access.canWrite('urban_planning') && (access.isMaster || hasCity(access.planningCityIds)) && 'ruas',
    access.canWrite('arborization') && (access.isMaster || hasCity(access.treeAssignments.map(row => row.city_id))) && 'arborizacao',
  ].filter(Boolean);
}

export function hasTerritorialAccess(access) {
  return access.isMaster || (access.canWrite('urban_planning') && access.planningCityIds.length > 0)
    || (access.canWrite('arborization') && access.treeAssignments.length > 0);
}

export function territorialHome(user, access) {
  if (!user || user.is_admin || user.is_master || access.municipalities.length > 0) return null;
  return hasTerritorialAccess(access) ? TERRITORIAL_BASE : null;
}

export function isTerritorialPublicDetail(path) {
  return /^\/(arborizacao\/arvore|mapa-pavimentacao\/rua|share\/rua)\/[^/]+\/?$/.test(path);
}

export function territorialEntryRedirect(user, access, pathname) {
  const home = territorialHome(user, access);
  if (!home && user && !user.is_admin && !user.is_master && hasTerritorialAccess(access)) {
    if (['/arborizacao/gerenciar', '/admin/arborizacao'].includes(pathname)) return `${TERRITORIAL_BASE}/arborizacao`;
    if (['/pavimentacao/gerenciar', '/admin/pavimentacao'].includes(pathname)) return `${TERRITORIAL_BASE}/ruas`;
  }
  if (!home) return null;
  if (['/', '/feed', '/prefeitura/visao-geral'].includes(pathname)) return home;
  if (['/arborizacao/gerenciar', '/admin/arborizacao'].includes(pathname)) return `${home}/arborizacao`;
  if (['/pavimentacao/gerenciar', '/admin/pavimentacao'].includes(pathname)) return `${home}/ruas`;
  return null;
}
