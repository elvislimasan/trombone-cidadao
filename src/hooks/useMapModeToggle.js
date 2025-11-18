import { useState, useEffect, useCallback } from 'react';

/**
 * Hook para gerenciar o modo de interação do mapa
 * 'map' = gestos verticais movem o mapa (pan)
 * 'scroll' = gestos verticais fazem scroll na página
 */
export const useMapModeToggle = (defaultMode = 'map') => {
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
      // Erro silencioso ao acessar localStorage
    }
    return defaultMode;
  });

  useEffect(() => {
    // Salva no localStorage de forma segura
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('mapInteractionMode', mode);
      }
    } catch (e) {
      // Erro silencioso ao salvar no localStorage
    }
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode(prev => {
      const newMode = prev === 'map' ? 'scroll' : 'map';
      return newMode;
    });
  }, []);

  return { mode, setMode, toggleMode };
};

