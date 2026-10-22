import { usePermissions } from '@/hooks/usePermissions';

export function useCanManageArborization(cityId) {
  const { canWrite, treeAssignments, isMaster, loading } = usePermissions();
  const allowedCityIds = treeAssignments.map(row => row.city_id);
  const canManage = Boolean(!loading && cityId && canWrite('arborization')
    && (isMaster || allowedCityIds.some(id => String(id) === String(cityId))));
  return { canManage, canEdit: canManage, loading, allowedCityIds: isMaster ? null : allowedCityIds };
}
