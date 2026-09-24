import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Circle, CircleMarker, MapContainer, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import ThemedTileLayer from '@/components/map/ThemedTileLayer';
import { AGENCY_AREA_LEVELS, agencyAreaLevel, agencyAttentionAreas, agencyCasePoint, isAgencyCaseOverdue, isAgencyCaseOpen } from '@/lib/agencyCaseFilters';
import { agencyCaseStatus } from '@/lib/agencyPanel';

function Frame({ points, selected }) {
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

export function AgencyCaseLocationMap({ item }) {
  const point = agencyCasePoint(item);
  const points = useMemo(() => point ? [point] : [], [point?.[0], point?.[1]]);
  if (!point) return null;

  return <div className="relative z-0 h-80 w-full min-w-0 overflow-hidden rounded-xl border border-edge-subtle" aria-label="Localização desta bronca">
    <MapContainer center={point} zoom={16} className="h-full w-full" scrollWheelZoom={false}>
      <ThemedTileLayer />
      <Frame points={points} />
      <CircleMarker center={point} radius={9} pathOptions={{ color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }}>
        <Tooltip>{item.report?.title || 'Local da bronca'}</Tooltip>
        <Popup><strong>{item.report?.title || 'Bronca sem título'}</strong><p>{item.report?.address || 'Endereço não informado'}</p></Popup>
      </CircleMarker>
    </MapContainer>
  </div>;
}

export default function AgencyCasesMap({ cases, query = '', controls, loading = false }) {
  const [showAreas, setShowAreas] = useState(true);
  const [showPoints, setShowPoints] = useState(true);
  const [selected, setSelected] = useState(null);
  const located = useMemo(() => cases.map((item) => ({ item, point: agencyCasePoint(item) })).filter(({ point }) => point), [cases]);
  const points = useMemo(() => located.map(({ point }) => point), [located]);
  const areas = useMemo(() => agencyAttentionAreas(cases), [cases]);
  const missing = cases.length - located.length;
  useEffect(() => setSelected(null), [cases]);
  const backQuery = new URLSearchParams(query);
  backQuery.set('origem', 'mapa');

  return <section className="mt-5 space-y-4" aria-label="Mapa de demandas municipais">
    <div className="space-y-4 rounded-2xl border border-edge-subtle bg-surface-raised p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-bold">Onde concentrar o atendimento</h2><p className="mt-1 text-xs text-content-secondary">{located.length} demandas no mapa · {missing} sem localização válida · {cases.length} nos filtros</p></div>
        {controls}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-edge-subtle pt-3">
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={showAreas} onChange={(e) => setShowAreas(e.target.checked)} className="accent-red-600" />Concentração de demandas abertas</label>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} className="accent-red-600" />Mostrar pontos individuais</label>
      </div>
    </div>
    {loading ? <div role="status" className="flex min-h-56 items-center justify-center text-sm text-content-secondary">Carregando todas as demandas dos filtros…</div> : !points.length ? <div className="rounded-2xl border border-edge-subtle bg-surface-raised p-10 text-center text-content-secondary">Nenhuma demanda com localização válida nos filtros atuais. Consulte a lista ou altere os filtros.</div> :
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-3">
          <div className="relative z-0 h-[65dvh] min-h-96 overflow-hidden rounded-2xl border border-edge-subtle">
            <MapContainer center={points[0]} zoom={13} className="h-full w-full" scrollWheelZoom>
              <ThemedTileLayer />
              <Frame points={points} selected={selected} />
              {showAreas && [...areas].reverse().map((area) => {
                const level = agencyAreaLevel(area.count);
                return <Circle key={area.key} center={area.center} radius={250} pathOptions={{ color: level.color, fillColor: level.color, weight: selected?.key === area.key ? 3 : 1.5, fillOpacity: level.opacity }}><Tooltip>{area.label}: concentração {level.label.toLocaleLowerCase('pt-BR')} · {area.count} abertas · {area.overdue} atrasadas</Tooltip></Circle>;
              })}
              {showPoints && located.map(({ item, point }) => <CircleMarker key={item.report_id} center={point} radius={showAreas ? 5 : 7} pathOptions={{ color: '#fff', weight: 1.5, fillColor: isAgencyCaseOverdue(item) ? '#dc2626' : isAgencyCaseOpen(item) ? '#d97706' : '#64748b', fillOpacity: 1 }}>
                <Popup><div className="space-y-2"><strong>{item.report?.title || 'Bronca sem título'}</strong><p>{item.report?.address || 'Endereço não informado'}</p><p>{item.report?.category?.name} · {agencyCaseStatus(item).label}</p><p>{item.canal?.nome}</p><Link className="font-bold underline" to={`/prefeitura/broncas/${item.report_id}?${backQuery}`}>Abrir atendimento</Link></div></Popup>
              </CircleMarker>)}
            </MapContainer>
          <div className="pointer-events-none absolute bottom-7 left-3 z-[1000] max-w-[calc(100%_-_1.5rem)] rounded-xl border border-edge-subtle bg-surface-raised/85 px-3 py-2 shadow-sm backdrop-blur-md" aria-label="Legenda de concentração de demandas">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <h3 className="text-[11px] font-bold text-content-secondary">Concentração</h3>
              {AGENCY_AREA_LEVELS.map((level) => <div key={level.label} className="flex items-center gap-1.5 whitespace-nowrap text-[10px]"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: level.color }} /><span className="font-semibold">{level.label}</span><span className="text-content-tertiary">{level.range}</span></div>)}
            </div>
            <span className="sr-only">Sem cor significa que não há registro aberto localizado nos filtros atuais.</span>
          </div>
          </div>
        </div>
        <aside className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-4">
          <h3 className="text-sm font-black">Áreas com mais demandas abertas</h3>
          <p className="mt-2 text-xs leading-5 text-content-secondary">Concentração em setores de aproximadamente 500 m, conforme os filtros. Não representa limites de bairros nem gravidade.</p>
          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{areas.slice(0, 10).map((area, index) => <button key={area.key} type="button" onClick={() => setSelected(area)} className={`w-full rounded-xl border p-3 text-left transition-colors hover:bg-brand-subtleBg ${selected?.key === area.key ? 'border-brand bg-brand-subtleBg' : 'border-edge-subtle'}`}>
            <p className="text-xs font-bold">{index + 1}. {area.label}</p><p className="mt-2 flex items-center gap-2 text-xs font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: agencyAreaLevel(area.count).color }} />Concentração {agencyAreaLevel(area.count).label.toLocaleLowerCase('pt-BR')}</p><p className="mt-1 text-xs text-content-secondary">{area.count} abertas · {area.overdue} atrasadas</p><p className="mt-1 text-[11px] text-content-tertiary">Mais antiga: {area.oldestDays} dias</p>
          </button>)}{!areas.length && <p className="text-sm text-content-secondary">Nenhuma demanda aberta localizada.</p>}</div>
          <div className="mt-4 space-y-2 border-t border-edge-subtle pt-4 text-xs text-content-secondary"><p><span className="mr-2 inline-block h-2 w-2 rounded-full bg-red-600" />Prazo vencido</p><p><span className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-600" />Aberta, sem atraso registrado</p><p><span className="mr-2 inline-block h-2 w-2 rounded-full bg-slate-500" />Encerrada ou recusada</p></div>
        </aside>
      </div>}
  </section>;
}
