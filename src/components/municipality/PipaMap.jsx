import React, { useEffect, useRef, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import MapDisplayControls, { MAP_LAYER, MapBaseLayer } from '@/components/map/MapDisplayControls';
import { PIPA_PROVIDERS } from '@/lib/pipa';
import { PIPA_LEVELS } from '@/lib/pipaWaterLevel';
import { geocodeCity } from '@/lib/geocodeCity';
import { cityStateUf } from '@/lib/cityLocation';
import { supabase } from '@/lib/customSupabaseClient';
import 'leaflet/dist/leaflet.css';

const truck = L.divIcon({ className: 'pipa-truck-marker', iconSize: [42, 42], iconAnchor: [21, 21], html: '<div aria-label="Caminhão"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 5h13v12H1zM14 9h4l4 5v3h-8"/><circle cx="5" cy="18" r="2" fill="white"/><circle cx="18" cy="18" r="2" fill="white"/></svg></div>' });
function MapController({ tanks, selected, position, onPick, city, followPosition, pickZoom }) {
  const map = useMap();
  const boundsKey = tanks.map(t => `${t.id}:${t.latitude}:${t.longitude}`).join('|');
  const cityUf = cityStateUf(city);
  useMapEvents({ click: event => onPick?.(event.latlng) });
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize()); observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  useEffect(() => {
    let active = true;
    map.stop();
    if (selected && position) map.fitBounds([[position.lat, position.lng], [selected.latitude, selected.longitude]], { padding: [45, 45], maxZoom: 16, animate: false });
    else if (selected) map.setView([selected.latitude, selected.longitude], Math.max(map.getZoom(), pickZoom || 13), { animate: false });
    else {
      const fitTanks = () => { if (active && tanks.length) map.fitBounds(tanks.map(t => [t.latitude, t.longitude]), { padding: [35, 35], maxZoom: 13, animate: false }); };
      (async () => {
        // O workspace pode trazer apenas id, nome e state_id. Resolve a UF pelo
        // município da prefeitura, sem depender da cidade pública ativa no app.
        let targetCity = city;
        if (!cityUf && city?.id) {
          const { data, error } = await supabase.from('cities').select('id,name,states(uf)').eq('id', city.id).maybeSingle();
          if (error) throw error;
          if (data) targetCity = data;
        }
        const center = targetCity?.name ? await geocodeCity(targetCity.name, cityStateUf(targetCity)) : null;
        if (active && center) map.setView([center.lat, center.lng], 11, { animate: false });
        else fitTanks();
      })().catch(fitTanks);
    }
    return () => { active = false; };
  }, [map, boundsKey, city?.id, city?.name, cityUf, selected?.id, selected?.latitude, selected?.longitude, Boolean(position)]);
  useEffect(() => {
    if (followPosition && position) map.panTo([position.lat, position.lng], { animate: false });
  }, [map, followPosition, position?.lat, position?.lng]);
  return null;
}
export default function PipaMap({ tanks = [], selected, onSelect, requests = [], position, onPick, city, pointRadius = 11, showLegend = true, routeStops = [], selectedIds = [], followPosition = false, showPopups = true, levels, locationControls = false }) {
  const mapRef = useRef(null), [layer, setLayer] = useState(MAP_LAYER.STANDARD);
  const urgent = new Set(requests.filter(r => r.kind === 'urgent' && !['completed', 'cancelled'].includes(r.status)).map(r => r.tank_id));
  return <div className="pipa-map" data-testid="pipa-map">
    <MapContainer ref={mapRef} center={[-14.2, -51.9]} zoom={4} scrollWheelZoom className="h-full w-full" attributionControl>
      <MapBaseLayer layer={layer} />
      <MapController tanks={tanks} selected={selected} position={position} onPick={onPick} city={city} followPosition={followPosition} pickZoom={locationControls ? 17 : 13} />
      {tanks.map(t => <CircleMarker key={t.id} center={[t.latitude, t.longitude]} radius={selected?.id === t.id ? 12 : 9} pathOptions={{ color: selected?.id === t.id || selectedIds.includes(t.id) ? '#171717' : '#fff', weight: 3, fillColor: selectedIds.includes(t.id) ? '#941b1b' : urgent.has(t.id) ? '#dc2626' : levels ? (PIPA_LEVELS[levels.get(t.id)?.state || 'unknown'].color) : t.provider === 'exercito' ? '#15803d' : '#0284c7', fillOpacity: 1 }} eventHandlers={{ click: () => onSelect?.(t) }}>
        {routeStops.some(s => s.id === t.id) && <Tooltip permanent direction="top" className="pipa-stop-number">{routeStops.findIndex(s => s.id === t.id) + 1}</Tooltip>}
        {showPopups && <Popup><strong>{t.name}</strong><br />{t.locality}<br />{PIPA_PROVIDERS[t.provider]}{urgent.has(t.id) && <><br /><strong>Urgente · caixa seca</strong></>}{onSelect && <button className="pipa-map-select" onClick={() => onSelect(t)}>Selecionar caixa</button>}</Popup>}
      </CircleMarker>)}
      {routeStops.length > 1 && <Polyline positions={routeStops.map(t => [t.latitude, t.longitude])} pathOptions={{ color: '#941b1b', dashArray: '4 9', weight: 3, opacity: .6 }}><Tooltip>Ordem das paradas · ligações em linha reta</Tooltip></Polyline>}
      {selected && !tanks.some(t => t.id === selected.id) && <CircleMarker center={[selected.latitude, selected.longitude]} radius={pointRadius} pathOptions={{ color: pointRadius <= 5 ? '#fff' : '#0284c7', weight: 2, fillColor: '#0284c7', fillOpacity: 1 }} />}
      {position && <><Circle center={[position.lat, position.lng]} radius={Math.min(position.accuracy || 0, 1000)} pathOptions={{ color: '#0284c7', weight: 1, fillOpacity: 0.1 }} /><Marker icon={truck} position={[position.lat, position.lng]} />{selected && <Polyline positions={[[position.lat, position.lng], [selected.latitude, selected.longitude]]} pathOptions={{ color: '#0284c7', dashArray: '7 9', weight: 3 }} />}</>}
    </MapContainer>
    {locationControls && <MapDisplayControls mapRef={mapRef} layer={layer} onLayerChange={setLayer} onLocated={onPick} className="pipa-location-controls" />}
    {showLegend && <div className="pipa-map-legend">{levels ? <>{['empty','moderate','full','unknown'].map(state => <span key={state}><i style={{ background: PIPA_LEVELS[state].color }} />{state === 'empty' ? 'Baixa / urgente' : state === 'moderate' ? 'Moderada' : state === 'full' ? 'Cheia' : 'Sem estimativa'}</span>)}</> : <><span><i style={{ background: '#0284c7' }} />Prefeitura</span><span><i style={{ background: '#15803d' }} />Exército</span><span><i style={{ background: '#dc2626' }} />Urgente</span></>}</div>}
  </div>;
}
