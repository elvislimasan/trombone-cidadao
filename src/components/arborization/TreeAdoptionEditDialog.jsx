import React, { useId, useRef, useState } from 'react';
import { Loader2, MapPin, Sprout, User } from 'lucide-react';
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TaskDialogContent, TaskDialogFooter } from '@/components/ui/task-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/customSupabaseClient';
import { cityStateUf } from '@/lib/cityLocation';
import { adoptionItems, adoptionProtocol, ADOPTION_PURPOSES, EMPTY_ADOPTION, editableAdoptionSpecies, validateAdoption } from '@/lib/treeAdoption';
import TreeAdoptionLocation from './TreeAdoptionLocation';
import TreeAdoptionSpecies from './TreeAdoptionSpecies';
import './treeAdoption.css';
import './treeAdoptionFlow.css';
import './treeAdoptionEdit.css';

const editablePayload = form => ({
  request_type: form.request_type,
  purpose: form.purpose,
  zone: form.zone,
  planting_place: form.planting_place,
  overhead_wiring: form.overhead_wiring,
  items: adoptionItems(form).map(item => ({ species_id: item.species_id, provider: item.provider, quantity: Number(item.quantity) })),
  requester_name: String(form.requester_name || '').trim(),
  requester_phone: String(form.requester_phone || '').trim(),
  requester_email: String(form.requester_email || '').trim(),
  address: String(form.address || '').trim(),
  reference_point: String(form.reference_point || '').trim(),
  neighborhood: String(form.neighborhood || '').trim(),
  latitude: Number(form.latitude),
  longitude: Number(form.longitude),
  notes: String(form.notes || '').trim(),
});

export default function TreeAdoptionEditDialog({ request, catalog, city, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_ADOPTION, ...request, items: adoptionItems(request), commitment: true }));
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('species');
  const formId = useId();
  const bodyRef = useRef(null);
  const changeTab = value => { setTab(value); if (bodyRef.current) bodyRef.current.scrollTop = 0; };
  const cityLabel = [city?.name, cityStateUf(city)].filter(Boolean).join(' · ');
  const editableCatalog = { ...catalog, species: editableAdoptionSpecies(catalog.species, catalog.availability) };
  const changed = JSON.stringify(editablePayload(form)) !== JSON.stringify(editablePayload({ ...EMPTY_ADOPTION, ...request, items: adoptionItems(request) }));
  const change = values => { setError(''); setForm(current => ({ ...current, ...values })); };
  const save = async event => {
    event.preventDefault();
    if (busyRef.current || locating || !changed) return;
    for (const step of [0, 1, 2]) {
      const message = validateAdoption(form, request.city_id, editableCatalog.species, step, catalog.availability, '', { requireCpf: false, allowConsultation: true });
      if (message) {
        setError(message);
        const invalidTab = message === 'Informe a finalidade.' ? 'location' : ['contact', 'location', 'species'][step];
        changeTab(invalidTab);
        requestAnimationFrame(() => bodyRef.current?.parentElement.querySelector(`[data-edit-tab="${invalidTab}"]`)?.focus());
        return;
      }
    }
    busyRef.current = true; setBusy(true); setError('');
    try {
      const { data, error: failure } = await supabase.rpc('edit_tree_adoption', {
        p_id: request.id, p_expected_updated_at: request.updated_at, p_changes: editablePayload(form),
      });
      if (failure) throw failure;
      if (!data?.id) throw new Error('Não foi possível confirmar a alteração do pedido.');
      window.dispatchEvent(new Event('tree-adoption-updated'));
      onSaved();
    } catch (cause) { setError(cause.message || 'Não foi possível salvar as alterações.'); if (cause.code === '23514') catalog.refresh(); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busyRef.current) onClose(); }}>
    <TaskDialogContent className="adoption-edit-dialog" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
      <DialogHeader className="task-dialog-heading text-left"><DialogTitle>Alterar pedido {adoptionProtocol(request)}</DialogTitle><DialogDescription>{cityLabel}</DialogDescription></DialogHeader>
      <Tabs value={tab} onValueChange={changeTab} className="adoption-edit-tabs tree-form-theme">
        <TabsList aria-label="Seções do pedido" className="adoption-edit-navigation">
          <TabsTrigger data-edit-tab="species" value="species" disabled={busy || locating}><Sprout size={18} aria-hidden="true" />Espécies</TabsTrigger>
          <TabsTrigger data-edit-tab="location" value="location" disabled={busy || locating}><MapPin size={18} aria-hidden="true" />Local de plantio</TabsTrigger>
          <TabsTrigger data-edit-tab="contact" value="contact" disabled={busy || locating}><User size={18} aria-hidden="true" />Contato</TabsTrigger>
        </TabsList>
      <div ref={bodyRef} className="task-dialog-body adoption-edit-body" data-task-scroll>
        <form id={formId} onSubmit={save} noValidate>
          <fieldset disabled={busy} className="min-w-0">
            <TabsContent value="species" className="adoption-edit-section">
              <h3 className="adoption-edit-section-title">Espécies e quantidade</h3>
              <TreeAdoptionSpecies catalog={editableCatalog} form={form} onChange={change} cityId={request.city_id} allowConsultation />
            </TabsContent>
            <TabsContent value="location" className="adoption-edit-section">
              <h3 className="adoption-edit-section-title">Local de plantio</h3>
              <div className="adoption-edit-purpose"><label className="adoption-field">Finalidade<select value={form.purpose} onChange={event => change({ purpose: event.target.value })}>{Object.entries(ADOPTION_PURPOSES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label></div>
              <TreeAdoptionLocation form={form} city={city} cityLabel={cityLabel} onChange={change} busy={busy} onLocatingChange={setLocating} />
            </TabsContent>
            <TabsContent value="contact" className="adoption-edit-section">
              <h3 className="adoption-edit-section-title">Contato</h3>
              <div className="adoption-edit-fields">
                <label className="adoption-field">Nome completo<Input maxLength={160} autoComplete="name" value={form.requester_name || ''} onChange={event => change({ requester_name: event.target.value })} /></label>
                <label className="adoption-field">Telefone / WhatsApp com DDD<Input maxLength={30} type="tel" autoComplete="tel" value={form.requester_phone || ''} onChange={event => change({ requester_phone: event.target.value })} /></label>
                <label className="adoption-field">E-mail (opcional)<Input maxLength={254} type="email" autoComplete="email" value={form.requester_email || ''} onChange={event => change({ requester_email: event.target.value })} /></label>
                <label className="adoption-field adoption-edit-notes">Observação (opcional)<textarea rows={3} maxLength={3000} value={form.notes || ''} onChange={event => change({ notes: event.target.value })} /></label>
              </div>
            </TabsContent>
          </fieldset>
        </form>
      </div>
      </Tabs>
      <TaskDialogFooter>{error && <p role="alert" className="adoption-edit-error">{error}</p>}<p className="adoption-edit-status">Ao salvar, o pedido volta para análise. Agendamentos anteriores serão cancelados.</p><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" form={formId} disabled={busy || locating || !changed || catalog.loading || Boolean(catalog.error)}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar alterações</Button></TaskDialogFooter>
    </TaskDialogContent>
  </Dialog>;
}
