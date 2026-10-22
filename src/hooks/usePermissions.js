import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { canWriteModule, MODULES, MODULE_KEYS } from '@/lib/modulePermissions';
import { PERMISSIONS_CHANGED_EVENT, PERMISSIONS_STORAGE_KEY } from '@/lib/permissionUpdates';

export { MODULES, MODULE_KEYS };

const EMPTY = { userId: null, userType: null, isMaster: false, ready: false, rules: [], planningCityIds: [], treeAssignments: [], municipalities: [], failed: false };
const PermissionsContext = createContext(null);

function usePermissionsState(enabled = true) {
  const { user } = useAuth();
  const [state, setState] = useState(EMPTY);
  const [revision, setRevision] = useState(0);
  const refreshPermissions = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!enabled || !user?.id) return;
    const refresh = event => {
      if (document.visibilityState === 'hidden') return;
      let target = event.detail?.userId;
      if (event.type === 'storage') {
        if (event.key !== PERMISSIONS_STORAGE_KEY) return;
        try { target = JSON.parse(event.newValue)?.userId; } catch { return; }
      }
      if (!target || target === user.id) refreshPermissions();
    };
    window.addEventListener(PERMISSIONS_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener(PERMISSIONS_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled, user?.id, refreshPermissions]);

  useEffect(() => {
    if (!enabled || !user?.id) { setState(EMPTY); return; }
    let cancelled = false;
    Promise.all([
      supabase.from('permission_rules').select('scope, role_name, user_id, module, allowed'),
      supabase.from('urban_planner_cities').select('city_id').eq('user_id', user.id),
      supabase.from('profiles').select('user_type, is_master').eq('id', user.id).maybeSingle(),
      supabase.rpc('territorial_workspace'),
    ]).then(([permissions, assignments, profile, territorial]) => {
      if (cancelled) return;
      const resolvedTerritorial = !territorial.error && Array.isArray(territorial.data?.street_city_ids);
      setState({ userId: user.id, userType: profile.error ? null : profile.data?.user_type,
        isMaster: !profile.error && profile.data?.is_master === true, ready: true, rules: permissions.data || [],
        resolvedTerritorial,
        planningCityIds: resolvedTerritorial ? territorial.data.street_city_ids : assignments.error ? [] : (assignments.data || []).map(row => row.city_id),
        treeAssignments: territorial.error ? [] : territorial.data?.tree_assignments || [],
        municipalities: territorial.error ? [] : territorial.data?.municipalities || [],
        territorialFailed: Boolean(territorial.error),
        failed: Boolean(permissions.error || assignments.error || profile.error) });
    }).catch(() => {
      if (!cancelled) setState({ ...EMPTY, userId: user.id, ready: true, failed: true });
    });
    return () => { cancelled = true; };
  }, [enabled, user?.id, revision]);

  // Não reaproveita concessões de outra conta durante uma troca de sessão.
  const current = state.userId === user?.id ? state : EMPTY;
  const loading = Boolean(user?.id && !current.ready);
  const canWrite = useMemo(() => module => {
    if (!current.ready) return false;
    if (current.isMaster) return true;
    if (current.failed) return false;
    if (module === 'urban_planning' || module === 'arborization') {
      if (current.territorialFailed) return false;
      // O RPC aplica concessão municipal, cidade, vínculo e bloqueio individual.
      if (current.resolvedTerritorial) return current.userType === 'public_official'
        && (module === 'urban_planning' ? current.planningCityIds : current.treeAssignments).length > 0;
    }
    return canWriteModule({ ...user, user_type: current.userType, is_master: current.isMaster }, current.rules,
      module, current.planningCityIds, current.treeAssignments.map(row => row.city_id));
  }, [current, user]);
  return { canWrite, loading, refreshPermissions, isMaster: current.isMaster, rules: current.rules, planningCityIds: current.planningCityIds,
    treeAssignments: current.treeAssignments, municipalities: current.municipalities, error: !current.isMaster && (current.failed || current.territorialFailed),
    MODULES, MODULE_KEYS };
}

// Uma carga por sessão, compartilhada por guards, menus e telas do painel.
export function PermissionsProvider({ children }) {
  const value = usePermissionsState();
  return React.createElement(PermissionsContext.Provider, { value }, children);
}

export function usePermissions() {
  const shared = useContext(PermissionsContext);
  const fallback = usePermissionsState(!shared);
  return shared || fallback;
}
