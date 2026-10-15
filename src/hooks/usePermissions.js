import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { canWriteModule, MODULES, MODULE_KEYS } from '@/lib/modulePermissions';
import { PERMISSIONS_CHANGED_EVENT, PERMISSIONS_STORAGE_KEY } from '@/lib/permissionUpdates';

export { MODULES, MODULE_KEYS };

const EMPTY = { userId: null, userType: null, isMaster: false, ready: false, rules: [], planningCityIds: [], failed: false };

export function usePermissions() {
  const { user } = useAuth();
  const [state, setState] = useState(EMPTY);
  const [revision, setRevision] = useState(0);
  const refreshPermissions = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!user?.id) return;
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
  }, [user?.id, refreshPermissions]);

  useEffect(() => {
    if (!user?.id) { setState(EMPTY); return; }
    let cancelled = false;
    Promise.all([
      supabase.from('permission_rules').select('scope, role_name, user_id, module, allowed'),
      supabase.from('urban_planner_cities').select('city_id').eq('user_id', user.id),
      supabase.from('profiles').select('user_type, is_master').eq('id', user.id).maybeSingle(),
    ]).then(([permissions, assignments, profile]) => {
      if (cancelled) return;
      setState({ userId: user.id, userType: profile.error ? null : profile.data?.user_type,
        isMaster: !profile.error && profile.data?.is_master === true, ready: true, rules: permissions.data || [],
        planningCityIds: assignments.error ? [] : (assignments.data || []).map(row => row.city_id),
        failed: Boolean(permissions.error) });
    }).catch(() => {
      if (!cancelled) setState({ ...EMPTY, userId: user.id, ready: true, failed: true });
    });
    return () => { cancelled = true; };
  }, [user?.id, revision]);

  // Não reaproveita concessões de outra conta durante uma troca de sessão.
  const current = state.userId === user?.id ? state : EMPTY;
  const loading = Boolean(user?.id && !current.ready);
  const canWrite = useMemo(() => module => Boolean(current.ready && (current.isMaster || !current.failed)
    && canWriteModule({ ...user, user_type: current.userType, is_master: current.isMaster }, current.rules, module, current.planningCityIds)), [current, user]);
  return { canWrite, loading, refreshPermissions, isMaster: current.isMaster, rules: current.rules, planningCityIds: current.planningCityIds, MODULES, MODULE_KEYS };
}
