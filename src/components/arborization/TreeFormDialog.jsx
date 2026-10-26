import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, ChevronDown, Leaf, Loader2, LocateFixed, MapPin, Minimize2, Pencil, Undo2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TreeMap from './TreeMap';
import TreeSpeciesField from './TreeSpeciesField';
import TreePhoto from './TreePhoto';
import { EMPTY_TREE, TREE_ACTIONS, TREE_STATUS, TREE_PLANTED_BY, treePayload } from '@/lib/arborization';
import { loadTreeCatalogs, nearbyTrees, treeNameKey } from '@/lib/treeInventory';
import { reverseGeocodePin } from '@/lib/reverseGeocodePin';
import { treeBatchPayloads } from '@/lib/treeBatchLocations';
import { supabase } from '@/lib/customSupabaseClient';
import { useIsMobile } from '@/hooks/useIsMobile';

const selectClass = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';
const Field = ({ label, children }) => <label className="grid min-w-0 gap-1.5 text-sm font-medium">{label}{children}</label>;
const STEPS = ['Localização', 'Identificação', 'Revisão'];

export default function TreeFormDialog({ tree, city, cityId, onClose, onSave, onSaveBatch, batchMode = false, initialMapView, existingTrees, onSpeciesChanged, reportMode = false, initialPhoto = null, initialStep = 0 }) {
  const mobile = useIsMobile();
  const [step, setStep] = useState(tree?.id && initialStep === 1 ? 1 : 0);
  const [furthestStep, setFurthestStep] = useState(tree?.id && initialStep === 1 ? 1 : 0);
  const [addressOpen, setAddressOpen] = useState(Boolean(tree?.id && !tree?.bairro_id));
  const scrollRef = useRef(null);
  const stepHeadingRef = useRef(null);
  const mapRef = useRef(null);
  const mobileMapView = useRef(null);
  const handleMapReady = useCallback(map => { mapRef.current = map; }, []);
  const [form, setForm] = useState(() => ({ ...EMPTY_TREE, ...tree }));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const batchLocationCache = useRef(new Map());
  const batchLookupAbort = useRef(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const [points, setPoints] = useState([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [locating, setLocating] = useState(false);
  const [addressLookup, setAddressLookup] = useState('idle');
  const [locationRevision, setLocationRevision] = useState(0);
  const addressEdited = useRef({ address: false, neighborhood: false });
  const [error, setError] = useState('');
  const [catalogs, setCatalogs] = useState({ species: [], neighborhoods: [] });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [speciesCreating, setSpeciesCreating] = useState(false);
  const [photo, setPhoto] = useState(initialPhoto);
  const photoInput = useRef(null);
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!mobile) return;
    scrollRef.current?.scrollTo({ top: 0 });
    stepHeadingRef.current?.focus({ preventScroll: true });
    if (step !== 0 || !mobileMapView.current) return;
    const frame = requestAnimationFrame(() => {
      const view = mobileMapView.current;
      mapRef.current?.invalidateSize({ pan: false });
      if (view) mapRef.current?.setView(view.center, view.zoom, { animate: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [step, mobile]);
  useEffect(() => {
    const controller = new AbortController();
    batchLookupAbort.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true); setCatalogError('');
    loadTreeCatalogs(supabase, cityId).then(data => {
      if (cancelled) return;
      setCatalogs(data);
      setForm(current => ({ ...current,
        species_id: current.species_id || data.species.find(item => treeNameKey(item.common_name) === treeNameKey(current.common_name))?.id || '',
        bairro_id: current.bairro_id || data.neighborhoods.find(item => treeNameKey(item.name) === treeNameKey(current.neighborhood))?.id || '',
      }));
    }).catch(() => { if (!cancelled) setCatalogError('Não foi possível carregar as espécies e os bairros. Tente novamente.'); })
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [cityId, catalogRevision]);
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const selectSpecies = species => { setDirty(true); setForm(current => ({ ...current, species_id: species?.id || '', common_name: species?.common_name || 'Não identificada', scientific_name: species?.scientific_name || '', origin: species?.origin || 'nao_identificada' })); };
  const speciesChanged = item => {
    setCatalogs(current => ({ ...current, species: [...current.species.filter(species => species.id !== item.id), item].sort((a, b) => a.common_name.localeCompare(b.common_name, 'pt-BR')) }));
    onSpeciesChanged?.(item);
    setForm(current => current.species_id === item.id ? { ...current, common_name: item.common_name, scientific_name: item.scientific_name || '', origin: item.origin } : current);
  };
  const change = (field, value) => {
    setDirty(true);
    if (field === 'address' || field === 'neighborhood') addressEdited.current[field] = true;
    setForm(current => ({ ...current, [field]: value }));
  };
  const position = useMemo(() => {
    if (String(form.latitude ?? '').trim() === '' || String(form.longitude ?? '').trim() === '') return null;
    const latitude = Number(String(form.latitude).replace(',', '.')), longitude = Number(String(form.longitude).replace(',', '.'));
    return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
  }, [form.latitude, form.longitude]);
  const changeLocation = values => {
    setDirty(true);
    addressEdited.current = { address: false, neighborhood: false };
    setForm(current => ({ ...current, ...values, address: '', neighborhood: '', bairro_id: '' }));
    setAddressLookup('loading');
    setLocationRevision(value => value + 1);
  };
  const pick = point => {
    if (savingRef.current || confirmDiscard || speciesCreating) return;
    setNotice('');
    if (batchMode && nearbyTrees(existingTrees || [], { lat: point.latitude, lng: point.longitude }, 3).length) setNotice('Já existe uma árvore cadastrada a até 3 metros deste ponto. Confira a posição para evitar duplicidade.');
    if (batchMode) setPoints(current => current.some(item => item.latitude.toFixed(7) === point.latitude.toFixed(7) && item.longitude.toFixed(7) === point.longitude.toFixed(7)) ? current : [...current, point]);
    else changeLocation({ latitude: point.latitude.toFixed(7), longitude: point.longitude.toFixed(7) });
  };
  const requestClose = () => {
    if (savingRef.current || locating) return;
    if (batchMode ? points.length || speciesCreating : dirty || speciesCreating) setConfirmDiscard(true);
    else onClose();
  };

  useEffect(() => {
    // Abrir uma árvore existente preserva o endereço já conferido pelo gestor.
    if (!locationRevision) return undefined;
    if (!position) { setAddressLookup('idle'); return undefined; }
    let cancelled = false;
    let timeout;
    setAddressLookup('loading');
    const timer = setTimeout(async () => {
      try {
        const result = await Promise.race([
          reverseGeocodePin({ lat: position.latitude, lng: position.longitude }, { invoke: (...args) => supabase.functions.invoke(...args) }),
          new Promise(resolve => { timeout = setTimeout(() => resolve(null), 12000); }),
        ]);
        if (cancelled) return;
        const address = result?.address?.trim() || '';
        const neighborhood = result?.suburb?.trim() || '';
        setForm(current => ({ ...current,
          ...(!addressEdited.current.address ? { address } : {}),
          ...(!addressEdited.current.neighborhood ? { neighborhood, bairro_id: '' } : {}),
        }));
        setAddressLookup(address && neighborhood ? 'success' : address || neighborhood ? 'partial' : 'failed');
      } catch {
        if (!cancelled) setAddressLookup('failed');
      } finally { clearTimeout(timeout); }
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(timeout); };
  }, [position, locationRevision]);
  useEffect(() => {
    if (addressEdited.current.neighborhood || !form.neighborhood) return;
    const match = catalogs.neighborhoods.find(item => treeNameKey(item.name) === treeNameKey(form.neighborhood));
    if (match && form.bairro_id !== match.id) setForm(current => ({ ...current, bairro_id: match.id, neighborhood: match.name }));
  }, [catalogs.neighborhoods, form.neighborhood, form.bairro_id]);
  const locate = () => {
    if (!navigator.geolocation) { setError('A localização não está disponível neste dispositivo. Marque o ponto no mapa.'); return; }
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(({ coords }) => { pick({ latitude: coords.latitude, longitude: coords.longitude }); setLocating(false); }, () => { setError('Não foi possível obter sua localização. Marque o ponto no mapa.'); setLocating(false); }, { enableHighAccuracy: true, timeout: 10000 });
  };
  const hasLocation = batchMode ? points.length > 0 : Boolean(position);
  const blocked = saving || locating || speciesCreating || confirmDiscard;
  const goToStep = next => {
    if (blocked) return;
    setError('');
    if (next > step) {
      if (!hasLocation) { setError(batchMode ? 'Marque pelo menos uma árvore no mapa.' : 'Marque a árvore no mapa ou use o GPS.'); return; }
      if (next === 2) {
        if (catalogLoading || catalogError || addressLookup === 'loading') return;
        try { treePayload({ ...form, common_name: form.common_name || 'Não identificada', ...(batchMode ? points[0] : {}) }, cityId); }
        catch (err) { setError(err.message); return; }
      }
    }
    if (mobile && step === 0 && next !== 0 && mapRef.current) mobileMapView.current = { center: mapRef.current.getCenter(), zoom: mapRef.current.getZoom() };
    setFurthestStep(current => Math.max(current, next)); setStep(next);
  };
  const submit = async event => {
    event.preventDefault();
    event.stopPropagation();
    if (mobile && step < 2) { goToStep(step + 1); return; }
    if (addressLookup === 'loading' || locating || savingRef.current || speciesCreating || catalogLoading || catalogError || confirmDiscard) return;
    setError(''); setSaving(true); savingRef.current = true;
    try {
      const species = catalogs.species.find(item => item.id === form.species_id);
      const neighborhood = catalogs.neighborhoods.find(item => item.id === form.bairro_id);
      const values = { ...form, common_name: species?.common_name || 'Não identificada', scientific_name: species?.scientific_name || '', origin: species?.origin || 'nao_identificada', neighborhood: neighborhood?.name || '' };
      if (batchMode) {
        const signal = batchLookupAbort.current.signal;
        const payloads = await treeBatchPayloads(values, points, cityId, {
          neighborhoods: catalogs.neighborhoods, cache: batchLocationCache.current, signal,
          lookup: point => reverseGeocodePin(point, { invoke: (...args) => supabase.functions.invoke(...args) }),
          onProgress: progress => { if (!signal.aborted) setBatchProgress(progress); },
        });
        if (signal.aborted) return;
        setBatchProgress(null);
        await onSaveBatch(payloads, photo);
        const unidentified = payloads.filter(payload => !payload.bairro_id).length;
        const missingAddress = payloads.filter(payload => !payload.address).length;
        setNotice(`${points.length} ${points.length === 1 ? 'árvore cadastrada' : 'árvores cadastradas'}.${unidentified ? ` ${unidentified} sem bairro identificado.` : ''}${missingAddress ? ` ${missingAddress} sem rua identificada.` : ''} Continue marcando ou encerre para voltar ao mapa.`);
        batchLocationCache.current.clear();
        setPoints([]); setDirty(false);
        setStep(0); setFurthestStep(0);
      } else {
        await onSave(treePayload(values, cityId), tree?.id, photo); onClose();
      }
    }
    catch (err) { setError(err.message || 'Não foi possível salvar a árvore. Tente novamente.'); }
    finally { setBatchProgress(null); setSaving(false); savingRef.current = false; }
  };
  return <Dialog open onOpenChange={open => { if (!open) requestClose(); }}>
    <DialogContent hideClose data-mobile-step={step} className="tree-entry-dialog !inset-0 !h-[100dvh] !w-full !max-w-none !translate-x-0 !translate-y-0 !rounded-none flex flex-col gap-0 overflow-hidden border-0 p-0" onClick={event => event.stopPropagation()} onInteractOutside={event => event.preventDefault()}>
      <DialogHeader className="tree-entry-header shrink-0 border-b border-edge-subtle px-4 py-3 text-left sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><DialogTitle className="flex items-center gap-2 text-base"><Leaf className="h-5 w-5 text-emerald-700" />{tree?.id ? 'Editar árvore' : batchMode ? 'Cadastrar em sequência' : 'Cadastrar árvore'}</DialogTitle><Button type="button" size={mobile ? 'icon' : 'sm'} variant={mobile ? 'ghost' : 'outline'} aria-label={mobile ? 'Fechar cadastro' : undefined} disabled={saving || locating} onClick={requestClose}>{mobile ? <X className="h-5 w-5" /> : <><Minimize2 className="mr-2 h-4 w-4" />Sair da tela cheia</>}</Button></div>
        <DialogDescription>{city?.name}</DialogDescription>
      </DialogHeader>
      {mobile && <nav className="tree-entry-progress" aria-label="Etapas do cadastro"><ol>{STEPS.map((label, index) => <li key={label}><button type="button" aria-current={step === index ? 'step' : undefined} disabled={index > furthestStep || blocked} onClick={() => goToStep(index)}><span className="tree-entry-progress-number">{index < step ? <Check className="h-3.5 w-3.5" /> : index + 1}</span><span>{label}</span></button></li>)}</ol></nav>}
      <form onSubmit={submit} noValidate={mobile} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="tree-entry-main min-h-0 flex-1" data-testid="tree-form-scroll">
          {mobile && <div className="tree-entry-mobile-heading"><div className="flex items-center justify-between gap-2"><h2 ref={stepHeadingRef} tabIndex={-1}>{step === 0 ? batchMode ? 'Marque as árvores' : 'Onde está a árvore?' : step === 1 ? 'Identifique a árvore' : 'Confira antes de salvar'}</h2>{step === 0 && <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0 rounded-xl" disabled={locating || saving || confirmDiscard} onClick={locate}>{locating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-1 h-4 w-4" />}Usar GPS</Button>}</div><p>{step === 0 ? batchMode ? 'Toque para marcar cada árvore. Toque no ponto marcado para removê-lo.' : 'Toque no mapa ou use o GPS. Arraste o marcador para ajustar.' : step === 1 ? batchMode ? 'Os dados serão aplicados a todas as árvores do lote.' : 'Escolha a espécie e inclua uma foto, se possível.' : batchMode ? 'Confira os dados comuns e a quantidade de pontos.' : 'Revise a localização e os dados informados.'}</p></div>}
          <fieldset disabled={saving || confirmDiscard} className="tree-entry-layout">
            <section className="tree-entry-location min-w-0" aria-label="Localização da árvore">
                {!mobile && <div className="tree-entry-map-heading flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><span className="tree-entry-step">1</span>Localize no mapa</h3><Button type="button" variant="outline" size="sm" disabled={locating} onClick={locate}>{locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}Usar GPS</Button></div>}
                <p className="tree-entry-map-instruction text-xs text-muted-foreground">{batchMode ? 'Toque para marcar cada árvore. Toque em um ponto marcado para removê-lo.' : 'Toque no mapa ou arraste o marcador até a árvore.'}</p>
                <div className="tree-entry-map relative isolate overflow-hidden rounded-xl border" data-testid="tree-form-map">
                  <TreeMap city={city} trees={existingTrees} registrationMode={batchMode} onMapReady={handleMapReady} initialView={initialMapView} position={batchMode ? null : position} onPick={saving || confirmDiscard || speciesCreating ? undefined : pick} draftPoints={batchMode ? points : undefined}
                    onRemoveDraft={index => { if (!savingRef.current && !confirmDiscard && !speciesCreating) setPoints(current => current.filter((_, i) => i !== index)); }} />
                </div>
                {batchMode && <p className="text-xs text-muted-foreground"><span aria-hidden="true" className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-cyan-600 align-middle text-white shadow-[0_0_0_1px_#0f172a]"><Check className="h-2.5 w-2.5" /></span>Círculos azuis com ✓ indicam árvores já cadastradas. Os pontos verdes com + são os novos cadastros.</p>}
                {batchMode && <div className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="tree-batch-points"><span>{points.length} {points.length === 1 ? 'árvore marcada' : 'árvores marcadas'}</span><Button type="button" size="sm" variant="outline" disabled={!points.length || saving} onClick={() => setPoints(current => current.slice(0, -1))}><Undo2 className="mr-2 h-4 w-4" />Desfazer ponto</Button></div>}
            </section>
            <div className="tree-entry-fields min-w-0 space-y-5">
              <section className="tree-entry-identification min-w-0 space-y-4" aria-label="Identificação da árvore">
                  {tree?.public_code && <p className="text-xs text-muted-foreground">Código da árvore: {tree.public_code}</p>}
                  <TreeSpeciesField species={catalogs.species} value={form.species_id} onSelect={selectSpecies} cityId={cityId}
                    loading={catalogLoading} disabled={saving || !!catalogError} allowCreate={!reportMode} onCreatingChange={setSpeciesCreating}
                    onCreated={speciesChanged} onUpdated={speciesChanged} />
                  {!reportMode && <Field label="Situação"><select className={selectClass} value={form.status} onChange={event => change('status', event.target.value)}>{Object.entries(TREE_STATUS).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
                  {catalogError && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{catalogError}</p><Button type="button" variant="outline" size="sm" onClick={() => setCatalogRevision(value => value + 1)}>Tentar novamente</Button></div>}
                </section>
              {batchMode ? <p className="tree-entry-batch-address border-t pt-4 text-xs text-muted-foreground" data-testid="tree-batch-address-info">Endereço e bairro automáticos por ponto.</p> : <section className={`tree-entry-address space-y-3 border-t pt-4 ${addressOpen ? 'is-open' : ''}`} aria-label="Endereço da árvore">
                {mobile && <button type="button" className="tree-entry-address-toggle" aria-expanded={addressOpen} aria-controls="tree-entry-address-fields" onClick={() => setAddressOpen(current => !current)}><MapPin className="h-4 w-4 shrink-0" /><span><strong>Endereço e bairro</strong><span>{addressLookup === 'loading' ? 'Buscando endereço…' : [form.address, form.neighborhood].filter(Boolean).join(' · ') || (position ? 'Complete o endereço, se souber' : 'Selecione a localização no mapa')}</span></span><ChevronDown className={`h-4 w-4 shrink-0 ${addressOpen ? 'rotate-180' : ''}`} /></button>}
                <div id="tree-entry-address-fields" className="tree-entry-address-body space-y-3">
                <Field label="Endereço / referência"><Input maxLength={300} value={form.address || ''} onChange={event => change('address', event.target.value)} placeholder="Rua, número ou praça" /></Field>
                <Field label="Bairro"><select disabled={catalogLoading || !!catalogError} className={selectClass} value={form.bairro_id || ''} onChange={event => { change('bairro_id', event.target.value); change('neighborhood', catalogs.neighborhoods.find(item => item.id === event.target.value)?.name || ''); }}><option value="">Não identificado</option>{catalogs.neighborhoods.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <p role="status" className="flex items-center gap-2 text-xs leading-relaxed text-muted-foreground">
                  {addressLookup === 'loading' && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
                  {addressLookup === 'loading' ? 'Buscando rua e bairro pela posição do mapa…'
                    : addressLookup === 'failed' ? 'Não foi possível identificar o endereço. Informe a referência e selecione o bairro.'
                    : addressLookup === 'partial' ? 'Localização consultada. Complete os campos que não foram identificados.'
                    : addressLookup === 'success' ? 'Rua e bairro preenchidos pela localização. Você pode ajustar os campos.'
                    : 'Marque um ponto no mapa para preencher rua e bairro automaticamente.'}
                </p>
                {!batchMode && <details className="border-t border-edge-subtle pt-3"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">Ajustar coordenadas</summary><div className="mt-3 grid grid-cols-2 gap-3"><Field label="Latitude"><Input inputMode="decimal" value={form.latitude} onChange={event => changeLocation({ latitude: event.target.value })} placeholder="-8.597031" /></Field><Field label="Longitude"><Input inputMode="decimal" value={form.longitude} onChange={event => changeLocation({ longitude: event.target.value })} placeholder="-38.574217" /></Field></div></details>}
                </div>
              </section>}
              <section className="tree-entry-photo min-w-0 space-y-3 rounded-xl border border-edge-subtle p-4" aria-label="Foto da árvore">
                  <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><Camera className="h-4 w-4 text-emerald-700" />Foto da árvore</h3><span className="text-xs text-muted-foreground">Opcional</span></div>
                  {batchMode && <p className="text-xs text-muted-foreground">Mesma foto para todo o lote.</p>}
                  <TreePhoto tree={{ ...form, photo_url: preview || form.photo_url, species_illustration_url: catalogs.species.find(item => item.id === form.species_id)?.illustration_url }} imageClassName="h-36 w-full rounded-lg bg-surface-subtle object-contain" />
                  <Field label="Uma foto em JPG, PNG ou WebP, até 5 MB"><Input ref={photoInput} className="text-xs" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { setError('Selecione uma foto JPG, PNG ou WebP de até 5 MB.'); event.target.value = ''; return; } setError(''); setPhoto(file || null); setDirty(true); }} /></Field>
                  {(preview || form.photo_url) && <Button type="button" variant="ghost" size="sm" onClick={() => { setPhoto(null); change('photo_url', ''); if (photoInput.current) photoInput.current.value = ''; }}>Remover foto</Button>}
                </section>
              {!reportMode && <details className="rounded-xl border border-edge-subtle p-4" data-testid="tree-extra-fields"><summary className="cursor-pointer text-sm font-semibold">Dados complementares</summary><div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Altura (m)"><Input type="number" min="0.01" step="0.01" value={form.height_m ?? ''} onChange={event => change('height_m', event.target.value)} /></Field>
                <Field label="Diâmetro da copa (m)"><Input type="number" min="0.01" step="0.01" value={form.crown_diameter_m ?? ''} onChange={event => change('crown_diameter_m', event.target.value)} /></Field>
                <Field label="Data do plantio"><Input type="date" value={form.planted_at || ''} onChange={event => change('planted_at', event.target.value)} /></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Responsável pelo plantio"><select className={selectClass} value={form.planted_by} onChange={event => change('planted_by', event.target.value)}>{Object.entries(TREE_PLANTED_BY).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field><Field label="Ano de nascimento estimado"><Input type="number" min="1" max={new Date().getFullYear()} value={form.estimated_birth_year ?? ''} onChange={event => change('estimated_birth_year', event.target.value)} placeholder="Se conhecido ou estimado pela equipe" /></Field></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_historic_site} onChange={event => change('is_historic_site', event.target.checked)} />Localizada no sítio histórico</label>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Manejo necessário"><select className={selectClass} value={form.maintenance_action} onChange={event => change('maintenance_action', event.target.value)}>{Object.entries(TREE_ACTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Prazo do manejo"><Input type="date" disabled={form.maintenance_action === 'nenhuma'} value={form.maintenance_due_at || ''} onChange={event => change('maintenance_due_at', event.target.value)} /></Field></div>
              <Field label="Observações públicas"><textarea className={`${selectClass} h-24 py-2`} maxLength={5000} value={form.notes || ''} onChange={event => change('notes', event.target.value)} placeholder="Condições da árvore e orientações de manejo. Evite dados pessoais." /></Field>
            </div></details>}
            </div>
            {mobile && step === 2 && <section className="tree-entry-review space-y-4" aria-label="Revisão do cadastro">
              <div className="tree-entry-review-card"><div className="flex items-center justify-between gap-2"><h3><MapPin className="h-4 w-4" />Localização</h3><Button type="button" variant="ghost" size="sm" onClick={() => goToStep(0)}><Pencil className="mr-1 h-3.5 w-3.5" />Alterar</Button></div>{batchMode ? <><p className="font-semibold">{points.length} {points.length === 1 ? 'árvore marcada' : 'árvores marcadas'}</p><p className="text-sm text-muted-foreground">O endereço e o bairro serão identificados individualmente ao salvar.</p></> : <><p className="break-words text-sm">{form.address || 'Endereço não informado'}</p><p className="text-sm text-muted-foreground">Bairro: {form.neighborhood || 'Não identificado'}</p><p className="text-xs text-muted-foreground">{position?.latitude.toFixed(6)}, {position?.longitude.toFixed(6)}</p>{!form.bairro_id && <p className="mt-2 text-xs text-muted-foreground">Você poderá identificar o bairro depois pelo filtro “Sem bairro identificado”.</p>}</>}</div>
              <div className="tree-entry-review-card"><div className="flex items-center justify-between gap-2"><h3><Leaf className="h-4 w-4" />Identificação</h3><Button type="button" variant="ghost" size="sm" onClick={() => goToStep(1)}><Pencil className="mr-1 h-3.5 w-3.5" />Alterar</Button></div><p className="break-words font-semibold">{catalogs.species.find(item => item.id === form.species_id)?.common_name || 'Espécie não identificada'}</p><p className="text-sm text-muted-foreground">{TREE_STATUS[form.status]?.label} · {photo || form.photo_url ? 'Com foto' : 'Sem foto'}</p>{!reportMode && <p className="text-sm text-muted-foreground">{TREE_ACTIONS[form.maintenance_action]}{form.maintenance_due_at && form.maintenance_action !== 'nenhuma' ? ` · ${form.maintenance_due_at.split('-').reverse().join('/')}` : ''}</p>}{form.height_m && <p className="text-sm">Altura: {form.height_m} m</p>}{form.crown_diameter_m && <p className="text-sm">Copa: {form.crown_diameter_m} m</p>}{form.planted_at && <p className="text-sm">Plantio: {form.planted_at.split('-').reverse().join('/')}</p>}{form.notes && <p className="whitespace-pre-wrap break-words text-sm">{form.notes}</p>}</div>
            </section>}
          </fieldset>
        </div>
        <div className="shrink-0 space-y-3 border-t border-edge-subtle bg-surface-raised px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6" data-testid="tree-form-footer">
          {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4 shrink-0" />{notice}</p>}
          {batchProgress && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="tree-batch-address-progress"><Loader2 className="h-4 w-4 shrink-0 animate-spin" />Identificando endereços: {batchProgress.completed} de {batchProgress.total} árvores…</p>}
          {mobile && step === 1 && addressLookup === 'loading' && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Identificando o endereço antes da revisão…</p>}
          {confirmDiscard ? <div className="flex flex-wrap items-center justify-between gap-3" role="alert"><p className="text-sm">{batchMode && points.length ? `Descartar os ${points.length} pontos ainda não salvos?` : 'Descartar as alterações ainda não salvas?'}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setConfirmDiscard(false)}>{batchMode ? 'Manter lote' : 'Continuar cadastro'}</Button><Button type="button" variant="destructive" onClick={onClose}>{batchMode && points.length ? 'Descartar pontos' : 'Descartar alterações'}</Button></div></div> :
          mobile ? <div className="tree-entry-mobile-actions"><p className="text-xs text-muted-foreground">{step === 0 ? batchMode ? `${points.length} árvores marcadas` : position ? 'Localização definida' : 'Marque um ponto para continuar' : `Etapa ${step + 1} de 3`}</p><div><Button type="button" variant="outline" disabled={blocked} onClick={step === 0 ? requestClose : () => goToStep(step - 1)}>{step === 0 ? batchMode ? 'Encerrar' : 'Cancelar' : <><ArrowLeft className="mr-1 h-4 w-4" />Voltar</>}</Button>{step < 2 ? <Button key="next" type="button" disabled={blocked || !hasLocation || (step === 1 && (catalogLoading || !!catalogError || addressLookup === 'loading'))} onClick={() => goToStep(step + 1)}>{step === 0 ? 'Continuar' : 'Revisar'}<ArrowRight className="ml-1 h-4 w-4" /></Button> : <Button key="save" type="submit" disabled={blocked || !hasLocation || catalogLoading || !!catalogError || addressLookup === 'loading'}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{saving ? 'Salvando…' : batchMode ? `Salvar lote (${points.length})` : reportMode ? 'Usar na bronca' : tree?.id ? 'Salvar alterações' : 'Cadastrar árvore'}</Button>}</div></div> :
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-4 w-4" />{batchMode ? `${points.length} árvores marcadas · Os dados valem para todo o lote` : position ? 'Localização definida' : 'Marque a localização da árvore no mapa'}</p><div className="ml-auto flex gap-2"><Button type="button" variant="outline" disabled={saving || locating} onClick={requestClose}>{batchMode ? 'Encerrar' : 'Cancelar'}</Button><Button type="submit" disabled={!hasLocation || saving || locating || addressLookup === 'loading' || catalogLoading || !!catalogError || speciesCreating}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? 'Salvando…' : batchMode ? `Salvar lote (${points.length})` : reportMode ? 'Usar esta árvore na bronca' : 'Salvar árvore'}</Button></div></div>}
        </div>
      </form>

    </DialogContent>
  </Dialog>;
}
