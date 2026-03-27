import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const STORAGE_KEY = 'tc_native_ui_mode';

const NativeUIModeContext = createContext(null);

export function NativeUIModeProvider({ children }) {
  const [mode, setModeState] = useState('default');
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    const load = async () => {
      try {
        if (isNative) {
          const { value } = await Preferences.get({ key: STORAGE_KEY });
          if (value === 'interactive' || value === 'default') {
            setModeState(value);
          }
          return;
        }
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === 'interactive' || raw === 'default') {
          setModeState(raw);
        }
      } catch {}
    };
    load();
  }, [isNative]);

  const setMode = useCallback(async (nextMode) => {
    if (nextMode !== 'interactive' && nextMode !== 'default') return;
    setModeState(nextMode);
    try {
      if (isNative) {
        await Preferences.set({ key: STORAGE_KEY, value: nextMode });
      } else {
        localStorage.setItem(STORAGE_KEY, nextMode);
      }
    } catch {}
  }, [isNative]);

  const value = useMemo(() => ({
    mode,
    setMode,
    isNative,
    isInteractive: isNative && mode === 'interactive',
  }), [isNative, mode, setMode]);

  return (
    <NativeUIModeContext.Provider value={value}>
      {children}
    </NativeUIModeContext.Provider>
  );
}

export function useNativeUIMode() {
  const ctx = useContext(NativeUIModeContext);
  if (!ctx) {
    const isNative = Capacitor.isNativePlatform();
    return { mode: 'default', setMode: async () => {}, isNative, isInteractive: false };
  }
  return ctx;
}

