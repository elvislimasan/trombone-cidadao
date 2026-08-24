import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { loadThemePreference, saveThemePreference } from './themeStorage';
import { applyTheme, resolveTheme } from './applyTheme';

const ThemeContext = createContext({
  preference: 'system',
  resolved: 'light',
  setPreference: () => {},
});

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState('system');
  const [resolved, setResolved] = useState(() => resolveTheme('system'));

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

  // Reage a mudanca do tema do sistema, somente quando a preferencia e 'system'.
  useEffect(() => {
    if (preference !== 'system') return;
    let mq;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return;
    }
    const onChange = () => {
      const next = resolveTheme('system');
      setResolved(next);
      applyTheme(next);
    };
    // Safari antigo usa addListener
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, [preference]);

  const setPreference = useCallback((pref) => {
    setPreferenceState(pref);
    const next = resolveTheme(pref);
    setResolved(next);
    applyTheme(next);
    saveThemePreference(pref);
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
