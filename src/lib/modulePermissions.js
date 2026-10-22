export const MODULES = {
  works: 'Obras',
  rentals: 'Imóveis Alugados',
  pavement: 'Pavimentação e vereadores',
  urban_planning: 'Gestão de ruas',
  arborization: 'Gestão de arborização',
  services: 'Serviços',
  moderation: 'Moderação',
};

export const MODULE_KEYS = Object.keys(MODULES);

export function canWriteModule(user, rules, module, planningCityIds = [], treeCityIds = [], municipalGrants = {}) {
  if (!user?.id) return false;
  if (user.is_master) return true;
  // As demais contas exigem Órgão Público, cargo por cidade e liberação.
  if (module === 'urban_planning' || module === 'arborization') {
    const cities = module === 'arborization' ? treeCityIds : planningCityIds;
    if (user.user_type !== 'public_official' || !cities.length) return false;
    const individual = rules.find(r => r.scope === 'user' && r.user_id === user.id && r.module === module);
    const role = rules.find(r => r.scope === 'role' && r.role_name === (module === 'arborization' ? 'tree_manager' : 'urban_planner') && r.module === module);
    return (individual?.allowed ?? (municipalGrants[module] || role?.allowed) ?? false) === true;
  }
  const individual = rules.find(r => r.scope === 'user' && r.user_id === user.id && r.module === module);
  if (individual) return individual.allowed === true;
  const strongest = user.is_admin ? 'admin' : user.is_ambassador ? 'ambassador' : null;
  const role = rules.find(r => r.scope === 'role' && r.role_name === strongest && r.module === module);
  return role?.allowed ?? true;
}
