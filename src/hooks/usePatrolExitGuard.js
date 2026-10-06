import { useCallback, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

// O voltar do aparelho/navegador abre a decisão de saída, como no cidadão.
export function usePatrolExitGuard({ onBack, onLeave, saved }) {
  const back = useRef(onBack);
  const leave = useRef(onLeave);
  const hasSaved = useRef(saved);
  const leaving = useRef(false);
  useEffect(() => { back.current = onBack; leave.current = onLeave; hasSaved.current = saved; }, [onBack, onLeave, saved]);
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let handle; let cancelled = false;
      App.addListener('backButton', () => back.current()).then((next) => {
        if (cancelled) next.remove(); else handle = next;
      });
      return () => { cancelled = true; handle?.remove(); };
    }
    // Preserva o estado do Router (incluindo idx), sem criar uma rota extra.
    window.history.pushState(window.history.state, '');
    const pop = () => {
      if (leaving.current) { leave.current(); return; }
      window.history.pushState(window.history.state, ''); back.current();
    };
    const unload = (event) => { if (!hasSaved.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('popstate', pop);
    window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('popstate', pop); window.removeEventListener('beforeunload', unload); };
  }, []);
  return useCallback(() => {
    if (Capacitor.isNativePlatform()) { leave.current(); return; }
    if (leaving.current) return;
    leaving.current = true; window.history.back();
  }, []);
}
