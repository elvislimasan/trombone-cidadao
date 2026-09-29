import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, ScaleControl, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Loader2, Maximize2, Minimize2, Search, SlidersHorizontal, X } from 'lucide-react';
import ThemedTileLayer from '@/components/map/ThemedTileLayer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { showAppError } from '@/lib/appError';

const COLORS = { aceso: '#16a34a', apagado: '#dc2626', manutencao: '#ca8a04', removido: '#64748b' };
const LABELS = { aceso: 'Aceso / funcionando', apagado: 'Apagado ou com problema', manutencao: 'Em manutenção', removido: 'Removido' };
const BOLT_SYMBOL = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m13.5 2-9 11h6l-1 9 10-12h-6l1-8z"/></svg>';
const poleIcons = Object.fromEntries(Object.entries(COLORS).map(([status, color]) => [status, L.divIcon({
  className: 'municipal-lighting-icon',
  html: `<span class="municipal-lighting-pin" style="--lighting-pin-color:${color}"></span>`,
  iconSize: [32, 32], iconAnchor: [16, 16],
})]));

export function lightingStatus(pole) {
  if (['removido', 'manutencao'].includes(pole.lighting_status)) return pole.lighting_status;
  return pole.is_broken || pole.lighting_status === 'apagado' ? 'apagado' : 'aceso';
}

function clusterIcon(item) {
  const total = Number(item.item_count).toLocaleString('pt-BR');
  const counts = [
    ['aceso', Number(item.aceso_count)],
    ['apagado', Number(item.apagado_count)],
    ['manutencao', Number(item.manutencao_count)],
    ['removido', Number(item.removido_count)],
  ].filter(([key, count]) => key === 'aceso' || key === 'apagado' || count > 0);
  const width = Math.max(70, 12 + counts.reduce((sum, [, count]) => sum + 10 + count.toLocaleString('pt-BR').length * 7, 0));
  const breakdown = counts.map(([key, count]) => `<span class="municipal-lighting-cluster-stat municipal-lighting-cluster-stat-${key}"><i></i>${count.toLocaleString('pt-BR')}</span>`).join('');
  return L.divIcon({
    className: 'municipal-lighting-icon',
    html: `<span class="municipal-lighting-cluster"><span class="municipal-lighting-cluster-title">${BOLT_SYMBOL}<strong>${total}</strong></span><span class="municipal-lighting-cluster-counts">${breakdown}</span></span>`,
    iconSize: [width, 48], iconAnchor: [width / 2, 24],
  });
}

function MapFrame({ onBounds, onPoint, focus, center }) {
  const map = useMap();
  const reportBounds = useCallback(() => {
    const bounds = map.getBounds();
    const size = map.getSize();
    onBounds({
      south: Math.max(-90, bounds.getSouth()),
      north: Math.min(90, bounds.getNorth()),
      west: Math.max(-180, bounds.getWest()),
      east: Math.min(180, bounds.getEast()),
      width: size.x,
      height: size.y,
      zoom: map.getZoom(),
    });
  }, [map, onBounds]);
  useMapEvents({ moveend: reportBounds, click: (event) => onPoint(event.latlng) });
  useEffect(() => { reportBounds(); }, [reportBounds]);
  useEffect(() => { if (focus) map.flyTo(focus, Math.max(map.getZoom(), 16)); }, [map, focus]);
  useEffect(() => {
    const observer = new ResizeObserver(() => { map.invalidateSize(); reportBounds(); });
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map, reportBounds]);
  return <button type="button" onClick={() => map.flyTo(center, 14)} aria-label="Voltar ao centro da cidade" className="absolute left-4 top-40 z-[500] flex h-9 w-9 items-center justify-center rounded-lg border border-edge-default bg-surface-raised text-content-primary shadow-md hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand"><Crosshair className="h-4 w-4" /></button>;
}

function LightingMarkers({ items, onSelect }) {
  const map = useMap();
  return items.filter((item) => Number.isFinite(item.cluster_lat) && Number.isFinite(item.cluster_lng)).map((item, index) => {
    if (Number(item.item_count) === 1 && item.pole) {
      const pole = item.pole;
      return <Marker key={`pole-${pole.id}`} position={[item.cluster_lat, item.cluster_lng]} icon={poleIcons[lightingStatus(pole)]} title={`Poste ${pole.identifier || pole.plate || pole.id} · ${LABELS[lightingStatus(pole)]}`} eventHandlers={{ click: () => onSelect(pole) }} />;
    }
    const zoomToCluster = () => {
      if (item.south !== item.north || item.west !== item.east) {
        map.fitBounds([[item.south, item.west], [item.north, item.east]], { padding: [64, 64], maxZoom: Math.min(map.getZoom() + 4, map.getMaxZoom()) });
      } else {
        map.flyTo([item.cluster_lat, item.cluster_lng], Math.min(map.getZoom() + 2, map.getMaxZoom()));
      }
    };
    const detail = [`${item.aceso_count} acesos`, `${item.apagado_count} apagados`, `${item.manutencao_count} em manutenção`, Number(item.removido_count) && `${item.removido_count} removidos`].filter(Boolean).join(', ');
    return <Marker key={`cluster-${index}`} position={[item.cluster_lat, item.cluster_lng]} icon={clusterIcon(item)} title={`${Number(item.item_count).toLocaleString('pt-BR')} postes · ${detail}. Clique para aproximar.`} eventHandlers={{ click: zoomToCluster }} />;
  });
}

export default function MunicipalLightingMap({ center, focus, items, selected, loading, count, search, onSearch, onBounds, onSelect, onPoint, placing, onCancelPlacing, onFilters }) {
  const frameRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === frameRef.current) await document.exitFullscreen();
      else await frameRef.current.requestFullscreen();
    } catch { showAppError({ title: 'Não foi possível ampliar o mapa', description: 'Tente novamente no seu navegador.' }); }
  };
  const located = items.filter((item) => Number.isFinite(item.cluster_lat) && Number.isFinite(item.cluster_lng));
  return <section aria-label="Mapa de iluminação pública" ref={frameRef} className="municipal-lighting-map relative isolate h-[58dvh] min-h-[26rem] min-w-0 overflow-hidden rounded-2xl border border-edge-default bg-surface-subtle shadow-sm xl:h-[calc(100dvh-20rem)] xl:min-h-[36rem]">
    {center ? <MapContainer center={center} zoom={center[0] === -14.2 && center[1] === -51.9 ? 4 : 14} zoomControl={false} className="h-full w-full" scrollWheelZoom>
      <ThemedTileLayer /><ZoomControl position="topleft" /><ScaleControl position="bottomright" imperial={false} />
      <MapFrame center={center} focus={focus} onBounds={onBounds} onPoint={onPoint} />
      {selected && Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude) && <CircleMarker center={[selected.latitude, selected.longitude]} radius={16} interactive={false} pathOptions={{ color: COLORS[lightingStatus(selected)], weight: 2, fillColor: COLORS[lightingStatus(selected)], fillOpacity: 0.18 }} />}
      <LightingMarkers items={located} onSelect={onSelect} />
    </MapContainer> : <div role="status" aria-label="Carregando mapa" className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>}
    <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] flex items-start justify-between gap-3">
      <div className="pointer-events-auto flex min-w-0 flex-1 items-center overflow-hidden rounded-xl border border-edge-default bg-surface-raised shadow-md sm:max-w-md"><label className="relative min-w-0 flex-1"><span className="sr-only">Buscar poste no mapa</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-content-secondary" /><Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Buscar endereço ou número do poste…" className="h-11 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-inset" /></label><Button variant="ghost" size="icon" aria-label="Abrir filtros do mapa" onClick={onFilters} className="mr-1 h-9 w-9 shrink-0 border-l border-edge-subtle text-content-secondary"><SlidersHorizontal className="h-4 w-4" /></Button></div>
      <Button variant="outline" size="icon" aria-label={fullscreen ? 'Sair da tela cheia' : 'Ampliar mapa'} onClick={toggleFullscreen} className="pointer-events-auto h-11 w-11 shrink-0 border-edge-default bg-surface-raised shadow-md">{fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
    </div>
    {placing && <div role="status" className="absolute inset-x-4 top-20 z-[600] flex items-center justify-between gap-3 rounded-xl border border-brand/30 bg-surface-raised p-3 text-sm shadow-lg"><span>Toque no mapa para posicionar o poste.</span><Button variant="ghost" size="icon" onClick={onCancelPlacing} aria-label="Cancelar escolha da localização"><X className="h-4 w-4" /></Button></div>}
    <div className="pointer-events-none absolute bottom-7 left-4 right-4 z-[500] sm:right-auto sm:max-w-[calc(100%_-_5rem)]">
      <div aria-label="Legenda do mapa" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-edge-subtle bg-surface-raised/95 px-3 py-2.5 text-[11px] text-content-secondary shadow-sm backdrop-blur-sm">{['aceso', 'apagado', 'manutencao', ...(items.some((item) => Number(item.removido_count) > 0 || item.pole?.lighting_status === 'removido') ? ['removido'] : [])].map((status) => <span key={status} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[status] }} />{status === 'apagado' ? 'Apagado / problema' : LABELS[status]}</span>)}</div>
      <p role="status" className="mt-2 w-fit rounded-md bg-surface-raised/95 px-2 py-1 text-[10px] text-content-secondary shadow-sm">{loading ? 'Carregando postes…' : `${Number(count).toLocaleString('pt-BR')} postes na área · ${located.length.toLocaleString('pt-BR')} marcadores`}{located.some((item) => Number(item.item_count) > 1) && ' · Clique nos grupos para aproximar'}</p>
    </div>
  </section>;
}
