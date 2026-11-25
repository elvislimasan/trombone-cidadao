import { useEffect, useMemo } from 'react';
import { restoreLegislativePeriod, saveLegislativePeriod } from '@/lib/legislativePeriod';

export default function useLegislativePeriod(params, setParams) {
  const restored = useMemo(() => {
    try { return restoreLegislativePeriod(params, window.localStorage); }
    catch { return params; }
  }, [params]);

  useEffect(() => {
    if (restored !== params) setParams(restored, { replace: true });
    try {
      saveLegislativePeriod({ start: restored.get('inicio'), end: restored.get('fim') }, window.localStorage);
    } catch { /* Filtering remains usable when browser storage is unavailable. */ }
  }, [params, restored, setParams]);

  return restored;
}
