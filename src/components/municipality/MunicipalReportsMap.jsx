import React, { useEffect, useMemo, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import ThemedTileLayer from '@/components/map/ThemedTileLayer';
import { AGENCY_AREA_LEVELS, agencyAreaLevel } from '@/lib/agencyCaseFilters';
import { supabase } from '@/lib/customSupabaseClient';
import { loadPendingMapReports } from '@/lib/municipalReports';

function MapFrame({ points, selected }) {
  const map = useMap();
  useEffect(() => { if (points.length) map.fitBounds(points, { padding: [35, 35], maxZoom: 16 }); }, [map, points]);
  useEffect(() => { if (selected) map.flyTo(selected.center, 16); }, [map, selected]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function groupAreas(reports) {
  const groups = new Map();
  for (const report of reports) {
    const [lat, lng] = report.point;
    const latCell = Math.floor(lat * 111320 / 500);
    const latitude = (latCell + 0.5) * 500 / 111320;
    const factor = Math.max(0.01, Math.cos(latitude * Math.PI / 180));
    const lngCell = Math.floor(lng * 111320 * factor / 500);
    const key = `${latCell}:${lngCell}`;
    const group = groups.get(key) || { key, center: [latitude, (lngCell + 0.5) * 500 / (111320 * factor)], count: 0, oldestDays: 0, neighborhoods: new Set() };
    group.count += 1;
    const days = Math.floor((Date.now() - new Date(report.created_at).getTime()) / 86400000);
    if (Number.isFinite(days)) group.oldestDays = Math.max(group.oldestDays, days);
    if (report.neighborhood) group.neighborhoods.add(report.neighborhood);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, label: [...group.neighborhoods].join(' / ') || 'Área sem bairro informado' }))
    .sort((a, b) => b.count - a.count || b.oldestDays - a.oldestDays);
}

export default function MunicipalReportsMap({ cityId, municipalityId, revision, onSelect }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAreas, setShowAreas] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    if (!cityId || !municipalityId) return undefined;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError('');
      try {
        const all = await loadPendingMapReports(supabase, { cityId, municipalityId, signal: controller.signal });
        if (!controller.signal.aborted) setReports(all);
      } catch (cause) { if (!controller.signal.aborted) setError(cause.message); }
      if (!controller.signal.aborted) setLoading(false);
    })();
    return () => controller.abort();
  }, [cityId, municipalityId, revision]);
  const located = useMemo(() => reports.map((report) => {
    const [lng, lat] = report.location?.coordinates || [];
    return { ...report, point: Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null };
  }).filter((report) => report.point), [reports]);
  const points = useMemo(() => located.map((report) => report.point), [located]);
  const areas = useMemo(() => groupAreas(located), [located]);
  if (loading) return <p className="mt-6 text-sm text-content-secondary">Carregando solicitações no mapa…</p>;
  if (error) return <p role="alert" className="mt-6 text-sm text-red-700">{error}</p>;
  return <section className="mt-5 space-y-4" aria-label="Mapa de solicitações da cidade">
    <div className="space-y-4 rounded-2xl border border-edge-subtle bg-surface-raised p-4">
      <div><h2 className="font-bold">Onde estão as solicitações pendentes</h2><p className="mt-1 text-xs text-content-secondary">{located.length} no mapa · {reports.length - located.length} sem localização · {reports.length} pendentes</p></div>
      <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-edge-subtle pt-3"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={showAreas} onChange={(event) => setShowAreas(event.target.checked)} className="accent-red-600" />Concentração de solicitações abertas</label><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={showPoints} onChange={(event) => setShowPoints(event.target.checked)} className="accent-red-600" />Mostrar solicitações individuais</label></div>
    </div>
    {!points.length ? <p className="rounded-2xl border border-edge-subtle bg-surface-raised p-10 text-center text-sm text-content-secondary">Nenhuma solicitação com localização nesta cidade.</p> : <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0"><div className="relative z-0 h-[65dvh] min-h-96 overflow-hidden rounded-2xl border border-edge-subtle"><MapContainer center={points[0]} zoom={13} className="h-full w-full" scrollWheelZoom><ThemedTileLayer /><MapFrame points={points} selected={selected} />
        {showAreas && [...areas].reverse().map((area) => { const level = agencyAreaLevel(area.count); return <Circle key={area.key} center={area.center} radius={250} pathOptions={{ color: level.color, fillColor: level.color, weight: selected?.key === area.key ? 3 : 1.5, fillOpacity: level.opacity }}><Tooltip>{area.label} · {area.count} abertas</Tooltip></Circle>; })}
        {showPoints && located.map((report) => <CircleMarker key={report.id} center={report.point} radius={showAreas ? 5 : 7} pathOptions={{ color: '#fff', weight: 1.5, fillColor: '#d97706', fillOpacity: 1 }}><Popup><div className="space-y-2"><strong>{report.title || 'Solicitação sem título'}</strong><p>{report.address || 'Endereço não informado'}</p><p>{report.category?.name || 'Sem categoria'}</p><button type="button" onClick={() => onSelect(report.id)} className="font-bold text-brand underline">Consultar solicitação</button></div></Popup></CircleMarker>)}
      </MapContainer><div className="pointer-events-none absolute bottom-7 left-3 z-[1000] max-w-[calc(100%_-_1.5rem)] rounded-xl border border-edge-subtle bg-surface-raised/90 px-3 py-2 shadow-sm backdrop-blur-md" aria-label="Legenda de concentração"><div className="flex flex-wrap items-center gap-x-4 gap-y-1.5"><h3 className="text-[11px] font-bold text-content-secondary">Concentração</h3>{AGENCY_AREA_LEVELS.map((level) => <div key={level.label} className="flex items-center gap-1.5 whitespace-nowrap text-[10px]"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: level.color }} /><span className="font-semibold">{level.label}</span><span className="text-content-tertiary">{level.range}</span></div>)}</div></div></div></div>
      <aside className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-4"><h3 className="text-sm font-black">Áreas com mais solicitações abertas</h3><p className="mt-2 text-xs leading-5 text-content-secondary">Concentração em setores de cerca de 500 m. Não representa limites de bairros nem gravidade.</p><div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{areas.slice(0, 10).map((area, index) => <button key={area.key} type="button" onClick={() => setSelected(area)} className={`w-full rounded-xl border p-3 text-left transition-colors hover:bg-brand-subtleBg ${selected?.key === area.key ? 'border-brand bg-brand-subtleBg' : 'border-edge-subtle'}`}><p className="text-xs font-bold">{index + 1}. {area.label}</p><p className="mt-2 text-xs font-semibold">{area.count} abertas · {agencyAreaLevel(area.count).label}</p><p className="mt-1 text-[11px] text-content-tertiary">Mais antiga: {area.oldestDays} dias</p></button>)}{!areas.length && <p className="text-sm text-content-secondary">Nenhuma solicitação aberta localizada.</p>}</div><div className="mt-4 space-y-2 border-t border-edge-subtle pt-4 text-xs text-content-secondary"><p><span className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-600" />Solicitação aberta</p></div></aside>
    </div>}
  </section>;
}
