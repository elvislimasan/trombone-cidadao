import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { loadThemePreference, saveThemePreference } from './themeStorage';
import { applyTheme, resolveTheme } from './applyTheme';

const ThemeContext = createContext({
  preference: 'light',
  resolved: 'light',
  setPreference: () => {},
});

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState('light');
  const [resolved, setResolved] = useState('light');

  // Carrega a preferencia persistida uma vez.
  useEffect(() => {
    let alive = true;
    loadThemePreference().then((pref) => {
      if (!alive) return;
      setPreferenceState(pref);
      const next = resolveTheme(pref);
      setResolved(next);
      applyTheme(next);
    });
    return () => { alive = false; };
  }, []);

  const setPreference = useCallback((pref) => {
    const next = resolveTheme(pref);
    setPreferenceState(next);
    setResolved(next);
    applyTheme(next);
    saveThemePreference(next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
