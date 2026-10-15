import React, { useEffect, useMemo } from 'react';
import { MapContainer, Marker, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import ThemedTileLayer from '@/components/map/ThemedTileLayer';
import MapResizeObserver from '@/components/map/MapResizeObserver';
import { geocodeCity } from '@/lib/geocodeCity';
import { TREE_STATUS } from '@/lib/arborization';
import TreeDetailsDialog from './TreeDetailsDialog';
import TreeMapLegend from './TreeMapLegend';
import 'leaflet/dist/leaflet.css';

const BRAZIL = [-14.2, -51.9];
const EMPTY_TREES = [];
const icons = Object.fromEntries(Object.entries(TREE_STATUS).map(([status, { color }]) => [status, L.divIcon({
  className: 'tree-map-pin', iconSize: [30, 36], iconAnchor: [15, 34], popupAnchor: [0, -30],
  html: `<svg width="30" height="36" viewBox="0 0 30 36" xmlns="http://www.w3.org/2000/svg"><path d="M15 34V18" stroke="${color}" stroke-width="4" stroke-linecap="round"/><path d="M15 2C9 2 7 6 7 9c-6 2-6 12 0 14 4 2 6 0 8 0s4 2 8 0c6-2 6-12 0-14 0-3-2-7-8-7Z" fill="${color}" stroke="white" stroke-width="2"/></svg>`,
})]));

function MapController({ trees, city, selected, position, onPick }) {
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
  }, [map, trees, city, position, selected]);
  return null;
}

export default function TreeMap({ trees = EMPTY_TREES, city, selected, onSelect, onDeselect, canManage = false, onEdit, onDelete, position, onPick, showLegend = false }) {
  const validTrees = useMemo(() => trees.filter(tree => Number.isFinite(Number(tree.latitude)) && Number.isFinite(Number(tree.longitude))), [trees]);
  return (
    <MapContainer center={BRAZIL} zoom={4} zoomControl={false} scrollWheelZoom className="h-full w-full" style={{ minHeight: 'inherit', cursor: onPick ? 'crosshair' : undefined }}>
      <ThemedTileLayer />
      <ZoomControl position={showLegend ? 'topright' : 'bottomright'} />
      <MapResizeObserver />
      <MapController trees={validTrees} city={city} selected={selected} position={position} onPick={onPick} />
      {validTrees.map(tree => <Marker key={tree.id} position={[tree.latitude, tree.longitude]} icon={icons[tree.status] || icons.saudavel}
        alt={tree.common_name} title={tree.common_name} eventHandlers={{ click: () => onSelect?.(tree) }} />)}
      {position && <Marker position={[position.latitude, position.longitude]} icon={icons.saudavel} draggable eventHandlers={{ dragend: event => { const point = event.target.getLatLng(); onPick?.({ latitude: point.lat, longitude: point.lng }); } }} />}
      <TreeDetailsDialog tree={selected} canManage={canManage} onClose={() => onDeselect?.(selected?.id)}
        onEdit={tree => { onDeselect?.(tree.id); onEdit?.(tree); }}
        onDelete={tree => { onDeselect?.(tree.id); onDelete?.(tree); }} />
      {showLegend && <TreeMapLegend />}
    </MapContainer>
  );
}
