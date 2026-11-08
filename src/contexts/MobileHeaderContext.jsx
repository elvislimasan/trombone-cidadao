import React, { createContext, useContext, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

const MobileHeaderContext = createContext(null);
const EMPTY_HEADER = { title: null, actions: [], showBack: null, onBack: null };

export function MobileHeaderProvider({ children }) {
  const location = useLocation();
  const pathname = location.pathname;
  const [overrides, setOverrides] = useState(() => ({ pathname, ...EMPTY_HEADER }));
  const controls = useMemo(() => {
    const setter = field => update => setOverrides(previous => {
      const current = previous.pathname === pathname ? previous : { pathname, ...EMPTY_HEADER };
      return { ...current, [field]: typeof update === 'function' ? update(current[field]) : update };
    });
    return {
      setTitle: setter('title'),
      setActions: setter('actions'),
      setShowBack: setter('showBack'),
      setOnBack: setter('onBack'),
      reset: () => setOverrides(previous => previous.pathname === pathname ? { pathname, ...EMPTY_HEADER } : previous),
    };
  }, [pathname]);
  // Esconde imediatamente as ações da rota anterior. Um reset do provider
  // depois dos efeitos das páginas apagava o título/ações recém-registrados.
  const current = overrides.pathname === pathname ? overrides : EMPTY_HEADER;
  const value = useMemo(() => ({ ...current, ...controls }), [current, controls]);

  return (
    <MobileHeaderContext.Provider value={value}>
      {children}
    </MobileHeaderContext.Provider>
  );
}

export function useMobileHeader() {
  const ctx = useContext(MobileHeaderContext);
  if (!ctx) {
    return {
      title: null,
      actions: [],
      showBack: null,
      onBack: null,
      setTitle: () => {},
      setActions: () => {},
      setShowBack: () => {},
      setOnBack: () => {},
      reset: () => {},
    };
  }
  return ctx;
}

