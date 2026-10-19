import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export default function FullscreenMapPanel({ children, title = 'Mapa', className = '', buttonClassName = 'left-3 top-3', buttonLabel = 'Tela cheia', actions }) {
  const [expanded, setExpanded] = useState(false);
  const inlineRef = useRef(null);
  const [expandedHost, setExpandedHost] = useState(null);
  // Um destino estável mantém o mapa, o zoom e os rascunhos ao trocar de tela.
  const [mapMount] = useState(() => {
    if (typeof document === 'undefined') return null;
    const node = document.createElement('div');
    node.className = 'relative h-full w-full';
    return node;
  });
  useLayoutEffect(() => {
    // O portal do diálogo pode montar em um commit posterior à abertura.
    const destination = expanded ? expandedHost : inlineRef.current;
    if (!mapMount || !destination) return;
    destination.appendChild(mapMount);
    const frame = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => cancelAnimationFrame(frame);
  }, [expanded, expandedHost, mapMount]);
  return (
    <div className={`relative h-full w-full ${className}`}>
      <div ref={inlineRef} className="h-full w-full" />
      {mapMount ? createPortal(children, mapMount) : children}
      <Button type="button" size="sm" variant="outline"
        className={`absolute z-[850] gap-2 bg-background shadow-md ${buttonClassName}`}
        aria-label={`Expandir ${title.toLowerCase()} para tela cheia`} onClick={() => setExpanded(true)}>
        <Maximize2 className="h-4 w-4" /> {buttonLabel}
      </Button>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent hideClose aria-describedby={undefined}
          onInteractOutside={(event) => {
            // O portal está no diálogo no DOM, mas mantém a árvore React original.
            if (mapMount?.contains(event.detail.originalEvent.target)) event.preventDefault();
          }}
          className="!inset-0 !h-[100dvh] !w-full !max-w-none !translate-x-0 !translate-y-0 !rounded-none flex flex-col gap-0 border-0 p-0">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <DialogTitle>{title}</DialogTitle>
            <div className="flex flex-wrap items-center gap-2">
              {actions}
              <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(false)}>
                <Minimize2 className="mr-2 h-4 w-4" /> Sair da tela cheia
              </Button>
            </div>
          </div>
          <div ref={setExpandedHost} className="relative min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
