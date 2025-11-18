import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Hook que gerencia interações do mapa baseado no modo selecionado
 * @param {string} mode - 'map' para mover o mapa, 'scroll' para fazer scroll na página
 */
export const useMapScrollLock = (mode = 'map') => {
  const map = useMap();
  const touchStartRef = useRef(null);
  const isScrollingRef = useRef(false);
  const timeoutRef = useRef(null);
  const isTouchDevice = useRef(false);
  const modeRef = useRef(mode);
  const mouseDownRef = useRef(null);

  useEffect(() => {
    // Atualiza a referência imediatamente
    modeRef.current = mode;
    
    // Atualiza interações imediatamente quando o modo muda
    const mapContainer = map.getContainer();
    if (!mapContainer) return;


    // Limpa qualquer timeout pendente
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Reseta estado de scroll
    isScrollingRef.current = false;

    if (mode === 'scroll') {
      // Força desabilitar todas as interações
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      mapContainer.classList.add('leaflet-scroll-locked');
    } else {
      // Força habilitar todas as interações
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      mapContainer.classList.remove('leaflet-scroll-locked');
    }
  }, [mode, map]);

  useEffect(() => {
    // Verifica se é dispositivo touch ou ambiente mobile (incluindo emuladores Android)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isCapacitor = window.Capacitor !== undefined;
    
    // Ativa em dispositivos touch, mobile ou Capacitor (inclui emuladores)
    isTouchDevice.current = hasTouch || isMobile || isCapacitor;

    if (!isTouchDevice.current) {
      return; // Não aplica em desktop real
    }

    const mapContainer = map.getContainer();
    if (!mapContainer) return;

    // Handlers para touch events - sempre lê o valor mais recente do mode
    const handleTouchStart = (e) => {
      if (e.touches.length === 1) {
        touchStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          time: Date.now()
        };
        isScrollingRef.current = false;
      }
    };

    const handleTouchMove = (e) => {
      if (!touchStartRef.current || e.touches.length !== 1) return;

      // Sempre lê o valor mais recente do modo
      const currentMode = modeRef.current;

      // Se estiver em modo 'scroll', sempre desabilita interações do mapa
      if (currentMode === 'scroll') {
        if (!isScrollingRef.current) {
          isScrollingRef.current = true;
          map.dragging.disable();
          map.touchZoom.disable();
          map.doubleClickZoom.disable();
          map.scrollWheelZoom.disable();
          mapContainer.classList.add('leaflet-scroll-locked');
        }
        return; // Permite que o scroll da página funcione
      }

      // Modo 'map' - permite interações normais do mapa
      if (isScrollingRef.current) {
        isScrollingRef.current = false;
        map.dragging.enable();
        map.touchZoom.enable();
        map.doubleClickZoom.enable();
        map.scrollWheelZoom.enable();
        mapContainer.classList.remove('leaflet-scroll-locked');
      }
    };

    const handleTouchEnd = () => {
      if (isScrollingRef.current) {
        // Reabilita interações após um pequeno delay para permitir que o scroll continue
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          const mapContainer = map.getContainer();
          // Verifica o modo atual antes de reabilitar
          if (mapContainer && isScrollingRef.current && modeRef.current === 'map') {
            map.dragging.enable();
            map.touchZoom.enable();
            map.doubleClickZoom.enable();
            map.scrollWheelZoom.enable();
            mapContainer.classList.remove('leaflet-scroll-locked');
            isScrollingRef.current = false;
          }
        }, 200);
      } else {
        // Se não estava em scroll, reabilita imediatamente
        touchStartRef.current = null;
      }
    };

    // Handlers para mouse events (para emuladores Android com mouse)
    const handleMouseDown = (e) => {
      // Só processa se for botão esquerdo e estiver em ambiente mobile
      if (e.button === 0 && isTouchDevice.current) {
        mouseDownRef.current = {
          x: e.clientX,
          y: e.clientY,
          time: Date.now()
        };
        touchStartRef.current = mouseDownRef.current;
        isScrollingRef.current = false;
      }
    };

    const handleMouseMove = (e) => {
      if (!mouseDownRef.current || !touchStartRef.current) return;

      const deltaX = Math.abs(e.clientX - mouseDownRef.current.x);
      const deltaY = Math.abs(e.clientY - mouseDownRef.current.y);
      const deltaTime = Date.now() - mouseDownRef.current.time;

      // Sempre lê o valor mais recente do modo
      const currentMode = modeRef.current;

      // Se estiver em modo 'scroll', sempre desabilita interações do mapa
      if (currentMode === 'scroll') {
        if (!isScrollingRef.current) {
          isScrollingRef.current = true;
          map.dragging.disable();
          map.touchZoom.disable();
          map.doubleClickZoom.disable();
          map.scrollWheelZoom.disable();
          mapContainer.classList.add('leaflet-scroll-locked');
        }
        return; // Permite que o scroll da página funcione
      }

      // Modo 'map' - permite interações normais do mapa
      if (isScrollingRef.current) {
        isScrollingRef.current = false;
        map.dragging.enable();
        map.touchZoom.enable();
        map.doubleClickZoom.enable();
        map.scrollWheelZoom.enable();
        mapContainer.classList.remove('leaflet-scroll-locked');
      }
    };

    const handleMouseUp = () => {
      if (mouseDownRef.current) {
        if (isScrollingRef.current) {
          // Reabilita interações após um pequeno delay
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = setTimeout(() => {
            const mapContainer = map.getContainer();
            // Verifica o modo atual antes de reabilitar
            if (mapContainer && isScrollingRef.current && modeRef.current === 'map') {
              map.dragging.enable();
              map.touchZoom.enable();
              map.doubleClickZoom.enable();
              map.scrollWheelZoom.enable();
              mapContainer.classList.remove('leaflet-scroll-locked');
              isScrollingRef.current = false;
            }
          }, 200);
        }
        mouseDownRef.current = null;
        touchStartRef.current = null;
      }
    };

    // Adiciona listeners no container do mapa
    // Touch events (dispositivos reais)
    mapContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
    mapContainer.addEventListener('touchmove', handleTouchMove, { passive: true });
    mapContainer.addEventListener('touchend', handleTouchEnd, { passive: true });
    mapContainer.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    
    // Mouse events (para emuladores Android com mouse)
    if (isTouchDevice.current) {
      mapContainer.addEventListener('mousedown', handleMouseDown);
      mapContainer.addEventListener('mousemove', handleMouseMove);
      mapContainer.addEventListener('mouseup', handleMouseUp);
      mapContainer.addEventListener('mouseleave', handleMouseUp);
    }

    // Cleanup
    return () => {
      mapContainer.removeEventListener('touchstart', handleTouchStart);
      mapContainer.removeEventListener('touchmove', handleTouchMove);
      mapContainer.removeEventListener('touchend', handleTouchEnd);
      mapContainer.removeEventListener('touchcancel', handleTouchEnd);
      mapContainer.removeEventListener('mousedown', handleMouseDown);
      mapContainer.removeEventListener('mousemove', handleMouseMove);
      mapContainer.removeEventListener('mouseup', handleMouseUp);
      mapContainer.removeEventListener('mouseleave', handleMouseUp);
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [map, mode]); // Recria os handlers quando o modo muda

  return null;
};

