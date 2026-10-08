import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { MapContainer, Marker, Polygon, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Download, Loader2, MousePointer2, Plus, Redo2, Spline, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MAP_LAYER, MapBaseLayer, MapLayerToggle } from '@/components/map/MapDisplayControls';
import { geocodeCity } from '@/lib/geocodeCity';
import { boundaryPoints, boundaryValidationError, neighborhoodColor } from '@/lib/neighborhoodBoundary';
import { boundaryEditorReducer, createBoundaryEditor, curveBoundarySegment } from '@/lib/neighborhoodBoundaryEditing';
import { fetchNeighborhoodCandidates, neighborhoodSourceUrl } from '@/lib/neighborhoodBoundaryImport';
import NeighborhoodBoundaryAttribution from './NeighborhoodBoundaryAttribution';

const vertexIcon = L.divIcon({
  className: 'bairro-vertice',
  html: '<span style="display:flex;width:28px;height:28px;align-items:center;justify-content:center"><i style="width:14px;height:14px;border-radius:50%;background:#ea580c;border:2px solid white;box-shadow:0 1px 4px #0008"></i></span>',
  iconSize: [28, 28], iconAnchor: [14, 14],
});

const selectedVertexIcon = L.divIcon({
  className: 'bairro-vertice bairro-vertice-selecionado',
  html: '<span style="display:flex;width:28px;height:28px;align-items:center;justify-content:center"><i style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 2px #2563eb,0 1px 4px #0008"></i></span>',
  iconSize: [28, 28], iconAnchor: [14, 14],
});

const segmentIcon = (curve) => L.divIcon({
  className: curve ? 'bairro-curva' : 'bairro-inserir-ponto',
  html: `<span style="display:flex;width:24px;height:24px;align-items:center;justify-content:center;border-radius:${curve ? '50%' : '6px'};background:white;border:2px solid ${curve ? '#7c3aed' : '#ea580c'};color:${curve ? '#7c3aed' : '#ea580c'};font-size:20px;line-height:1;box-shadow:0 1px 4px #0004">${curve ? '⌒' : '+'}</span>`,
  iconSize: [24, 24], iconAnchor: [12, 12],
});
const insertIcon = segmentIcon(false), curveIcon = segmentIcon(true);

function SegmentHandles({ points, mode, saving, onInsert, onCurve, onPreview, dragged }) {
  const map = useMap();
  const [zoom, updateZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => updateZoom(map.getZoom()) });
  const curve = mode === 'curve';
  const handles = useMemo(() => points.slice(0, points.length > 2 ? points.length : points.length - 1).map((a, index) => {
    const b = points[(index + 1) % points.length];
    const start = map.project([a[1], a[0]], zoom), end = map.project([b[1], b[0]], zoom);
    return start.distanceTo(end) < 48 ? null : map.unproject(start.add(end).divideBy(2), zoom);
  }), [map, points, zoom]);
  return handles.map((midpoint, index) => {
    if (!midpoint) return null;
    const preview = (event) => {
      const p = event.target.getLatLng(), point = [p.lng, p.lat];
      onPreview(curve ? curveBoundarySegment(points, index, point)
        : [...points.slice(0, index + 1), point, ...points.slice(index + 1)]);
    };
    return <Marker key={`${mode}-${index}`} position={midpoint} icon={curve ? curveIcon : insertIcon}
      title={curve ? `Arraste para curvar o trecho ${index + 1}` : `Inserir ponto no trecho ${index + 1}`}
      draggable={!saving} bubblingMouseEvents={false} eventHandlers={{
        dragstart: () => { dragged.current = Infinity; },
        drag: preview,
        dragend: (event) => {
          const p = event.target.getLatLng();
          onPreview(null);
          if (curve) onCurve(index, [p.lng, p.lat]);
          else onInsert(index, [p.lng, p.lat]);
          dragged.current = Date.now() + 300;
        },
        click: (event) => {
          L.DomEvent.stopPropagation(event.originalEvent);
          if (!saving && Date.now() > dragged.current && !curve) onInsert(index, [midpoint.lng, midpoint.lat]);
        },
      }} />;
  });
}

function MapClicks({ onClick }) {
  useMapEvents({ click: (event) => onClick([event.latlng.lng, event.latlng.lat]) });
  return null;
}

function InitialViewport({ points, center }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points.map(([lng, lat]) => [lat, lng]), { padding: [32, 32], maxZoom: 17, animate: false });
    else map.setView([center.lat, center.lng], 15, { animate: false });
    // Os pontos iniciais são fixos; desenhar e arrastar não deve mover a câmera.
  }, [map, points, center]);
  return null;
}

function BoundaryDraft({ bairro, previous, streets, boundaries, city, onSave, onClose }) {
  const initialPoints = useRef(boundaryPoints(previous?.boundary)).current;
  const [editor, dispatch] = useReducer(boundaryEditorReducer, { points: initialPoints, source: previous?.source }, createBoundaryEditor);
  const { points, selected, mode, direction, source } = editor;
  const markerPositions = useMemo(() => points.map(([lng, lat]) => [lat, lng]), [points]);
  const [previewPoints, setPreviewPoints] = useState(null);
  const visiblePoints = previewPoints || points;
  const [color, setColor] = useState(neighborhoodColor(previous?.color));
  const [layer, setLayer] = useState(MAP_LAYER.STANDARD);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const queryAbort = useRef(null);
  const [center, setCenter] = useState(null);
  const [centerError, setCenterError] = useState(false);
  const dragged = useRef(0);
  const [viewportPoints, setViewportPoints] = useState(() => initialPoints.length ? initialPoints : streets
    .filter((street) => String(street.bairro_id) === String(bairro.id))
    .flatMap((street) => street.linhas?.flat()?.map(([lat, lng]) => [lng, lat]) || []));

  useEffect(() => () => queryAbort.current?.abort(), []);
  const edit = (action) => { if (!saving) { dispatch(action); setError(null); } };
  useEffect(() => {
    const shortcut = (event) => {
      if (saving || !(event.ctrlKey || event.metaKey) || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
      const key = event.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        event.preventDefault();
        dispatch({ type: key === 'y' || event.shiftKey ? 'redo' : 'undo' });
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [saving]);
  const search = async () => {
    const controller = new AbortController();
    queryAbort.current = controller;
    setSearching(true);
    setSearchResult(null);
    setError(null);
    try {
      const sourceName = source?.provider === 'osm' && source.source_name;
      const result = await fetchNeighborhoodCandidates({ city, bairroName: sourceName || bairro.name, signal: controller.signal });
      if (!controller.signal.aborted) setSearchResult(result);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause.message || 'Não foi possível consultar a fonte de bairros.');
    } finally { if (!controller.signal.aborted) setSearching(false); }
  };
  const previewCandidate = (candidate) => {
    edit({ type: 'import', points: candidate.points, source: candidate.source });
    setViewportPoints(candidate.points);
    setSearchResult(null);
    setError(null);
  };
  const sourceUrl = neighborhoodSourceUrl(source);
  const formatDate = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('pt-BR') : 'não informada';

  useEffect(() => {
    let cancelled = false;
    const point = viewportPoints[0];
    const street = streets.find((item) => item.location && String(item.bairro_id) === String(bairro.id))
      || streets.find((item) => item.location);
    if (point || street) {
      setCenter(point ? { lat: point[1], lng: point[0] } : street.location);
      return undefined;
    }
    geocodeCity(city.name, city.state?.uf || '').then((result) => {
      if (!cancelled) { setCenter(result); setCenterError(!result); }
    }).catch(() => { if (!cancelled) setCenterError(true); });
    return () => { cancelled = true; };
  }, [bairro.id, city, streets, viewportPoints]);

  const validationError = boundaryValidationError(points);
  const activeNeighbor = selected == null || points.length < 2 ? null
    : (selected + (direction === 'after' ? 1 : points.length - 1)) % points.length;
  const removing = points.length === 0 && Boolean(previous);
  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ bairro, points, color, previous, removing, source });
      onClose();
    } catch (cause) {
      setError(cause.message || 'Não foi possível salvar o contorno. Tente novamente.');
    } finally { setSaving(false); }
  };

  return <>
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm font-semibold" htmlFor="bairro-contorno-cor">
        Cor do bairro
        <input id="bairro-contorno-cor" type="color" value={color} disabled={saving} onChange={(event) => setColor(event.target.value)} className="h-9 w-12 cursor-pointer rounded border border-edge-subtle" />
      </label>
      <Button type="button" size="sm" variant="outline" disabled={saving || !editor.past.length} onClick={() => edit({ type: 'undo' })} title="Ctrl+Z"><Undo2 className="mr-2 h-4 w-4" />Desfazer</Button>
      <Button type="button" size="sm" variant="outline" disabled={saving || !editor.future.length} onClick={() => edit({ type: 'redo' })} title="Ctrl+Shift+Z"><Redo2 className="mr-2 h-4 w-4" />Refazer</Button>
      <Button type="button" size="sm" variant="outline" disabled={saving || selected == null} onClick={() => edit({ type: 'remove' })}><Trash2 className="mr-2 h-4 w-4" />Remover ponto</Button>
      <Button type="button" size="sm" variant="outline" disabled={saving || !points.length} onClick={() => edit({ type: 'clear' })}><Trash2 className="mr-2 h-4 w-4" />Limpar desenho</Button>
      <Button type="button" size="sm" variant="outline" disabled={saving || searching} onClick={search}>{searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}{searching ? 'Consultando bairros…' : 'Buscar contorno atualizado'}</Button>
    </div>
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ferramentas de traçado">
      {[['edit', 'Editar pontos', MousePointer2], ['add', 'Continuar traçado', Plus], ['curve', 'Curvar trecho', Spline]].map(([value, label, Icon]) =>
        <Button key={value} type="button" size="sm" variant={mode === value ? 'default' : 'outline'} aria-pressed={mode === value} disabled={saving} onClick={() => edit({ type: 'mode', mode: value })}><Icon className="mr-2 h-4 w-4" />{label}</Button>)}
      {mode === 'add' && selected != null && <label className="flex items-center gap-2 text-sm">
        Inserir
        <select aria-label="Direção do traçado" value={direction} disabled={saving} onChange={(event) => edit({ type: 'direction', direction: event.target.value })} className="h-9 rounded-md border border-edge-subtle bg-background px-2">
          <option value="after">Depois do ponto {selected + 1}</option>
          <option value="before">Antes do ponto {selected + 1}</option>
        </select>
      </label>}
    </div>
    <p className="text-sm text-content-secondary" aria-live="polite">
      {mode === 'edit' ? 'Arraste os pontos para ajustar. Clique em + ou no contorno para inserir um ponto. Clique em um pino para selecioná-lo.'
        : mode === 'curve' ? 'Arraste a alça roxa no meio de um trecho para criar uma curva. A prévia acompanha o arraste; solte para aplicar.'
          : 'Selecione o ponto de partida e clique no mapa para continuar o traçado. Cada clique segue a partir do novo ponto, na direção escolhida.'}
      {selected != null && ` Ponto ${selected + 1} selecionado em azul.`}
    </p>
    {searchResult && <div className="grid gap-2 rounded-xl border border-edge-subtle bg-surface-subtle p-3 text-sm" aria-live="polite">
      {searchResult.candidates.length ? <>
        <p>Contornos encontrados para {bairro.name}, por data de atualização. Pré-visualize antes de salvar.</p>
        {searchResult.candidates.map((candidate) => <div key={`${candidate.source.object_type}-${candidate.source.object_id}`} className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0">{candidate.name} · atualizado em {formatDate(candidate.source.object_updated_at)}</p>
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => previewCandidate(candidate)}>Pré-visualizar contorno</Button>
        </div>)}
      </> : <p>{searchResult.rejected[0] || 'Não há um contorno de área disponível para este bairro no OpenStreetMap. Você pode desenhar o limite manualmente.'}</p>}
      <p className="text-xs text-content-secondary">OpenStreetMap · base atualizada em {formatDate(searchResult.baseUpdatedAt)}. © OpenStreetMap contributors, ODbL.</p>
    </div>}
    {sourceUrl && <p className="text-xs leading-5 text-content-secondary">
      Fonte: <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline">OpenStreetMap</a> · traçado atualizado em {formatDate(source.object_updated_at)} · base atualizada em {formatDate(source.base_updated_at)}.
      {source.modified ? ' Com ajustes locais.' : ' Confira a área no mapa antes de salvar.'} © OpenStreetMap contributors, ODbL.
    </p>}
    {source?.reference_type === 'pdf' && <p className="text-xs leading-5 text-content-secondary">
      Fonte: mapa em PDF de referência. Contorno aproximado das quadras identificadas; não representa delimitação oficial. Confira e ajuste a área no mapa antes de salvar.
    </p>}
    <div className="relative h-[min(56dvh,40rem)] min-h-[16rem] w-full overflow-hidden rounded-xl border border-edge-subtle sm:h-[clamp(16rem,calc(94dvh-28rem),40rem)]">
      {center ? <>
        <MapContainer center={[center.lat, center.lng]} zoom={15} zoomAnimation={false} doubleClickZoom={false} className="h-full w-full">
          <MapBaseLayer layer={layer} />
          <NeighborhoodBoundaryAttribution hasOsm={source?.provider === 'osm' || boundaries.some((record) => record.source?.provider === 'osm')} />
          <InitialViewport points={viewportPoints} center={center} />
          <MapClicks onClick={(point) => mode === 'add' && Date.now() > dragged.current && edit({ type: 'insert', point })} />
          {boundaries.filter((record) => String(record.bairro_id) !== String(bairro.id)).map((record) => {
            const ring = boundaryPoints(record.boundary);
            return ring.length > 2 && <Polygon key={record.bairro_id} positions={ring.map(([lng, lat]) => [lat, lng])} pathOptions={{ color: neighborhoodColor(record.color), fillOpacity: 0.1, weight: 2, dashArray: '5 5' }} interactive={false} />;
          })}
          {streets.map((street) => street.linhas?.length > 0 && <Polyline key={street.id} positions={street.linhas} pathOptions={{ color: '#64748b', weight: 2, opacity: 0.6 }} interactive={false} />)}
          {visiblePoints.length > 2 ? <Polygon positions={visiblePoints.map(([lng, lat]) => [lat, lng])} pathOptions={{ color, fillOpacity: 0.28, weight: 3 }} interactive={false} />
            : visiblePoints.length > 1 && <Polyline positions={visiblePoints.map(([lng, lat]) => [lat, lng])} pathOptions={{ color, weight: 3 }} interactive={false} />}
          {mode === 'add' && activeNeighbor != null && <Polyline positions={[points[selected], points[activeNeighbor]].map(([lng, lat]) => [lat, lng])} pathOptions={{ color: '#2563eb', weight: 4, dashArray: '6 6' }} interactive={false} />}
          {mode !== 'curve' && points.slice(0, points.length > 2 ? points.length : Math.max(0, points.length - 1)).map((point, index) => <Polyline key={`edge-${index}`}
            positions={[point, points[(index + 1) % points.length]].map(([lng, lat]) => [lat, lng])}
            pathOptions={{ color, weight: 18, opacity: 0 }} bubblingMouseEvents={false} eventHandlers={{ click: (event) => {
              L.DomEvent.stopPropagation(event.originalEvent);
              if (Date.now() > dragged.current) edit({ type: 'insert', after: index, point: [event.latlng.lng, event.latlng.lat] });
            } }} />)}
          {points.length > 1 && <SegmentHandles points={points} mode={mode} saving={saving} dragged={dragged} onPreview={setPreviewPoints}
            onInsert={(index, point) => edit({ type: 'insert', after: index, point })}
            onCurve={(index, point) => edit({ type: 'curve', index, point })} />}
          {points.map((_, index) => <Marker key={index} position={markerPositions[index]} icon={selected === index ? selectedVertexIcon : vertexIcon}
            title={`Ponto ${index + 1}${selected === index ? ' selecionado' : ''}`} zIndexOffset={selected === index ? 1000 : 0} draggable={!saving} bubblingMouseEvents={false} eventHandlers={{
            dragstart: () => { dragged.current = Infinity; },
            drag: (event) => {
              const position = event.target.getLatLng();
              setPreviewPoints(points.map((point, i) => i === index ? [position.lng, position.lat] : point));
            },
            dragend: (event) => {
              const position = event.target.getLatLng();
              setPreviewPoints(null);
              edit({ type: 'move', index, point: [position.lng, position.lat] });
              dragged.current = Date.now() + 300;
            },
            click: (event) => {
              L.DomEvent.stopPropagation(event.originalEvent);
              if (Date.now() > dragged.current) edit({ type: 'select', index });
            },
          }} />)}
        </MapContainer>
        <MapLayerToggle layer={layer} onLayerChange={setLayer} className="absolute bottom-3 right-3 z-[500]" />
      </> : <div className="flex h-full items-center justify-center px-6 text-center text-sm text-content-secondary">
        {centerError ? 'Não foi possível localizar a cidade. Cadastre uma rua com localização e reabra o editor.' : <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Localizando o bairro…</>}
      </div>}
    </div>
    <p className="text-sm text-content-secondary" aria-live="polite">{removing
      ? 'O desenho foi limpo. Salve a remoção para apagar o contorno cadastrado.'
      : validationError || `${points.length} pontos no contorno.`}</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <DialogFooter className="gap-2">
      <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
      <Button type="button" disabled={saving || searching || (!removing && Boolean(validationError))} onClick={submit}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{removing ? 'Salvar remoção' : 'Salvar contorno'}</Button>
    </DialogFooter>
    {saving && <div className="absolute inset-0 z-[1000] cursor-wait rounded-lg bg-background/10" aria-label="Salvando contorno" />}
  </>;
}

export default function NeighborhoodBoundaryEditor({ bairros, boundaries, streets, city, initialBairroId, onSave, onClose }) {
  const options = useMemo(() => bairros.filter((bairro) => String(bairro.city_id) === String(city.id)), [bairros, city.id]);
  const [selected, setSelected] = useState(() => options.find((bairro) => String(bairro.id) === String(initialBairroId))?.id || options[0]?.id || '');
  useEffect(() => {
    if (!options.some((bairro) => String(bairro.id) === String(selected))) setSelected(options[0]?.id || '');
  }, [options, selected]);
  const bairro = options.find((item) => String(item.id) === String(selected));
  const previous = boundaries.find((record) => String(record.bairro_id) === String(selected));
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const save = async (draft) => {
    busy.current = true;
    setSaving(true);
    try { await onSave(draft); } finally { busy.current = false; setSaving(false); }
  };
  const close = () => { if (!busy.current) onClose(); };

  // Preserva a largura anterior deste modal conforme solicitado pelo usuário.
  return <Dialog open onOpenChange={(open) => !open && close()}>
    <DialogContent className="max-h-[94dvh] w-[calc(100%-2rem)] max-w-6xl gap-3 overflow-y-auto p-4 sm:p-6">
      <DialogHeader>
        <DialogTitle>Traçado dos bairros</DialogTitle>
        <DialogDescription>Selecione um bairro para ajustar pontos, continuar de qualquer vértice ou curvar trechos. A área fecha automaticamente e será usada no PDF. O desenho não altera o bairro cadastrado das ruas.</DialogDescription>
      </DialogHeader>
      <label htmlFor="bairro-contorno-selecao" className="text-sm font-semibold">Bairro de {city.name}</label>
      <select id="bairro-contorno-selecao" value={selected} disabled={saving} onChange={(event) => setSelected(event.target.value)} className="h-10 w-full rounded-md border border-edge-subtle bg-background px-3 text-sm sm:max-w-md">
        {options.length === 0 && <option value="">Nenhum bairro cadastrado nesta cidade</option>}
        {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {bairro ? <BoundaryDraft key={bairro.id} bairro={bairro} previous={previous} streets={streets} boundaries={boundaries} city={city} onSave={save} onClose={close} />
        : <p className="py-6 text-sm text-content-secondary">Cadastre um bairro pela edição de uma rua para desenhar seu contorno.</p>}
    </DialogContent>
  </Dialog>;
}
