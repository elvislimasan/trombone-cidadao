export const MODULES = {
  works: 'Obras',
  rentals: 'Imóveis Alugados',
  pavement: 'Pavimentação e vereadores',
  urban_planning: 'Planejamento urbano (ruas e arborização)',
  services: 'Serviços',
  moderation: 'Moderação',
};

export const MODULE_KEYS = Object.keys(MODULES);

export function canWriteModule(user, rules, module, planningCityIds = []) {
  if (!user?.id) return false;
  if (user.is_master) return true;
  // As demais contas exigem Órgão Público, cargo por cidade e liberação.
  if (module === 'urban_planning') {
    if (user.user_type !== 'public_official' || !planningCityIds.length) return false;
    const individual = rules.find(r => r.scope === 'user' && r.user_id === user.id && r.module === module);
    const role = rules.find(r => r.scope === 'role' && r.role_name === 'urban_planner' && r.module === module);
    return (individual?.allowed ?? role?.allowed ?? false) === true;
  }
  const individual = rules.find(r => r.scope === 'user' && r.user_id === user.id && r.module === module);
  if (individual) return individual.allowed === true;
  const strongest = user.is_admin ? 'admin' : user.is_ambassador ? 'ambassador' : null;
  const role = rules.find(r => r.scope === 'role' && r.role_name === strongest && r.module === module);
  return role?.allowed ?? true;
}
