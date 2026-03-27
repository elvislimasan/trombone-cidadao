import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const MobileHeaderContext = createContext(null);

export function MobileHeaderProvider({ children }) {
  const location = useLocation();
  const [title, setTitle] = useState(null);
  const [actions, setActions] = useState([]);
  const [showBack, setShowBack] = useState(null);
  const [onBack, setOnBack] = useState(null);

  const reset = useCallback(() => {
    setTitle(null);
    setActions([]);
    setShowBack(null);
    setOnBack(null);
  }, []);

  useEffect(() => {
    reset();
  }, [location.pathname, reset]);

  const value = useMemo(() => ({
    title,
    actions,
    showBack,
    onBack,
    setTitle,
    setActions,
    setShowBack,
    setOnBack,
    reset,
  }), [actions, onBack, reset, showBack, title]);

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

