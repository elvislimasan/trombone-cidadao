export const MUNICIPAL_STAFF_MODULES = [
  { id: 'arborization', label: 'Arborização' },
  { id: 'water_supply', label: 'Operação-pipa' },
  { id: 'lighting', label: 'Iluminação' },
  { id: 'urban_planning', label: 'Ruas' },
];

export const availableStaffModules = channel => MUNICIPAL_STAFF_MODULES.filter(module => channel?.municipal_modules?.includes(module.id));
export const enabledStaffModules = (channel, access) => availableStaffModules(channel).filter(module => !access?.disabled_modules?.includes(module.id));
export const initialStaffAccess = channel => ({
  cargos: channel && !channel.categorias?.length && !channel.municipal_modules?.includes('water_supply') ? ['inventario'] : [],
  disabled_modules: [],
});

export function toggleStaffModule(access, moduleId, enabled) {
  const disabled = new Set(access.disabled_modules || []);
  if (enabled) disabled.delete(moduleId); else disabled.add(moduleId);
  return { ...access, disabled_modules: [...disabled] };
}
