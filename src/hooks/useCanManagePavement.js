import { usePermissions } from '@/hooks/usePermissions';

// Espelha a RLS: master global; demais contas com cargo e permissão na cidade.
export function useCanManagePavement(cityId) {
  const { canWrite, planningCityIds, isMaster, loading } = usePermissions();
  const canManage = Boolean(!loading && cityId
    && (isMaster || planningCityIds.some(id => String(id) === String(cityId)))
    && canWrite('urban_planning'));
  return { canManage, canEdit: canManage, planningCityIds, allowedCityIds: isMaster ? null : planningCityIds, loading };
}
