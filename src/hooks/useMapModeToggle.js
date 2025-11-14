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
      console.warn('Erro ao acessar localStorage:', e);
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
      console.warn('Erro ao salvar no localStorage:', e);
    }
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode(prev => {
      const newMode = prev === 'map' ? 'scroll' : 'map';
      console.log('[MapModeToggle] Alternando modo:', prev, '->', newMode);
      return newMode;
    });
  }, []);

  return { mode, setMode, toggleMode };
};

