import { useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useElectricianOffline } from '@/contexts/ElectricianOfflineContext';
import { prepareElectricianOrders } from '@/lib/electricianOffline';

const REFRESH_INTERVAL = 5 * 60 * 1000;

const preloadOfflineScreens = () => Promise.all([
  import('@/pages/ElectricianOrderPage'),
  import('@/components/municipality/ElectricianLightingMap'),
  import('@/pages/ElectricianPatrolPage'),
]);

export function useAutomaticElectricianPreparation({ userId, municipalityId, cityId, enabled }) {
  const { sync } = useElectricianOffline();

  useEffect(() => {
    if (!enabled || !userId || !municipalityId) return;
    const controller = new AbortController();
    let running = false;
    let lastPreparedAt = null;

    const prepare = async (force = false) => {
      if (controller.signal.aborted || running || navigator.onLine === false
        || document.visibilityState === 'hidden') return;
      if (!force && lastPreparedAt !== null && Date.now() - lastPreparedAt < REFRESH_INTERVAL) return;
      running = true;
      try {
        // Send local work before fetching the snapshots used without a connection.
        await sync();
        controller.signal.throwIfAborted();
        await preloadOfflineScreens();
        controller.signal.throwIfAborted();
        await prepareElectricianOrders(supabase, userId, municipalityId, undefined, cityId, controller.signal);
        lastPreparedAt = Date.now();
      } catch {
        // Keep the existing cache and retry silently when connectivity returns.
      } finally {
        running = false;
      }
    };
    const reconnect = () => { void prepare(true); };
    const resume = () => { void prepare(); };
    void prepare();
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    const timer = window.setInterval(resume, 60000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [userId, municipalityId, cityId, enabled, sync]);
}
