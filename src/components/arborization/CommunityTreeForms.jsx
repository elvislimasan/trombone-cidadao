import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Droplets, Eye, Loader2, MapPin, MessageSquare, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { cityStateUf } from '@/lib/cityLocation';
import { loadPickupMapCenter } from '@/lib/treePickup';
import { COMMUNITY_CARE_ACTIONS, communityToday, recordCommunityCare, submitCommunityTree, validateCommunityCare, validateCommunityTree } from '@/lib/communityTrees';
import TreeSpeciesField from './TreeSpeciesField';
import CommunityPhotoInput from './CommunityPhotoInput';
export { CommunityPhotoInput };
import './communityTrees.css';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

export function useCommunityAction(onSaved) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const ref = useRef(false);
  const run = async task => {
    if (ref.current) return;
    ref.current = true; setBusy(true); setError('');
    try { const result = await task(); await onSaved?.(result); }
    catch (failure) { setError(failure.message || 'Não foi possível concluir. Tente novamente.'); }
    finally { ref.current = false; setBusy(false); }
  };
  return { busy, error, setError, run };
}

export function CommunityPrivacyFields({ value, onChange }) {
  return <div className="community-privacy-fields">
    <label className="community-check-row"><input type="checkbox" checked={value.public_profile} onChange={event => onChange({ public_profile: event.target.checked })} /><span><strong>Perfil público após aprovação</strong><small>As fotos e os cuidados marcados como públicos poderão ser vistos e compartilhados. Você pode desativar depois.</small></span></label>
    <fieldset><legend>O que mostrar sobre a localização?</legend><div className="community-privacy-options">{[
      ['city', 'Somente a cidade', 'O endereço e o ponto no mapa ficam reservados a você e à equipe municipal.'],
      ['exact', 'Localização no mapa', 'O ponto e o endereço informado aparecerão no perfil público aprovado.'],
    ].map(([key, title, text]) => <label key={key} className={value.location_visibility === key ? 'is-selected' : ''}><input type="radio" name="community-location-visibility" checked={value.location_visibility === key} onChange={() => onChange({ location_visibility: key })} /><span><strong>{title}</strong><small>{text}</small></span></label>)}</div></fieldset>
  </div>;
}

export function CommunityTreeRegistrationForm({ cities, initialCityId, initial, userId, onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({ id: initial?.id || crypto.randomUUID(), city_id: initial?.city_id || initialCityId || '', name: initial?.name || '', species_id: initial?.species_id || '', address: initial?.address || '', latitude: initial?.latitude ?? null, longitude: initial?.longitude ?? null, planted_on: initial?.planted_on || '', public_profile: initial?.public_profile ?? true, location_visibility: initial?.location_visibility || 'city', cover_photo: initial?.cover_photo || null }));
  const [file, setFile] = useState(null), [step, setStep] = useState(0), [species, setSpecies] = useState([]), [speciesError, setSpeciesError] = useState(''), [center, setCenter] = useState(null);
  const action = useCommunityAction(onSaved), heading = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const city = cities.find(row => String(row.id) === String(form.city_id));
  const change = patch => { action.setError(''); setForm(current => ({ ...current, ...patch })); };
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    let active = true; setSpecies([]); setSpeciesError(''); setCenter(null);
    if (!form.city_id) return;
    supabase.from('city_tree_species').select('id,common_name,scientific_name').eq('city_id', form.city_id).order('common_name').then(({ data, error }) => {
      if (active) { setSpecies(data || []); if (error) setSpeciesError('As espécies não carregaram. Você pode continuar sem identificar.'); }
    });
    loadPickupMapCenter(supabase, form.city_id).then(point => { if (active) setCenter(point); });
    return () => { active = false; };
  }, [form.city_id]);
  const submit = event => {
    event.preventDefault();
    if (photoBusy || action.busy) return;
    if (step === 0) {
      if (!city) { action.setError('Selecione a cidade da árvore.'); return; }
      if (form.name.trim().length < 3 || form.name.trim().length > 100) { action.setError('Dê um nome à árvore (3 a 100 caracteres).'); return; }
      if (!file && !form.cover_photo) { action.setError('Adicione uma foto da árvore.'); return; }
    }
    if (step === 1 && (form.latitude == null || form.longitude == null)) { action.setError('Marque no mapa onde a árvore está.'); return; }
    if (step < 2) { setStep(current => current + 1); action.setError(''); return; }
    const error = validateCommunityTree(form); if (error) { action.setError(error); return; }
    action.run(() => submitCommunityTree(supabase, form, file, userId));
  };
  return <form className="community-form" onSubmit={submit} aria-label="Cadastrar árvore da comunidade" noValidate>
    <ol className="community-stepper" aria-label="Etapas do cadastro">{['A árvore', 'Localização', 'Privacidade'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined}><span>{step > index ? <Check size={17} /> : index + 1}</span>{label}</li>)}</ol>
    <div className="community-form-body"><h2 ref={heading} tabIndex={-1}>{['Vamos conhecer sua árvore', 'Onde a árvore está?', 'Você escolhe o que compartilhar'][step]}</h2>
      <fieldset disabled={action.busy || photoBusy} className="community-form-fields">
        {step === 0 && <div className="community-registration-grid"><CommunityPhotoInput file={file} onChange={setFile} initialUrl={initial?.photo_url} onBusyChange={setPhotoBusy} disabled={action.busy} /><div className="community-field-stack">
          <label>Cidade<select required value={form.city_id} disabled={Boolean(initial)} onChange={event => change({ city_id: event.target.value, species_id: '', latitude: null, longitude: null, address: '' })}><option value="">Selecione a cidade</option>{cities.map(row => <option key={row.id} value={row.id}>{row.name}{cityStateUf(row) ? ` · ${cityStateUf(row)}` : ''}</option>)}</select></label>
          <label>Nome da árvore<Input value={form.name} maxLength={100} placeholder="Ex.: Meu ipê, Mangueira do quintal" onChange={event => change({ name: event.target.value })} /></label>
          <TreeSpeciesField species={species} value={form.species_id} label="Espécie (se souber)" cityId={form.city_id} allowCreate={false} allowEdit={false} allowUnknown disabled={!city} onSelect={row => change({ species_id: row?.id || '' })} />
          {speciesError && <p className="community-muted">{speciesError}</p>}
          <label>Data do plantio <small>Opcional</small><Input type="date" max={communityToday()} value={form.planted_on} onChange={event => change({ planted_on: event.target.value })} /></label>
        </div></div>}
        {step === 1 && <div className="community-location-grid"><div className="community-field-stack"><p className="community-location-city"><MapPin size={18} />{city?.name}</p><p className="community-muted">Toque no mapa para marcar a árvore. A equipe terá acesso ao ponto para revisar o cadastro.</p><label>Endereço ou referência <small>Opcional</small><Input maxLength={300} value={form.address} placeholder="Rua, número ou referência" onChange={event => change({ address: event.target.value })} /></label>{form.latitude != null && <p className="community-inline-success"><Check size={17} />Local marcado</p>}</div><div className="community-registration-map"><Suspense fallback={<Loader2 className="animate-spin" />}><LocationPickerMap key={form.city_id} initialPosition={form.latitude != null ? { lat: form.latitude, lng: form.longitude } : center} focusPosition={form.latitude != null ? { lat: form.latitude, lng: form.longitude } : null} fallbackCityCenter={{ name: city?.name || '', uf: cityStateUf(city) }} initialZoom={15} showMarker={form.latitude != null} showLocateButton onLocationChange={point => change({ latitude: point.lat, longitude: point.lng })} /></Suspense></div></div>}
        {step === 2 && <><CommunityPrivacyFields value={form} onChange={change} /><p className="community-form-notice"><Eye size={18} />O cadastro e as fotos ficarão disponíveis apenas para você e a equipe até a aprovação.</p></>}
      </fieldset>
      {action.error && <p role="alert" className="community-error">{action.error}</p>}
    </div>
    <footer className="community-form-footer"><Button type="button" variant="ghost" disabled={action.busy || photoBusy} onClick={() => { if (step) { setStep(current => current - 1); action.setError(''); } else onCancel(); }}><ArrowLeft size={17} />{step ? 'Voltar' : 'Cancelar'}</Button><Button disabled={action.busy || photoBusy} type="submit">{action.busy ? <Loader2 size={17} className="animate-spin" /> : step === 2 ? <Sprout size={17} /> : null}{action.busy ? 'Enviando…' : step === 2 ? 'Enviar para aprovação' : 'Continuar'}{step < 2 && <ArrowRight size={17} />}</Button></footer>
  </form>;
}

export function CommunityCareForm({ tree, userId, onSaved, onCancel, onBusyChange }) {
  const [form, setForm] = useState(() => ({ id: crypto.randomUUID(), tree_id: tree.id, action: 'watering', performed_on: communityToday(), notes: '', is_public: true }));
  const [file, setFile] = useState(null); const action = useCommunityAction(onSaved);
  const [photoBusy, setPhotoBusy] = useState(false);
  useEffect(() => { onBusyChange?.(action.busy || photoBusy); }, [action.busy, photoBusy, onBusyChange]);
  const icons = { watering: Droplets, growth: Sprout, observation: MessageSquare };
  return <form className="community-small-form" aria-label="Registrar cuidado" onSubmit={event => { event.preventDefault(); if (photoBusy || action.busy) return; const error = validateCommunityCare(form); if (error) { action.setError(error); return; } action.run(() => recordCommunityCare(supabase, form, file, userId)); }}>
    <fieldset disabled={action.busy || photoBusy} className="community-field-stack"><div className="community-care-choices">{Object.entries(COMMUNITY_CARE_ACTIONS).map(([key, title]) => { const Icon = icons[key]; return <label key={key} className={form.action === key ? 'is-selected' : ''}><input type="radio" name="care-action" checked={form.action === key} onChange={() => setForm(current => ({ ...current, action: key }))} /><Icon size={22} />{title}</label>; })}</div>
      <label>Quando foi?<Input required type="date" max={communityToday()} value={form.performed_on} onChange={event => setForm(current => ({ ...current, performed_on: event.target.value }))} /></label>
      <label>Observação <small>Opcional</small><textarea maxLength={1500} rows={3} placeholder="Como sua árvore está?" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /></label>
      <CommunityPhotoInput optional file={file} onChange={setFile} onBusyChange={setPhotoBusy} disabled={action.busy} />
      <label className="community-check-row"><input type="checkbox" checked={form.is_public} onChange={event => setForm(current => ({ ...current, is_public: event.target.checked }))} /><span><strong>Mostrar este cuidado no perfil público</strong><small>{tree.status === 'approved' && tree.public_profile ? 'Desmarque para guardar só no seu acompanhamento.' : 'Só será publicado quando o perfil da árvore estiver aprovado e público.'}</small></span></label>
    </fieldset>
    {action.error && <p role="alert" className="community-error">{action.error}</p>}
    <div className="community-form-footer"><Button type="button" variant="ghost" disabled={action.busy || photoBusy} onClick={onCancel}>Cancelar</Button><Button type="submit" disabled={action.busy || photoBusy}>{action.busy && <Loader2 size={17} className="animate-spin" />}Salvar cuidado</Button></div>
  </form>;
}
