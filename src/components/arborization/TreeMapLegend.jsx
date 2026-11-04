import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { TREE_MAP_STATES } from '@/lib/arborization';
import { Layers } from 'lucide-react';

export default function TreeMapLegend() {
  const legendRef = useRef(null);
  useEffect(() => {
    const node = legendRef.current;
    if (!node) return;
    L.DomEvent.disableClickPropagation(node);
    L.DomEvent.disableScrollPropagation(node);
  }, []);

  return <details ref={legendRef} aria-label="Legenda do mapa"
    className="arborization-map-legend absolute bottom-8 left-3 right-3 z-[800] w-fit max-w-[calc(100%-1.5rem)] overflow-x-auto overscroll-x-contain rounded-xl border border-edge-subtle bg-surface-raised/95 px-3 py-2.5 text-content-secondary shadow-sm backdrop-blur-sm">
    <summary><Layers size={14} /><span>Legenda</span><span className="arborization-legend-key"><i style={{ background: TREE_MAP_STATES.saudavel.color }} />Árvore cadastrada</span><span className="arborization-legend-key"><i style={{ background: TREE_MAP_STATES.planejada.color }} />Plantio planejado</span></summary>
    <ul>
      {Object.entries(TREE_MAP_STATES).map(([key, { label, color }]) => <li key={key} className="flex shrink-0 items-center gap-1.5">
        <span className="h-3 w-3 shrink-0 rounded-full border border-white shadow-sm" style={{ backgroundColor: color }} aria-hidden="true" />{label}
      </li>)}
    </ul>
  </details>;
}
