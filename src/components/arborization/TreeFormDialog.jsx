import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, LocateFixed } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TreeMap from './TreeMap';
import { EMPTY_TREE, TREE_ACTIONS, TREE_ORIGINS, TREE_STATUS, treePayload } from '@/lib/arborization';
import { reverseGeocodePin } from '@/lib/reverseGeocodePin';
import { supabase } from '@/lib/customSupabaseClient';

const selectClass = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';
const Field = ({ label, children }) => <label className="grid min-w-0 gap-1.5 text-sm font-medium">{label}{children}</label>;

export default function TreeFormDialog({ tree, city, cityId, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_TREE, ...tree }));
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [addressLookup, setAddressLookup] = useState('idle');
  const [locationRevision, setLocationRevision] = useState(0);
  const addressEdited = useRef({ address: false, neighborhood: false });
  const [error, setError] = useState('');
  const change = (field, value) => {
    if (field === 'address' || field === 'neighborhood') addressEdited.current[field] = true;
    setForm(current => ({ ...current, [field]: value }));
  };
  const position = useMemo(() => {
    if (String(form.latitude ?? '').trim() === '' || String(form.longitude ?? '').trim() === '') return null;
    const latitude = Number(String(form.latitude).replace(',', '.')), longitude = Number(String(form.longitude).replace(',', '.'));
    return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
  }, [form.latitude, form.longitude]);
  const changeLocation = values => {
    addressEdited.current = { address: false, neighborhood: false };
    setForm(current => ({ ...current, ...values, address: '', neighborhood: '' }));
    setAddressLookup('loading');
    setLocationRevision(value => value + 1);
  };
  const pick = point => changeLocation({ latitude: point.latitude.toFixed(7), longitude: point.longitude.toFixed(7) });

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
          ...(!addressEdited.current.neighborhood ? { neighborhood } : {}),
        }));
        setAddressLookup(address && neighborhood ? 'success' : address || neighborhood ? 'partial' : 'failed');
      } catch {
        if (!cancelled) setAddressLookup('failed');
      } finally { clearTimeout(timeout); }
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(timeout); };
  }, [position, locationRevision]);
  const locate = () => {
    if (!navigator.geolocation) { setError('A localização não está disponível neste dispositivo. Marque o ponto no mapa.'); return; }
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(({ coords }) => { pick({ latitude: coords.latitude, longitude: coords.longitude }); setLocating(false); }, () => { setError('Não foi possível obter sua localização. Marque o ponto no mapa.'); setLocating(false); }, { enableHighAccuracy: true, timeout: 10000 });
  };
  const submit = async event => {
    event.preventDefault();
    if (addressLookup === 'loading' || locating || saving) return;
    setError(''); setSaving(true);
    try { await onSave(treePayload(form, cityId), tree?.id); onClose(); }
    catch (err) { setError(err.message || 'Não foi possível salvar a árvore. Tente novamente.'); }
    finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto" onInteractOutside={event => saving && event.preventDefault()}>
      <DialogHeader><DialogTitle>{tree?.id ? 'Editar árvore' : 'Cadastrar árvore'}</DialogTitle><DialogDescription>Inventário de arborização de {city?.name}. Marque a localização e registre as condições da árvore.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={saving} className="min-w-0 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome popular / identificação *"><Input required maxLength={160} value={form.common_name} onChange={event => change('common_name', event.target.value)} placeholder="Ex.: Ipê-amarelo" /></Field>
            <Field label="Nome científico"><Input maxLength={200} value={form.scientific_name || ''} onChange={event => change('scientific_name', event.target.value)} placeholder="Ex.: Handroanthus albus" /></Field>
            <Field label="Origem"><select className={selectClass} value={form.origin} onChange={event => change('origin', event.target.value)}>{Object.entries(TREE_ORIGINS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Situação"><select className={selectClass} value={form.status} onChange={event => change('status', event.target.value)}>{Object.entries(TREE_STATUS).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Localização * <span className="font-normal text-muted-foreground">Clique no mapa ou arraste o marcador.</span></p><Button type="button" variant="outline" size="sm" disabled={locating} onClick={locate}>{locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}Usar GPS</Button></div>
            <div className="relative isolate h-64 overflow-hidden rounded-xl border"><TreeMap city={city} position={position} onPick={pick} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Endereço / referência"><Input maxLength={300} value={form.address || ''} onChange={event => change('address', event.target.value)} placeholder="Rua, número ou praça" /></Field>
              <Field label="Bairro"><Input maxLength={160} value={form.neighborhood || ''} onChange={event => change('neighborhood', event.target.value)} /></Field>
            </div>
            <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
              {addressLookup === 'loading' && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
              {addressLookup === 'loading' ? 'Buscando rua e bairro pela posição do mapa…'
                : addressLookup === 'failed' ? 'Não foi possível identificar rua e bairro. Preencha os campos manualmente.'
                : addressLookup === 'partial' ? 'Localização consultada. Complete os campos que não foram identificados.'
                : addressLookup === 'success' ? 'Rua e bairro preenchidos pela localização. Você pode ajustar os campos.'
                : 'Marque um ponto no mapa para preencher rua e bairro automaticamente.'}
            </p>
            <div className="grid grid-cols-2 gap-3"><Field label="Latitude"><Input required inputMode="decimal" value={form.latitude} onChange={event => changeLocation({ latitude: event.target.value })} placeholder="-8.597031" /></Field><Field label="Longitude"><Input required inputMode="decimal" value={form.longitude} onChange={event => changeLocation({ longitude: event.target.value })} placeholder="-38.574217" /></Field></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Altura (m)"><Input type="number" min="0.01" step="0.01" value={form.height_m ?? ''} onChange={event => change('height_m', event.target.value)} /></Field>
            <Field label="Diâmetro da copa (m)"><Input type="number" min="0.01" step="0.01" value={form.crown_diameter_m ?? ''} onChange={event => change('crown_diameter_m', event.target.value)} /></Field>
            <Field label="Data do plantio"><Input type="date" value={form.planted_at || ''} onChange={event => change('planted_at', event.target.value)} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Manejo necessário"><select className={selectClass} value={form.maintenance_action} onChange={event => change('maintenance_action', event.target.value)}>{Object.entries(TREE_ACTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Prazo do manejo"><Input type="date" disabled={form.maintenance_action === 'nenhuma'} value={form.maintenance_due_at || ''} onChange={event => change('maintenance_due_at', event.target.value)} /></Field></div>
          <Field label="Observações públicas"><textarea className={`${selectClass} h-24 py-2`} maxLength={5000} value={form.notes || ''} onChange={event => change('notes', event.target.value)} placeholder="Condições da árvore, conflitos com a rede elétrica e orientações de manejo. Evite dados pessoais." /></Field>
        </fieldset>
        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving || locating || addressLookup === 'loading'}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar árvore</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
