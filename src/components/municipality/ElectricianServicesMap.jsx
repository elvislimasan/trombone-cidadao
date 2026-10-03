import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { ArrowRight, Crosshair, Layers, LocateFixed, Maximize2, Minus, Navigation, Plus, X } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import ThemedTileLayer from '@/components/map/ThemedTileLayer';
import { Button } from '@/components/ui/button';
import { formatDistance } from '@/lib/electricianPanel';
import { compactPoleReference } from '@/lib/electricianPole';

const keyOf = (item) => `${item.tipo || 'ordem'}:${item.id}`;
const pointOf = (item) => {
  const lat = Number(item?.latitude); const lng = Number(item?.longitude);
  return item?.latitude != null && item?.longitude != null && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
};

function MapTools({ points, selected, hasSelection, onLocate, locating, satellite, setSatellite, expanded, setExpanded, fullBleed, showControls }) {
  const map = useMap();
  // Keep the viewport after a pan; refit only when the result coordinates change.
  const boundsKey = JSON.stringify(points);
  useEffect(() => { const bounds = JSON.parse(boundsKey); if (bounds.length) map.fitBounds(bounds, { padding: [45, 45], maxZoom: 17 }); }, [map, boundsKey]);
  useEffect(() => { if (selected) map.flyTo(selected, Math.max(map.getZoom(), 17), { duration: 0.5 }); }, [map, selected]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  if (!showControls) return null;
  const control = (fullBleed ? 'h-10 w-10 ' : 'h-11 w-11 ') + 'rounded-xl border border-edge-default bg-surface-raised text-content-primary shadow-md hover:bg-surface-subtle';
  return <div className={'absolute right-3 z-[1000] flex flex-col gap-2 ' + (fullBleed ? 'top-44 sm:top-3' : 'top-3') + (fullBleed && hasSelection ? ' hidden' : '')} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
    <button type="button" title="Aproximar" aria-label="Aproximar mapa" className={control} onClick={() => map.zoomIn()}><Plus className="mx-auto h-5 w-5" /></button>
    <button type="button" title="Afastar" aria-label="Afastar mapa" className={control} onClick={() => map.zoomOut()}><Minus className="mx-auto h-5 w-5" /></button>
    <button type="button" title="Ver todos os serviços" aria-label="Enquadrar todos os serviços" disabled={!points.length} className={control} onClick={() => { if (points.length) map.fitBounds(points, { padding: [45, 45], maxZoom: 17 }); }}><Crosshair className="mx-auto h-5 w-5" /></button>
    <button type="button" title="Minha localização" aria-label="Centralizar na minha localização" disabled={locating} className={control} onClick={onLocate}><LocateFixed className={'mx-auto h-5 w-5 ' + (locating ? 'animate-pulse' : '')} /></button>
    <button type="button" title={satellite ? 'Mapa de ruas' : 'Imagem de satélite'} aria-label={satellite ? 'Mostrar ruas' : 'Mostrar satélite'} aria-pressed={satellite} className={control + (satellite ? ' ring-2 ring-brand' : '')} onClick={() => setSatellite(!satellite)}><Layers className="mx-auto h-5 w-5" /></button>
    {!fullBleed && <button type="button" title={expanded ? 'Fechar mapa ampliado' : 'Ampliar mapa'} aria-label={expanded ? 'Fechar mapa ampliado' : 'Ampliar mapa'} className={control} onClick={() => setExpanded(!expanded)}>{expanded ? <X className="mx-auto h-5 w-5" /> : <Maximize2 className="mx-auto h-5 w-5" />}</button>}
  </div>;
}

export default function ElectricianServicesMap({ items, selectedId, onSelect, position, compact = false, fullBleed = false, loading = false, showControls = true }) {
  const [selectedKey, setSelectedKey] = useState(selectedId || null);
  const [satellite, setSatellite] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [ownPosition, setOwnPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [focusPoint, setFocusPoint] = useState(null);
  const frameRef = useRef(null);
  const located = useMemo(() => items.map((item) => ({ item, point: pointOf(item) })).filter(({ point }) => point), [items]);
  const points = useMemo(() => located.map(({ point }) => point), [located]);
  const myPoint = pointOf(ownPosition || position);
  const selected = items.find((item) => keyOf(item) === selectedKey);
  const select = (item) => { setSelectedKey(keyOf(item)); setFocusPoint(pointOf(item)); };
  useEffect(() => { if (selectedId) setSelectedKey(selectedId); }, [selectedId]);
  useEffect(() => {
    if (!expanded) return undefined;
    const escape = (event) => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', escape);
    frameRef.current?.focus();
    return () => document.removeEventListener('keydown', escape);
  }, [expanded]);
  const locate = () => {
    if (!navigator.geolocation) { setError('Localização indisponível neste aparelho.'); return; }
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setOwnPosition({ latitude: coords.latitude, longitude: coords.longitude });
      setFocusPoint([coords.latitude, coords.longitude]); setLocating(false);
    }, () => { setError('Permita o acesso à localização para encontrar sua posição.'); setLocating(false); }, { timeout: 10000, maximumAge: 60000 });
  };
  if (!points.length && !fullBleed) return <div className="rounded-2xl border border-edge-subtle bg-surface-raised p-5"><p className="font-semibold">Serviços sem posição no mapa</p><p className="mt-2 text-sm text-content-secondary">Consulte os endereços abaixo para abrir o atendimento.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{items.map((item) => <button key={keyOf(item)} type="button" onClick={() => onSelect?.(item)} className="rounded-xl border border-edge-subtle p-3 text-left text-sm"><strong>{compactPoleReference(item.titulo)}</strong><span className="mt-1 block text-content-secondary">{item.endereco || 'Endereço não informado'}</span></button>)}</div></div>;
  const destination = selected && pointOf(selected);
  return <div ref={frameRef} tabIndex={-1} aria-label="Mapa dos serviços de iluminação" className={expanded ? 'fixed inset-0 z-[9998] flex flex-col bg-surface-base p-3 outline-none' : fullBleed ? 'h-full min-h-0 min-w-0 outline-none' : 'min-w-0'}>
    <div className={'grid min-w-0 overflow-hidden bg-surface-raised ' + (expanded || fullBleed ? 'h-full' : compact ? 'h-80' : 'h-[72dvh] min-h-[420px]') + (fullBleed ? '' : ' rounded-2xl border border-edge-subtle') + (!compact && !fullBleed ? ' lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[23rem_minmax(0,1fr)]' : '')}>
      {!compact && !fullBleed && <aside className="hidden min-h-0 flex-col border-r border-edge-subtle lg:flex"><div className="border-b border-edge-subtle p-4"><h3 className="font-bold">{items.length} serviços nesta busca</h3><p className="mt-1 text-xs text-content-secondary">Selecione um serviço para ver no mapa.</p></div><div className="min-h-0 flex-1 overflow-y-auto p-2">{items.map((item) => <button key={keyOf(item)} type="button" onClick={() => select(item)} aria-pressed={selectedKey === keyOf(item)} className={'mb-1 block w-full rounded-xl border p-3 text-left transition-colors ' + (selectedKey === keyOf(item) ? 'border-brand bg-brand-subtleBg' : 'border-transparent hover:bg-surface-subtle')}><span className={'text-[11px] font-bold ' + (item.prioridade === 'urgente' ? 'text-danger' : 'text-content-tertiary')}>{item.prioridade === 'urgente' ? 'URGENTE · ' : ''}{item.protocolo || 'Solicitação'}</span><strong className="mt-1 block text-sm">{compactPoleReference(item.titulo)}</strong><span className="mt-1 block text-xs leading-5 text-content-secondary">{item.endereco || 'Endereço não informado'}</span>{!pointOf(item) && <span className="mt-1 block text-xs text-content-tertiary">Sem coordenadas</span>}</button>)}</div></aside>}
      <div className="relative isolate min-h-0 min-w-0">
        <MapContainer center={points[0] || myPoint || [-14.24, -51.92]} zoom={points.length || myPoint ? 14 : 4} zoomControl={false} className="h-full w-full" scrollWheelZoom>
          {satellite ? <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Tiles &copy; Esri" maxZoom={19} /> : <ThemedTileLayer />}
          <MapTools points={points} selected={focusPoint} hasSelection={Boolean(selected)} onLocate={locate} locating={locating} satellite={satellite} setSatellite={setSatellite} expanded={expanded} setExpanded={setExpanded} fullBleed={fullBleed} showControls={showControls} />
          {located.map(({ item, point }) => <CircleMarker key={keyOf(item)} center={point} radius={selectedKey === keyOf(item) ? 14 : 10} pathOptions={{ color: '#fff', weight: 3, fillColor: item.prioridade === 'urgente' ? '#dc2626' : item.status === 'em_andamento' ? '#2563eb' : '#bc2a55', fillOpacity: 1 }} eventHandlers={{ click: () => select(item) }}><Tooltip>{compactPoleReference(item.titulo)} · {item.protocolo || 'Solicitação'}</Tooltip></CircleMarker>)}
          {myPoint && <CircleMarker center={myPoint} radius={7} pathOptions={{ color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}><Tooltip>Você está aqui</Tooltip></CircleMarker>}
        </MapContainer>
        {!compact && !fullBleed && !selected && <div className="pointer-events-none absolute left-3 top-3 z-[1000] max-w-[calc(100%-5rem)] rounded-xl bg-surface-raised p-3 text-xs font-semibold shadow-md">Toque em um ponto para abrir o serviço{items.length > located.length && <span className="mt-1 block font-normal">{items.length - located.length} sem coordenadas · consulte a lista</span>}</div>}
        {fullBleed && !loading && !points.length && <div role="status" className="pointer-events-none absolute bottom-20 left-3 right-3 z-[1000] mx-auto max-w-sm rounded-xl bg-surface-raised/95 p-3 text-center text-sm font-semibold shadow-md">{items.length ? 'Estes serviços não têm localização no mapa. Consulte a lista.' : 'Nenhum serviço encontrado com estes filtros.'}</div>}
        {error && <p role="alert" className="absolute left-3 top-16 z-[1000] max-w-[calc(100%-5rem)] rounded-xl bg-surface-raised p-3 text-xs text-danger shadow-md">{error}</p>}
        {!compact && selected && <div className="absolute inset-x-3 bottom-7 z-[1000] rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-xl sm:right-auto sm:w-[min(26rem,calc(100%-5rem))]">
          <button type="button" aria-label="Fechar seleção" onClick={() => setSelectedKey(null)} className="absolute right-2 top-2 rounded-lg p-2 text-content-secondary"><X className="h-4 w-4" /></button><p className="pr-8 text-xs font-bold text-brand">{selected.protocolo || 'Solicitação de iluminação'}{selected.prioridade === 'urgente' && ' · Urgente'}</p><h3 className="mt-2 pr-5 font-bold">{compactPoleReference(selected.titulo)}</h3><p className="mt-1 text-sm text-content-secondary">{[selected.endereco, selected.bairro].filter(Boolean).join(' · ') || 'Endereço não informado'}</p>{selected.distancia_m != null && <p className="mt-1 text-xs text-content-secondary">{formatDistance(selected.distancia_m)} de você</p>}<div className="mt-3 flex gap-2">{destination && <Button asChild variant="outline"><a href={`https://www.google.com/maps/dir/?api=1&destination=${destination.join(',')}`} target="_blank" rel="noopener noreferrer"><Navigation className="mr-1.5 h-4 w-4" />Rota</a></Button>}{onSelect && <Button className="flex-1" onClick={() => { setExpanded(false); onSelect(selected); }}>Abrir serviço<ArrowRight className="ml-2 h-4 w-4" /></Button>}</div>
        </div>}
      </div>
    </div>
  </div>;
}
