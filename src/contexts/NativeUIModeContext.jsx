import React, { createContext, useContext } from 'react';
import { Capacitor } from '@capacitor/core';

const NativeUIModeContext = createContext(null);

function platformMode() {
  const isNative = Capacitor.isNativePlatform();
  return {
    mode: 'default',
    isNative,
    isInteractive: false,
  };
}

export function NativeUIModeProvider({ children }) {
  // O cliente escolheu manter o cabeçalho clássico com menu hambúrguer também
  // no app. Preferências antigas não devem trocar o header após a abertura.
  return (
    <NativeUIModeContext.Provider value={platformMode()}>
      {children}
    </NativeUIModeContext.Provider>
  );
}

export function useNativeUIMode() {
  const ctx = useContext(NativeUIModeContext);
  return ctx || platformMode();
}

