import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { fetchProfileJourneySummary } from '@/lib/profileJourneySummary';

export function useProfileJourneySummary(cityId) {
  const { user } = useAuth();
  const scope = `${user?.id || ''}:${cityId || ''}`;
  const [state, setState] = useState({});
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!user?.id) return;
    const totals = await fetchProfileJourneySummary(supabase, user.id, cityId);
    if (request === generation.current) setState({ scope, totals });
  }, [user?.id, cityId, scope]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    if (!user?.id) return;
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('reports-updated', refresh);
    return () => { invalidate(); window.removeEventListener('focus', refresh); window.removeEventListener('reports-updated', refresh); };
  }, [refresh, invalidate, user?.id]);
  return state.scope === scope ? state.totals : {};
}
