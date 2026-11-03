import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { ELECTRICIAN_OFFLINE_EVENT, listElectricianJobs, syncElectricianJobs } from '@/lib/electricianOffline';

const Context = createContext({ jobs: [], syncing: false, online: true, sync: async () => {} });
export const useElectricianOffline = () => useContext(Context);
export function ElectricianOfflineProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState({ userId: null, jobs: [] });
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const refresh = useCallback(async () => {
    const jobs = await listElectricianJobs(userId);
    setState({ userId, jobs });
  }, [userId]);
  const sync = useCallback(async () => {
    if (!userId) return;
    setSyncing(true);
    try { await syncElectricianJobs(supabase, userId); }
    catch (error) { console.error('Falha ao acessar registros locais do eletricista:', error); }
    finally { setSyncing(false); await refresh(); }
  }, [userId, refresh]);
  useEffect(() => {
    refresh(); sync();
    const connection = () => { setOnline(navigator.onLine !== false); if (navigator.onLine !== false) sync(); };
    const visible = () => { if (document.visibilityState === 'visible') connection(); };
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('focus', connection);
    window.addEventListener(ELECTRICIAN_OFFLINE_EVENT, refresh);
    document.addEventListener('visibilitychange', visible);
    const timer = setInterval(sync, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('focus', connection);
      window.removeEventListener(ELECTRICIAN_OFFLINE_EVENT, refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh, sync]);
  return <Context.Provider value={{ jobs: state.userId === userId ? state.jobs : [], syncing, online, sync }}>{children}</Context.Provider>;
}
