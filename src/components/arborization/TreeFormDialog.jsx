import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, Leaf, Loader2, LocateFixed, MapPin, Pencil, Ruler, Scissors, Trees, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TreeMap from './TreeMap';
import TreeSpeciesField from './TreeSpeciesField';
import TreePhoto from './TreePhoto';
import { MAP_LAYER, MapLayerToggle } from '@/components/map/MapDisplayControls';
import TreeSurveyFields from './TreeSurveyFields';
import { allTreeRows } from '@/lib/treeInventory';
import { isPlannedTree } from '@/lib/treePlanning';
import { findTreeStreet } from '@/lib/treeStreetLocation';
import { EMPTY_TREE, TREE_ACTIONS, TREE_STATUS, TREE_PLANTED_BY, treePayload } from '@/lib/arborization';
import { loadTreeCatalogs, nearbyTrees, treeNameKey } from '@/lib/treeInventory';
import { reverseGeocodePin } from '@/lib/reverseGeocodePin';
import { applyTreeBatchAddress, treeBatchPayloads } from '@/lib/treeBatchLocations';
import { supabase } from '@/lib/customSupabaseClient';
import { EntryField, EntryKind, EntryProgress, EntryReview, EntrySection, entrySelectClass } from './TreeEntryParts';
import TreeEntryAddressFields from './TreeEntryAddressFields';
import useTreeBatchAddresses from './useTreeBatchAddresses';
import TreeDiscardDialog from './TreeDiscardDialog';
import './treeEntryRedesign.css';

const selectClass = entrySelectClass;
const Field = EntryField;

export default function TreeFormDialog({ tree, city, cityId, onClose, onSave, onSaveBatch, batchMode = false, initialMapView, existingTrees, onSpeciesChanged, reportMode = false, initialPhoto = null, initialStep = 0 }) {
  const [step, setStep] = useState(tree?.id && initialStep === 1 ? 1 : 0);
  const [furthestStep, setFurthestStep] = useState(tree?.id && initialStep === 1 ? 1 : 0);
  const scrollRef = useRef(null);
  const mainScrollRef = useRef(null);
  const stepHeadingRef = useRef(null);
  const mapRef = useRef(null);
  const [mapLayer, setMapLayer] = useState(MAP_LAYER.STANDARD);
  const mobileMapView = useRef(null);
  const handleMapReady = useCallback(map => { mapRef.current = map; }, []);
  const [form, setForm] = useState(() => ({ ...EMPTY_TREE, ...tree }));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const batchLocationCache = useRef(new Map());
  const batchLookupAbort = useRef(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const [points, setPoints] = useState([]);
  const nextDraftId = useRef(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [locating, setLocating] = useState(false);
  const [addressLookup, setAddressLookup] = useState('idle');
  const [locationRevision, setLocationRevision] = useState(0);
  const addressEdited = useRef({ address: false, neighborhood: false });
  const [error, setError] = useState('');
  const [catalogs, setCatalogs] = useState({ species: [], neighborhoods: [] });
  const [streets, setStreets] = useState([]);
  const [streetsError, setStreetsError] = useState(false);
  const [streetRevision, setStreetRevision] = useState(0);
  useEffect(() => {
    let cancelled = false; setStreets([]); setStreetsError(false);
    if (cityId) allTreeRows(supabase, 'pavement_streets', query => query.select('id,city_id,name,bairro_id').eq('city_id', cityId)).then(rows => {
      if (!cancelled) setStreets(rows.filter(row => row.name).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
    }).catch(() => { if (!cancelled) setStreetsError(true); });
    return () => { cancelled = true; };
  }, [cityId, streetRevision]);
  const planned = isPlannedTree(form);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRevision, setCatalogRevision] = useState(0);
  useTreeBatchAddresses({ enabled: batchMode, points, setPoints, cityId, neighborhoods: catalogs.neighborhoods, streets, cache: batchLocationCache.current });
  const batchAddressPending = batchMode && points.some(point => !point.addressStatus || ['queued', 'loading'].includes(point.addressStatus));
  const [speciesCreating, setSpeciesCreating] = useState(false);
  const [photo, setPhoto] = useState(initialPhoto);
  const photoInput = useRef(null);
  const [preview, setPreview] = useState('');
  useEffect(() => {
    document.documentElement.classList.add('tree-entry-is-open');
    return () => document.documentElement.classList.remove('tree-entry-is-open');
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    mainScrollRef.current?.scrollTo({ top: 0 });
    stepHeadingRef.current?.focus({ preventScroll: true });
    if (step !== 0 || !mobileMapView.current) return;
    const frame = requestAnimationFrame(() => {
      const view = mobileMapView.current;
      mapRef.current?.invalidateSize({ pan: false });
      if (view) mapRef.current?.setView(view.center, view.zoom, { animate: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);
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
    if (field === 'street_id' || field === 'street_name') addressEdited.current.address = true;
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
    setForm(current => ({ ...current, ...values, address: '', neighborhood: '', bairro_id: '', street_id: '', street_name: '' }));
    setAddressLookup('loading');
    setLocationRevision(value => value + 1);
  };
  const lookupNeighborhoodFromPoint = () => {
    if (!position || batchMode || savingRef.current || locating || speciesCreating || confirmDiscard || catalogLoading || catalogError || addressLookup === 'loading') return;
    // Consulta a posição existente e preserva a referência já informada.
    addressEdited.current = { address: Boolean(form.address?.trim()), neighborhood: Boolean(form.bairro_id) };
    setError(''); setAddressLookup('loading');
    setLocationRevision(value => value + 1);
  };
  const pick = point => {
    if (savingRef.current || confirmDiscard || speciesCreating) return;
    setNotice('');
    if (batchMode && nearbyTrees(existingTrees || [], { lat: point.latitude, lng: point.longitude }, 3).length) setNotice('Já existe uma árvore cadastrada a até 3 metros deste ponto. Confira a posição para evitar duplicidade.');
    if (batchMode) {
      const draft = { ...point, draftId: ++nextDraftId.current, addressStatus: 'queued' };
      setPoints(current => current.some(item => item.latitude.toFixed(7) === point.latitude.toFixed(7) && item.longitude.toFixed(7) === point.longitude.toFixed(7)) ? current : [...current, draft]);
    }
    else changeLocation({ latitude: point.latitude.toFixed(7), longitude: point.longitude.toFixed(7) });
  };
  const requestClose = () => {
    if (savingRef.current || locating) return;
    if (points.length || dirty || speciesCreating) setConfirmDiscard(true);
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
        if ((!addressEdited.current.address && address) || (!addressEdited.current.neighborhood && neighborhood)) setDirty(true);
        setForm(current => ({ ...current,
          ...(!addressEdited.current.address && address ? { address } : {}),
          ...(!addressEdited.current.neighborhood && neighborhood ? { neighborhood, bairro_id: '' } : {}),
        }));
        setAddressLookup(address && neighborhood ? 'success' : address || neighborhood ? 'partial' : 'failed');
      } catch {
        if (!cancelled) setAddressLookup('failed');
      } finally { clearTimeout(timeout); }
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(timeout); };
  }, [position, locationRevision]);
  useEffect(() => {
    if (!form.address || form.street_id || addressEdited.current.address) return;
    const street = findTreeStreet(form.address, streets, cityId, form.bairro_id);
    if (street) setForm(current => ({ ...current, street_id: street.id, street_name: street.name }));
  }, [streets, cityId, form.address, form.street_id, form.bairro_id]);
  useEffect(() => {
    if (addressEdited.current.neighborhood) return;
    const location = applyTreeBatchAddress({}, { address: form.address, suburb: form.neighborhood }, cityId, { neighborhoods: catalogs.neighborhoods });
    if (location.bairro_id && form.bairro_id !== location.bairro_id) setForm(current => ({ ...current, bairro_id: location.bairro_id, neighborhood: location.neighborhood }));
  }, [catalogs.neighborhoods, cityId, form.address, form.neighborhood, form.bairro_id]);
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
      if (planned && next === 1 && (!Number.isInteger(Number(form.planting_year)) || Number(form.planting_year) < 1900 || Number(form.planting_year) > 9999)) { setError('Informe o ano previsto de plantio.'); return; }
      if (next === 2) {
        if (catalogLoading || catalogError || addressLookup === 'loading' || batchAddressPending) return;
        try { treePayload({ ...form, common_name: form.common_name || 'Não identificada', ...(batchMode ? points[0] : {}) }, cityId); }
        catch (err) { setError(err.message); return; }
      }
    }
    if (step === 0 && next !== 0 && mapRef.current) mobileMapView.current = { center: mapRef.current.getCenter(), zoom: mapRef.current.getZoom() };
    setFurthestStep(current => Math.max(current, next)); setStep(next);
  };
  const submit = async event => {
    event.preventDefault();
    event.stopPropagation();
    if (step < 2) { goToStep(step + 1); return; }
    if (addressLookup === 'loading' || batchAddressPending || locating || savingRef.current || speciesCreating || catalogLoading || catalogError || confirmDiscard) return;
    setError(''); setSaving(true); savingRef.current = true;
    try {
      const species = catalogs.species.find(item => item.id === form.species_id);
      const neighborhood = catalogs.neighborhoods.find(item => item.id === form.bairro_id);
      const values = { ...form, common_name: species?.common_name || 'Não identificada', scientific_name: species?.scientific_name || '', origin: species?.origin || 'nao_identificada', neighborhood: neighborhood?.name || '' };
      if (batchMode) {
        const signal = batchLookupAbort.current.signal;
        const payloads = await treeBatchPayloads(values, points, cityId, {
          neighborhoods: catalogs.neighborhoods, streets, cache: batchLocationCache.current, signal,
          lookup: point => reverseGeocodePin(point, { invoke: (...args) => supabase.functions.invoke(...args) }),
          onProgress: progress => { if (!signal.aborted) setBatchProgress(progress); },
        });
        if (signal.aborted) return;
        setBatchProgress(null);
        await onSaveBatch(payloads, photo);
        const unidentified = payloads.filter(payload => !payload.bairro_id).length;
        const missingAddress = payloads.filter(payload => !payload.address).length;
        setNotice(`${points.length} ${points.length === 1 ? 'árvore cadastrada' : 'árvores cadastradas'}.${unidentified ? ` ${unidentified} sem bairro identificado.` : ''}${missingAddress ? ` ${missingAddress} sem rua identificada.` : ''} Você pode marcar novas árvores ou fechar o cadastro.`);
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
  const selectedSpecies = catalogs.species.find(item => item.id === form.species_id);
  const stageTitle = step === 0 ? 'Comece pelo local' : step === 1 ? planned ? 'Prepare o plantio' : 'Conte sobre a árvore' : 'Confira seu cadastro';
  const stageDescription = step === 0 ? batchMode ? 'Marque cada árvore no mapa. Confira os endereços abaixo.' : 'Escolha o tipo de cadastro e confira o endereço do ponto.' : step === 1 ? batchMode ? `Estes dados serão aplicados às ${points.length} árvores selecionadas.` : 'Identifique a espécie e adicione as informações que você tem.' : 'Você pode voltar a qualquer etapa para ajustar os dados.';
  return <Dialog open onOpenChange={open => { if (!open) requestClose(); }}>
    <DialogContent hideClose overlayClassName="tree-entry-overlay" data-batch-mode={batchMode} data-mobile-step={step} data-step={step} className="tree-entry-dialog tree-entry-redesign flex flex-col gap-0 overflow-hidden p-0" onClick={event => event.stopPropagation()} onInteractOutside={event => event.preventDefault()}>
      <DialogHeader className="tree-entry-header">
        <div className="tree-entry-heading"><span className="tree-entry-brand-icon"><Trees size={24} /></span><div><DialogTitle>{tree?.id ? 'Editar árvore' : batchMode ? 'Cadastrar várias árvores' : 'Cadastrar árvore'}</DialogTitle><DialogDescription>{city?.name} · Inventário de arborização</DialogDescription></div></div>
        <Button type="button" size="icon" variant="ghost" aria-label="Fechar cadastro" disabled={saving || locating} onClick={requestClose}><X size={20} /></Button>
      </DialogHeader>
      <EntryProgress step={step} furthestStep={furthestStep} blocked={blocked} onChange={goToStep} />
      <form onSubmit={submit} noValidate className="tree-entry-form">
        <div ref={mainScrollRef} className="tree-entry-main" data-testid="tree-form-scroll">
          <fieldset disabled={saving || confirmDiscard} className="tree-entry-layout">
            <section className="tree-entry-location" aria-label="Localização da árvore">
              <div className="tree-entry-map-heading"><div><MapPin size={18} /><h3>{step === 0 ? 'Localize no mapa' : 'Localização selecionada'}</h3></div><div className="tree-entry-map-actions">{step === 0 ? <Button type="button" variant="outline" size="sm" disabled={locating || blocked} onClick={locate}>{locating ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}Usar GPS</Button> : <Button type="button" variant="outline" size="sm" disabled={blocked} onClick={() => goToStep(0)}><Pencil size={14} />Alterar local</Button>}<MapLayerToggle layer={mapLayer} onLayerChange={setMapLayer} showLabel className="tree-entry-layer-toggle" /></div></div>
              <div className="tree-entry-map" data-testid="tree-form-map">
                <TreeMap city={city} trees={existingTrees} registrationMode={batchMode} onMapReady={handleMapReady} initialView={initialMapView} layer={mapLayer} onLayerChange={setMapLayer} externalControls position={batchMode ? null : position} onPick={blocked || step !== 0 ? undefined : pick} draftPoints={batchMode ? points : undefined} onRemoveDraft={index => { if (!blocked && step === 0) setPoints(current => current.filter((_, i) => i !== index)); }} />
                {batchMode && <div className="tree-entry-batch-map-key"><span><i />Já cadastrada</span><span><b>1</b>Novo ponto</span></div>}
              </div>
              <p className="tree-entry-map-instruction">{batchMode ? 'Toque para adicionar. Toque no número para remover o ponto.' : 'A posição do marcador será salva junto com o cadastro.'}</p>
            </section>
            <div ref={scrollRef} className="tree-entry-fields tree-entry-pane">
              <header className="tree-entry-stage-heading"><span className="tree-entry-eyebrow">ETAPA 0{step + 1} DE 03</span><h2 ref={stepHeadingRef} tabIndex={-1}>{stageTitle}</h2><p>{stageDescription}</p></header>
              <div className="tree-entry-location-fields" hidden={step !== 0}>
                {!reportMode && <EntryKind form={form} onChange={change} batchMode={batchMode} />}
                <TreeEntryAddressFields form={form} onChange={change} position={position} onLocationChange={changeLocation} streets={streets} neighborhoods={catalogs.neighborhoods} lookup={addressLookup} onLookup={lookupNeighborhoodFromPoint} catalogLoading={catalogLoading} catalogError={catalogError} streetsError={streetsError} onRetryStreets={() => setStreetRevision(value => value + 1)} blocked={blocked} manualNeighborhood={addressEdited.current.neighborhood} batchMode={batchMode} points={points} onPointsChange={setPoints} onLocatePoint={point => mapRef.current?.setView([point.latitude, point.longitude], Math.max(mapRef.current.getZoom(), 17), { animate: false })} />
              </div>
              <div className="tree-entry-data-fields" hidden={step !== 1}>
                <section className="tree-entry-identification" aria-label="Identificação da árvore">
                  <div className="tree-entry-card-heading"><span className="tree-entry-section-icon"><Leaf size={18} /></span><div><h3>Identificação</h3><p>{planned ? 'Espécie que você pretende plantar' : 'Espécie e situação da árvore'}</p></div>{tree?.public_code && <span className="tree-entry-code">{tree.public_code}</span>}</div>
                  <TreeSpeciesField species={catalogs.species} value={form.species_id} onSelect={selectSpecies} cityId={cityId} loading={catalogLoading} disabled={saving || !!catalogError} allowCreate={!reportMode} onCreatingChange={setSpeciesCreating} onCreated={speciesChanged} onUpdated={speciesChanged} />
                  {!reportMode && !planned && <div className="tree-entry-field-grid"><Field label="Situação"><select className={selectClass} value={form.status} onChange={event => change('status', event.target.value)}>{Object.entries(TREE_STATUS).filter(([value]) => value !== 'planejada').map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}</select></Field>{form.planting_year && <Field label="Plantio realizado em *"><Input type="date" max={new Date().toLocaleDateString('en-CA')} value={form.planted_at || ''} onChange={event => change('planted_at', event.target.value)} /></Field>}</div>}
                </section>
                <section className="tree-entry-photo" aria-label="Foto da árvore"><div className="tree-entry-photo-preview"><TreePhoto tree={{ ...form, photo_url: preview || form.photo_url, species_illustration_url: selectedSpecies?.illustration_url }} imageClassName="h-24 w-24 rounded-xl bg-surface-subtle object-contain" fallback={<Camera size={27} />} /></div><div className="tree-entry-photo-actions"><h3>{planned ? 'Foto do local de plantio' : 'Foto da árvore'}<span>Opcional</span></h3><p>{batchMode ? 'A mesma foto será usada no lote.' : 'JPG, PNG ou WebP · até 5 MB'}</p><div><Button type="button" variant="outline" size="sm" onClick={() => photoInput.current?.click()}><Camera size={15} />{preview || form.photo_url ? 'Trocar foto' : 'Adicionar foto'}</Button>{(preview || form.photo_url) && <Button type="button" variant="ghost" size="sm" onClick={() => { setPhoto(null); change('photo_url', ''); if (photoInput.current) photoInput.current.value = ''; }}>Remover foto</Button>}</div><label className="sr-only">Uma foto em JPG, PNG ou WebP, até 5 MB<Input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { setError('Selecione uma foto JPG, PNG ou WebP de até 5 MB.'); event.target.value = ''; return; } setError(''); setPhoto(file || null); setDirty(true); }} /></label></div></section>
                {!reportMode && <>
                  {!planned && <EntrySection title="Medidas e histórico" description="Altura, copa, DAP e data do plantio" Icon={Ruler} data-testid="tree-extra-fields"><div className="tree-entry-field-grid"><Field label="Altura (m)"><Input type="number" min="0.01" step="0.01" value={form.height_m ?? ''} onChange={event => change('height_m', event.target.value)} /></Field><Field label="Diâmetro da copa (m)"><Input type="number" min="0.01" step="0.01" value={form.crown_diameter_m ?? ''} onChange={event => change('crown_diameter_m', event.target.value)} /></Field><Field label="DAP (cm) — medido a 1,30 m do solo"><Input type="number" min="0.01" step="0.01" value={form.dap_cm ?? ''} onChange={event => change('dap_cm', event.target.value)} /></Field>{!form.planting_year && <Field label="Data do plantio"><Input type="date" max={new Date().toLocaleDateString('en-CA')} value={form.planted_at || ''} onChange={event => change('planted_at', event.target.value)} /></Field>}<Field label="Ano de nascimento estimado"><Input type="number" min="1" max={new Date().getFullYear()} value={form.estimated_birth_year ?? ''} onChange={event => change('estimated_birth_year', event.target.value)} /></Field></div></EntrySection>}
                  <TreeSurveyFields form={form} onChange={change} />
                  <EntrySection title="Manejo e informações complementares" description="Responsável, prazos e observações" Icon={Scissors}><div className="tree-entry-field-grid"><Field label="Responsável pelo plantio"><select className={selectClass} value={form.planted_by} onChange={event => change('planted_by', event.target.value)}>{Object.entries(TREE_PLANTED_BY).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field><Field label="Manejo necessário"><select className={selectClass} value={form.maintenance_action} onChange={event => change('maintenance_action', event.target.value)}>{Object.entries(TREE_ACTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Prazo do manejo"><Input type="date" disabled={form.maintenance_action === 'nenhuma'} value={form.maintenance_due_at || ''} onChange={event => change('maintenance_due_at', event.target.value)} /></Field><label className="tree-entry-checkbox"><input type="checkbox" checked={form.is_historic_site} onChange={event => change('is_historic_site', event.target.checked)} />Localizada no sítio histórico</label><Field label="Observações públicas" className="tree-entry-field-wide"><textarea className={selectClass} rows={3} maxLength={5000} value={form.notes || ''} onChange={event => change('notes', event.target.value)} placeholder="Condições e orientações de manejo. Evite dados pessoais." /></Field></div></EntrySection>
                </>}
              </div>
              {step === 2 && <EntryReview form={form} species={selectedSpecies} photo={photo} points={points} batchMode={batchMode} position={position} onEdit={goToStep} />}
              {catalogError && <div role="alert" className="tree-entry-alert"><p>{catalogError}</p><Button type="button" variant="outline" size="sm" onClick={() => setCatalogRevision(value => value + 1)}>Tentar novamente</Button></div>}
            </div>
          </fieldset>
        </div>
        <footer className="tree-entry-footer" data-testid="tree-form-footer">
          {error && <p role="alert" className="tree-entry-alert">{error}</p>}
          {notice && <p role="status" className="tree-entry-notice"><Check size={17} />{notice}</p>}
          {batchProgress && <p role="status" className="tree-entry-notice" data-testid="tree-batch-address-progress"><Loader2 size={17} className="animate-spin" />Identificando endereços: {batchProgress.completed} de {batchProgress.total} árvores…</p>}
          <div className="tree-entry-footer-actions"><p data-testid={batchMode ? 'tree-batch-points' : undefined}><span className={hasLocation ? 'is-ready' : ''}>{hasLocation ? <Check size={16} /> : <MapPin size={16} />}</span>{batchMode ? `${points.length} ${points.length === 1 ? 'árvore selecionada' : 'árvores selecionadas'}` : hasLocation ? 'Localização definida' : 'Marque um ponto no mapa'}</p><div><Button type="button" variant="outline" disabled={blocked} onClick={step === 0 ? requestClose : () => goToStep(step - 1)}>{step === 0 ? batchMode ? 'Cancelar cadastro' : 'Cancelar' : <><ArrowLeft size={16} />Voltar</>}</Button>{step < 2 ? <Button key="next" className="tree-entry-primary" type="button" disabled={blocked || !hasLocation || (step === 1 && (catalogLoading || !!catalogError || addressLookup === 'loading' || batchAddressPending))} onClick={() => goToStep(step + 1)}>{step === 0 ? 'Continuar' : 'Revisar cadastro'}{step === 1 && batchAddressPending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}</Button> : <Button key="save" className="tree-entry-primary" type="submit" disabled={blocked || !hasLocation || catalogLoading || !!catalogError || addressLookup === 'loading' || batchAddressPending}>{saving ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}{saving ? 'Salvando…' : batchMode ? `Salvar lote (${points.length})` : reportMode ? 'Usar na bronca' : tree?.id ? 'Salvar alterações' : planned ? 'Salvar planejamento' : 'Cadastrar árvore'}</Button>}</div></div>
        </footer>
      </form>
    </DialogContent>
    <TreeDiscardDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={onClose} pointsCount={batchMode ? points.length : 0} />
  </Dialog>;
}
