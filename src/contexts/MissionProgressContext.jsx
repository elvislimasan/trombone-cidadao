import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';

import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { avancosEntre } from '@/lib/missions';
import MissionProgressBanner from '@/components/missions/MissionProgressBanner';

const MissionProgressContext = createContext({ celebrate: () => {} });

export const useMissionProgress = () => useContext(MissionProgressContext);

export function MissionProgressProvider({ children }) {
  const { user } = useAuth();
  const countersRef = useRef(null);
  const fetchingRef = useRef(false);
  const [progress, setProgress] = useState(null);

  const fetchCounters = useCallback(async () => {
    if (!user) return null;
    const { data, error } = await supabase.rpc('get_mission_counters', {
      target_user_id: user.id,
    });
    if (error) throw error;

    const row = data?.[0];
    if (!row) return null;

    return {
      ...row,
      confirmadasPorCategoria: row.confirmed_by_category ?? {},
      registradasPorCategoria: row.reported_by_category ?? {},
    };
  }, [user]);

  useEffect(() => {
    countersRef.current = null;
    if (!user) return;

    let cancelled = false;
    fetchCounters()
      .then((counters) => {
        if (!cancelled) countersRef.current = counters;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [user, fetchCounters]);

  const celebrate = useCallback(async ({ delayMs = 900 } = {}) => {
    if (!user || fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const current = await fetchCounters();
      if (!current) return;

      const previous = countersRef.current;
      countersRef.current = current;
      if (!previous) return;

      const [mainProgress] = avancosEntre(previous, current);
      if (mainProgress) setProgress({ ...mainProgress, chave: Date.now() });
    } catch {
      // A ação principal já terminou; a recompensa visual falha em silêncio.
    } finally {
      fetchingRef.current = false;
    }
  }, [user, fetchCounters]);

  const closeBanner = useCallback(() => setProgress(null), []);

  return (
    <MissionProgressContext.Provider value={{ celebrate }}>
      {children}
      <MissionProgressBanner progress={progress} onClose={closeBanner} />
    </MissionProgressContext.Provider>
  );
}
