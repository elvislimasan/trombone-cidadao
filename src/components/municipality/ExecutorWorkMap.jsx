import React, { useEffect, useState } from 'react';
import { CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import MunicipalLightingMap from './MunicipalLightingMap';
import TreeDetailsDialog from '@/components/arborization/TreeDetailsDialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { loadCityTrees, treeLabel } from '@/lib/arborization';
import { carregarRuasDoMapa } from '@/lib/pavementMapData';

export default function ExecutorWorkMap({ items, activity, cityId, onSelect, compact = false, fullBleed = false, toolbar, loading = false }) {
  const [assets, setAssets] = useState({ key: '', items: [], error: '' });
  const [selection, setSelection] = useState(null);
  const scope = `${cityId}:${activity.id}`;
  useEffect(() => {
    let active = true;
    const load = activity.id === 'arborizacao' ? loadCityTrees(supabase, cityId)
      : activity.id === 'ruas' ? carregarRuasDoMapa(supabase, cityId) : Promise.resolve([]);
    load.then(rows => { if (active) setAssets({ key: scope, items: rows, error: '' }); })
      .catch(() => { if (active) setAssets({ key: scope, items: [], error: 'O inventário do mapa não pôde ser carregado. Os serviços continuam disponíveis na lista.' }); });
    return () => { active = false; };
  }, [cityId, activity.id, scope]);
  const current = assets.key === scope ? assets : { items: [], error: '' };
  const treePoints = activity.id === 'arborizacao' ? current.items.filter(tree => tree.status !== 'removida' && tree.latitude != null && tree.longitude != null && Number.isFinite(Number(tree.latitude)) && Number.isFinite(Number(tree.longitude))) : [];
  const servicesByTree = new Map();
  for (const item of items) {
    const id = item.tree_id || item.asset_tree_id;
    if (id) servicesByTree.set(String(id), [...(servicesByTree.get(String(id)) || []), item]);
  }
  const selectedTree = selection?.scope === scope ? treePoints.find(tree => String(tree.id) === selection.id) : null;
  const selectedServices = selectedTree ? servicesByTree.get(String(selectedTree.id)) || [] : [];
  const center = treePoints.length ? [treePoints[0].latitude, treePoints[0].longitude] : current.items.find(road => road.linhas?.length)?.linhas[0][0];
  const located = items.filter(item => item.latitude != null && item.longitude != null && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));
  const mapCenter = located.length ? [Number(located[0].latitude), Number(located[0].longitude)] : center || [-14.2, -51.9];
  const representedTrees = new Set(treePoints.map(tree => String(tree.id)));
  const legends = [{ label: 'Serviço atribuído', color: '#dc2626' }, { label: 'Disponível', color: '#eab308' }, ...(activity.id === 'arborizacao' ? [{ label: 'Árvore', color: '#16a34a' }] : activity.id === 'ruas' ? [{ label: 'Rua', color: '#64748b' }] : [])];
  return <section aria-label={activity.mapLabel} className={'electrician-lighting-map relative min-w-0 overflow-hidden ' + (fullBleed ? 'h-full min-h-0' : compact ? 'h-80 rounded-xl' : 'h-[68dvh] min-h-80 rounded-xl')}>
    <MunicipalLightingMap key={scope + ':' + mapCenter.join(',')} fullBleed center={mapCenter} items={located.map(item => ({ cluster_lat: Number(item.latitude), cluster_lng: Number(item.longitude), item_count: 1 }))} count={located.length} loading={loading} showCurrentLocation={!compact} mapLabel={activity.mapLabel} itemLabel="serviços" legendEntries={legends} animateZoom={false}>
      {located.filter(item => !representedTrees.has(String(item.tree_id || item.asset_tree_id))).map(item => <CircleMarker key={item.tipo + ':' + item.id} center={[Number(item.latitude), Number(item.longitude)]} radius={9} className="executor-service-marker" pathOptions={{ color: '#fff', weight: 2, fillColor: item.atribuido_a ? '#dc2626' : '#eab308', fillOpacity: 1 }} eventHandlers={{ click: () => onSelect?.(item) }}><Tooltip>{item.titulo} · {item.protocolo || 'Solicitação'}</Tooltip></CircleMarker>)}
      {treePoints.map(tree => {
        const services = servicesByTree.get(String(tree.id)) || [];
        const assigned = services.some(item => item.atribuido_a);
        const color = assigned ? '#dc2626' : services.length ? '#eab308' : '#16a34a';
        return <CircleMarker key={tree.id} center={[Number(tree.latitude), Number(tree.longitude)]} radius={services.length ? 9 : 6} className="executor-tree-marker" pathOptions={{ color: '#fff', fillColor: color, fillOpacity: 1, weight: 2 }} eventHandlers={{ click: () => setSelection({ scope, id: String(tree.id) }) }}><Tooltip>{treeLabel(tree)}{services.length ? ` · ${assigned ? 'Serviço atribuído' : 'Disponível'}` : ''}</Tooltip></CircleMarker>;
      })}
      {activity.id === 'ruas' && current.items.flatMap(road => (road.linhas || []).map((line, index) => <Polyline key={road.id + ':' + index} positions={line} pathOptions={{ color: '#64748b', weight: 4, opacity: 0.6 }}><Tooltip>{road.name || 'Rua sem nome'}</Tooltip></Polyline>))}
    </MunicipalLightingMap>
    {toolbar}
    <TreeDetailsDialog tree={selectedTree} canManage={false} onClose={() => setSelection(null)}>
      {selectedServices.length > 0 && <section aria-label="Serviços desta árvore" className="mt-4 space-y-2 border-t border-edge-subtle pt-4"><h3 className="text-sm font-bold">Serviços desta árvore</h3>{selectedServices.map(item => <div key={item.tipo + ':' + item.id} className="rounded-xl border border-edge-subtle p-3"><p className="text-sm font-semibold">{item.titulo}</p><p className={'mt-1 text-xs ' + (item.atribuido_a ? 'text-danger' : 'text-status-pendingFg')}>{item.atribuido_a ? 'Serviço atribuído' : 'Disponível para aceitar'}</p>{onSelect && <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => { setSelection(null); onSelect(item); }}>Abrir serviço</Button>}</div>)}</section>}
    </TreeDetailsDialog>
    {current.error && <p role="alert" className="absolute bottom-24 left-3 right-3 z-[1200] rounded-xl bg-surface-raised p-3 text-xs text-danger shadow-lg">{current.error}</p>}
  </section>;
}
