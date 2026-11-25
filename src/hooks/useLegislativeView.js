import { useCallback, useEffect, useState } from 'react';
import useIsMobile from '@/hooks/useIsMobile';
import { DEFAULT_LEGISLATIVE_VIEW, LEGISLATIVE_VIEW_KEY, normalizeLegislativeView, readLegislativeView } from '@/lib/legislativeView';

const eventName = 'legislative-view-change';
const load = () => { try { return readLegislativeView(window.localStorage); } catch { return normalizeLegislativeView(null); } };

export default function useLegislativeView() {
  const mobile = useIsMobile(), device = mobile ? 'mobile' : 'desktop';
  const [preferences, setPreferences] = useState(load);
  useEffect(() => {
    const changed = event => setPreferences(normalizeLegislativeView(event.detail));
    const stored = event => { if (event.key === LEGISLATIVE_VIEW_KEY || event.key === null) setPreferences(load()); };
    window.addEventListener(eventName, changed);window.addEventListener('storage', stored);
    return () => { window.removeEventListener(eventName, changed);window.removeEventListener('storage', stored); };
  }, []);
  const update = useCallback(patch => {
    const next = normalizeLegislativeView({ ...preferences, [device]: { ...preferences[device], ...patch } });
    setPreferences(next);
    try { window.localStorage.setItem(LEGISLATIVE_VIEW_KEY, JSON.stringify(next)); } catch { /* The current view remains usable without storage. */ }
    window.dispatchEvent(new CustomEvent(eventName, { detail: next }));
  }, [preferences, device]);
  return { ...preferences[device], mobile, update, reset: () => update(DEFAULT_LEGISLATIVE_VIEW) };
}
