import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const MapModeContext = createContext();

export const MapModeProvider = ({ children }) => {
  const [mode, setMode] = useState(() => {
    // Tenta carregar do localStorage de forma segura
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem('mapInteractionMode');
        if (saved === 'map' || saved === 'scroll') {
          return saved;
        }
      }
    } catch (e) {
      console.warn('Erro ao acessar localStorage:', e);
    }
    return 'map';
  });

  useEffect(() => {
    // Salva no localStorage de forma segura
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('mapInteractionMode', mode);
      }
    } catch (e) {
      console.warn('Erro ao salvar no localStorage:', e);
    }
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode(prev => {
      const newMode = prev === 'map' ? 'scroll' : 'map';
      console.log('[MapModeContext] Alternando modo:', prev, '->', newMode);
      return newMode;
    });
  }, []);

  const value = {
    mode,
    setMode,
    toggleMode,
  };

  return (
    <MapModeContext.Provider value={value}>
      {children}
    </MapModeContext.Provider>
  );
};

export const useMapModeToggle = () => {
  const context = useContext(MapModeContext);
  if (context === undefined) {
    throw new Error('useMapModeToggle must be used within a MapModeProvider');
  }
  return context;
};

