export function activeMunicipalMembershipId(memberships, cityId, activeMunicipalityId = null) {
  if (cityId == null) return null;
  return memberships?.find((item) =>
    item.prefeitura?.status === 'ativa'
    && String(item.prefeitura.city_id) === String(cityId)
    && (!activeMunicipalityId || item.prefeitura.id === activeMunicipalityId))?.prefeitura?.id || null;
}
