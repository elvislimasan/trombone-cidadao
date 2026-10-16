import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { TREE_STATUS } from '@/lib/arborization';

export default function TreeMapLegend() {
  const legendRef = useRef(null);
  useEffect(() => {
    const node = legendRef.current;
    if (!node) return;
    L.DomEvent.disableClickPropagation(node);
    L.DomEvent.disableScrollPropagation(node);
  }, []);

  return <section ref={legendRef} aria-label="Legenda do mapa"
    className="absolute bottom-14 left-3 right-3 z-[800] w-fit max-w-[calc(100%-1.5rem)] overflow-x-auto overscroll-x-contain rounded-xl border border-edge-subtle bg-surface-raised/95 px-2.5 py-2 text-content-secondary shadow-sm backdrop-blur-sm">
    <ul className="flex w-max items-center gap-2 whitespace-nowrap text-[10px] sm:gap-4 sm:text-[11px]">
      {Object.entries(TREE_STATUS).map(([key, { label, color }]) => <li key={key} className="flex shrink-0 items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />{label}
      </li>)}
    </ul>
  </section>;
}
