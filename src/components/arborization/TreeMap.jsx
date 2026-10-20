import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, ScaleControl, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import { Crosshair } from 'lucide-react';
import L from 'leaflet';
import MapDisplayControls, { BOTAO_DE_MAPA, CurrentLocationMarker, MAP_LAYER, MapBaseLayer, MapLayerToggle } from '@/components/map/MapDisplayControls';
import MapResizeObserver from '@/components/map/MapResizeObserver';
import { geocodeCity } from '@/lib/geocodeCity';
import { TREE_MAP_STATES, treeMapMarkerKey } from '@/lib/arborization';
import TreeDetailsDialog from './TreeDetailsDialog';
import TreeMapLegend from './TreeMapLegend';
import 'leaflet/dist/leaflet.css';

const BRAZIL = [-14.2, -51.9];
const EMPTY_TREES = [];
const icons = Object.fromEntries(Object.entries(TREE_MAP_STATES).map(([status, { color }]) => [status, L.divIcon({
  className: 'tree-map-pin', iconSize: [30, 36], iconAnchor: [15, 34], popupAnchor: [0, -30],
  html: `<svg width="30" height="36" viewBox="0 0 30 36" xmlns="http://www.w3.org/2000/svg"><path d="M15 34V18" stroke="${color}" stroke-width="4" stroke-linecap="round"/><path d="M15 2C9 2 7 6 7 9c-6 2-6 12 0 14 4 2 6 0 8 0s4 2 8 0c6-2 6-12 0-14 0-3-2-7-8-7Z" fill="${color}" stroke="white" stroke-width="2"/></svg>`,
})]));

function MapTools({ layer, onLayerChange, onReframe, picking, toolbar }) {
  const map = useMap();
  const mapRef = useMemo(() => ({ current: map }), [map]);
  const controlsRef = useRef(null);
  const toolbarRef = useRef(null);
  const [currentLocation, setCurrentLocation] = useState(null);

  useEffect(() => {
    const node = controlsRef.current;
    L.DomEvent.disableClickPropagation(node);
    L.DomEvent.disableScrollPropagation(node);
    if (toolbarRef.current) {
      L.DomEvent.disableClickPropagation(toolbarRef.current);
      L.DomEvent.disableScrollPropagation(toolbarRef.current);
    }
  }, []);

  return <>
    <CurrentLocationMarker position={currentLocation} />
    {toolbar && <div ref={toolbarRef} className="arborization-map-toolbar absolute left-3 top-3 z-[850]">{toolbar}</div>}
    <div ref={controlsRef} className="tree-map-tools absolute right-3 top-24 z-[800] flex flex-col gap-2">
      {picking ? <MapLayerToggle layer={layer} onLayerChange={onLayerChange} /> : <>
        <MapDisplayControls mapRef={mapRef} layer={layer} onLayerChange={onLayerChange} onLocated={setCurrentLocation} />
        <button type="button" className={BOTAO_DE_MAPA} onClick={onReframe}
          aria-label="Reenquadrar árvores no mapa" title="Reenquadrar árvores no mapa">
          <Crosshair className="h-5 w-5" aria-hidden="true" />
        </button>
      </>}
    </div>
  </>;
}

function MapController({ trees, city, selected, position, onPick, resetKey }) {
  const map = useMap();
  useMapEvents({ click: event => onPick?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }) });
  useEffect(() => {
    let cancelled = false;
    // O portal de tela cheia monta o Leaflet antes de anexar seu contêiner.
    // Aguarda o layout e invalida o tamanho antes de calcular o enquadramento.
    const frame = requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      if (position) map.setView([position.latitude, position.longitude], Math.max(map.getZoom(), 16), { animate: false });
      else if (selected) map.setView([selected.latitude, selected.longitude], 18, { animate: false });
      else if (trees.length) map.fitBounds(trees.map(tree => [tree.latitude, tree.longitude]), { padding: [35, 35], maxZoom: 17, animate: false });
      else if (city) {
        map.setView(BRAZIL, 4, { animate: false });
        geocodeCity(city.name, city.state?.uf).then(point => {
          if (!cancelled && point) map.setView([point.lat, point.lng], 14, { animate: false });
        });
      } else map.setView(BRAZIL, 4, { animate: false });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [map, trees, city, position, selected, resetKey]);
  return null;
}

export default function TreeMap({ trees = EMPTY_TREES, city, selected, onSelect, onDeselect, canManage = false, onEdit, onDelete, position, onPick, showLegend = false, toolbar }) {
  const [layer, setLayer] = useState(MAP_LAYER.STANDARD);
  const [resetKey, setResetKey] = useState(0);
  const validTrees = useMemo(() => trees.filter(tree => Number.isFinite(Number(tree.latitude)) && Number.isFinite(Number(tree.longitude))), [trees]);
  return (
    <MapContainer center={BRAZIL} zoom={4} zoomControl={false} scrollWheelZoom className={`tree-map-canvas h-full w-full ${toolbar ? 'tree-map-with-toolbar' : ''}`} style={{ minHeight: 'inherit', cursor: onPick ? 'crosshair' : undefined }}>
      <MapBaseLayer layer={layer} />
      <ZoomControl position="topright" />
      <ScaleControl position="bottomright" imperial={false} />
      <MapResizeObserver />
      <MapController trees={validTrees} city={city} selected={selected} position={position} onPick={onPick} resetKey={resetKey} />
      <MapTools layer={layer} onLayerChange={setLayer} picking={Boolean(onPick)} toolbar={toolbar} onReframe={() => { onDeselect?.(selected?.id); setResetKey(value => value + 1); }} />
      {validTrees.map(tree => <Marker key={tree.id} position={[tree.latitude, tree.longitude]} icon={icons[treeMapMarkerKey(tree)]}
        alt={tree.common_name} title={tree.common_name} eventHandlers={{ click: () => onSelect?.(tree) }} />)}
      {position && <Marker position={[position.latitude, position.longitude]} icon={icons.saudavel} draggable eventHandlers={{ dragend: event => { const point = event.target.getLatLng(); onPick?.({ latitude: point.lat, longitude: point.lng }); } }} />}
      <TreeDetailsDialog tree={selected} canManage={canManage} onClose={() => onDeselect?.(selected?.id)}
        onEdit={tree => { onDeselect?.(tree.id); onEdit?.(tree); }}
        onDelete={tree => { onDeselect?.(tree.id); onDelete?.(tree); }} />
      {showLegend && <TreeMapLegend />}
    </MapContainer>
  );
}
