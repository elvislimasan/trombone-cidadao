import React from 'react';
import { Button } from '@/components/ui/button';
import { Lock, Unlock } from 'lucide-react';
import { useMapModeToggle } from '@/contexts/MapModeContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Componente de botão toggle para alternar entre modo mapa e modo scroll
 */
const MapModeToggle = ({ className = '' }) => {
  const { mode, toggleMode } = useMapModeToggle();

  const tooltipText = mode === 'map' 
    ? 'Modo: Mover Mapa - Gestos verticais movem o mapa. Clique para alternar para modo Scroll.'
    : 'Modo: Scroll - Gestos verticais fazem scroll na página. Clique para alternar para modo Mover Mapa.';

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[MapModeToggle] Botão clicado, modo atual:', mode);
    toggleMode();
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            onClick={handleClick}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            variant="outline"
            size="sm"
            className={`bg-card/90 backdrop-blur-sm border-border shadow-lg hover:bg-card ${className}`}
          >
            {mode === 'map' ? (
              <>
                <Unlock className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Mover Mapa</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">Scroll</span>
              </>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <p className="text-xs">{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default MapModeToggle;

