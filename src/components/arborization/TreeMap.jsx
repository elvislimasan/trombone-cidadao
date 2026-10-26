import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, ScaleControl, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import { Crosshair } from 'lucide-react';
import L from 'leaflet';
import MapDisplayControls, { BOTAO_DE_MAPA, CurrentLocationMarker, MAP_LAYER, MapBaseLayer, MapLayerToggle } from '@/components/map/MapDisplayControls';
import MapResizeObserver from '@/components/map/MapResizeObserver';
import { geocodeCity } from '@/lib/geocodeCity';
import { TREE_MAP_STATES, treeMapMarkerKey, treeLabel } from '@/lib/arborization';
import TreeDetailsDialog from './TreeDetailsDialog';
import TreeMapLegend from './TreeMapLegend';
import 'leaflet/dist/leaflet.css';

const BRAZIL = [-14.2, -51.9];
const EMPTY_TREES = [];
const icons = Object.fromEntries(Object.entries(TREE_MAP_STATES).map(([status, { color }]) => [status, L.divIcon({
  className: 'tree-map-pin', iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -9],
  html: `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M9 2a7 7 0 1 0 0 14A7 7 0 0 0 9 2Z" fill="${color}" stroke="white" stroke-width="2"/></svg>`,
})]));
const draftIcon = L.divIcon({
  className: 'tree-map-draft', iconSize: [22, 22], iconAnchor: [11, 11],
  html: '<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="9" fill="#15803d" fill-opacity=".4" stroke="#14532d" stroke-width="2" stroke-dasharray="3 2"/><path d="M7 11h8m-4-4v8" stroke="white" stroke-width="2"/></svg>',
});
const existingTreeIcon = L.divIcon({
  className: 'tree-map-pin tree-map-existing', iconSize: [24, 24], iconAnchor: [12, 12],
  // O contorno duplo mantém o marcador legível sobre copas, telhados e ruas.
  html: '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10.5" fill="#0f172a" fill-opacity=".7"/><circle cx="12" cy="12" r="8.5" fill="#0891b2" fill-opacity=".9" stroke="white" stroke-width="2.5"/><path d="m8.5 12 2.3 2.3 4.7-4.6" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
});
const currentPointIcon = L.divIcon({
  className: 'tree-map-current-point', iconSize: [34, 34], iconAnchor: [17, 17],
  html: '<span class="tree-current-point-halo" aria-hidden="true"></span><span class="tree-current-point-dot" aria-hidden="true"></span>',
});
const selectedTreeIcon = L.divIcon({
  className: 'tree-map-pin tree-map-maintenance-selected', iconSize: [26, 26], iconAnchor: [13, 13],
  html: '<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg"><circle cx="13" cy="13" r="11" fill="#2563eb" stroke="white" stroke-width="2"/><path d="m8 13 3 3 7-7" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
});

function MapTools({ layer, onLayerChange, onReframe, picking, toolbar }) {
  const map = useMap();
  const mapRef = useMemo(() => ({ current: map }), [map]);
  const controlsRef = useRef(null);
  const toolbarRef = useRef(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const hasToolbar = Boolean(toolbar);
  useEffect(() => {
    // O Leaflet mantém o mesmo contêiner ao trocar o modo de cadastro.
    const node = map.getContainer();
    node.classList.toggle('tree-map-with-toolbar', hasToolbar);
    node.style.cursor = picking ? 'crosshair' : '';
  }, [map, hasToolbar, picking]);

  useEffect(() => {
    const node = controlsRef.current;
    L.DomEvent.disableClickPropagation(node);
    L.DomEvent.disableScrollPropagation(node);
    if (toolbarRef.current) {
      L.DomEvent.disableClickPropagation(toolbarRef.current);
      L.DomEvent.disableScrollPropagation(toolbarRef.current);
    }
  }, [hasToolbar]);

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

function MapController({ trees, city, selected, position, onPick, resetKey, initialView, onMapReady }) {
  const map = useMap();
  const initialViewApplied = useRef(false);
  useEffect(() => { onMapReady?.(map); return () => onMapReady?.(null); }, [map, onMapReady]);
  const picking = Boolean(onPick);
  useMapEvents({ click: event => onPick?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }) });
  useEffect(() => {
    if (picking) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [map, picking]);
  useEffect(() => {
    let cancelled = false;
    // O portal de tela cheia monta o Leaflet antes de anexar seu contêiner.
    // Aguarda o layout e invalida o tamanho antes de calcular o enquadramento.
    const frame = requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      // O cadastro mantém a área escolhida ao salvar um lote e atualizar as árvores.
      if (initialView && initialViewApplied.current && !position && !selected && !resetKey) return;
      initialViewApplied.current = true;
      if (position) map.setView([position.latitude, position.longitude], Math.max(map.getZoom(), 16), { animate: false });
      else if (selected) map.setView([selected.latitude, selected.longitude], 18, { animate: false });
      else if (initialView) map.setView(initialView.center, initialView.zoom, { animate: false });
      else if (trees.length) map.fitBounds(trees.map(tree => [tree.latitude, tree.longitude]), { padding: [35, 35], maxZoom: 17, animate: false });
      else if (city) {
        map.setView(BRAZIL, 4, { animate: false });
        geocodeCity(city.name, city.state?.uf).then(point => {
          if (!cancelled && point) map.setView([point.lat, point.lng], 14, { animate: false });
        });
      } else map.setView(BRAZIL, 4, { animate: false });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [map, trees, city, position, selected, resetKey, initialView]);
  return null;
}

export default function TreeMap({ trees = EMPTY_TREES, city, selected, onSelect, onDeselect, canManage = false, onEdit, onDelete, position, onPick, showLegend = false, toolbar, draftPoints = EMPTY_TREES, onRemoveDraft, initialView, onMapReady, selectedIds = EMPTY_TREES, initialLayer = MAP_LAYER.STANDARD, registrationMode = false }) {
  const [layer, setLayer] = useState(initialLayer);
  const [resetKey, setResetKey] = useState(0);
  const validTrees = useMemo(() => trees.filter(tree => Number.isFinite(Number(tree.latitude)) && Number.isFinite(Number(tree.longitude))), [trees]);
  const selection = useMemo(() => new Set(selectedIds), [selectedIds]);
  return (
    <MapContainer center={BRAZIL} zoom={4} zoomControl={false} doubleClickZoom={!onPick} scrollWheelZoom className={`tree-map-canvas h-full w-full ${toolbar ? 'tree-map-with-toolbar' : ''}`} style={{ minHeight: 'inherit', cursor: onPick ? 'crosshair' : undefined }}>
      <MapBaseLayer layer={layer} />
      <ZoomControl position="topright" />
      <ScaleControl position="bottomright" imperial={false} />
      <MapResizeObserver />
      <MapController trees={validTrees} city={city} selected={selected} position={position} onPick={onPick} resetKey={resetKey} initialView={initialView} onMapReady={onMapReady} />
      <MapTools layer={layer} onLayerChange={setLayer} picking={Boolean(onPick)} toolbar={toolbar} onReframe={() => { onDeselect?.(selected?.id); setResetKey(value => value + 1); }} />
      {validTrees.map(tree => <Marker key={tree.id} position={[tree.latitude, tree.longitude]} icon={registrationMode ? existingTreeIcon : selection.has(tree.id) ? selectedTreeIcon : icons[treeMapMarkerKey(tree)]} zIndexOffset={selection.has(tree.id) ? 1000 : 0}
        alt={treeLabel(tree)} title={registrationMode ? `Árvore já cadastrada: ${treeLabel(tree)}` : treeLabel(tree)} eventHandlers={{ click: () => onSelect?.(tree) }} />)}
      {position && <Marker position={[position.latitude, position.longitude]} icon={currentPointIcon} title="Localização desta árvore · Arraste para ajustar" zIndexOffset={1200} draggable={Boolean(onPick)} eventHandlers={{ dragend: event => { const point = event.target.getLatLng(); onPick?.({ latitude: point.lat, longitude: point.lng }); } }} />}
      {draftPoints.map((point, index) => <Marker key={`${point.latitude},${point.longitude}`} position={[point.latitude, point.longitude]} icon={draftIcon}
        title={`Ponto ${index + 1} · Clique para remover`} alt={`Ponto ${index + 1} ainda não salvo`} eventHandlers={{ click: () => onRemoveDraft?.(index) }} />)}
      <TreeDetailsDialog tree={selected} canManage={canManage} onClose={() => onDeselect?.(selected?.id)}
        onEdit={tree => { onDeselect?.(tree.id); onEdit?.(tree); }}
        onDelete={tree => { onDeselect?.(tree.id); onDelete?.(tree); }} />
      {showLegend && <TreeMapLegend />}
    </MapContainer>
  );
}
