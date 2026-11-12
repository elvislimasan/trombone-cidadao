import React, { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TaskDialogContent, TaskDialogFooter } from '@/components/ui/task-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { cityStateUf } from '@/lib/cityLocation';
import { adoptionItems, adoptionProtocol, ADOPTION_PURPOSES, EMPTY_ADOPTION, availableAdoptionSpecies, validateAdoption } from '@/lib/treeAdoption';
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
  const dataRef = useRef(null);
  const localRef = useRef(null);
  const speciesRef = useRef(null);
  const cityLabel = [city?.name, cityStateUf(city)].filter(Boolean).join(' · ');
  const availableCatalog = { ...catalog, species: availableAdoptionSpecies(catalog.species, catalog.availability) };
  const changed = JSON.stringify(editablePayload(form)) !== JSON.stringify(editablePayload({ ...EMPTY_ADOPTION, ...request, items: adoptionItems(request) }));
  const change = values => { setError(''); setForm(current => ({ ...current, ...values })); };
  const save = async event => {
    event.preventDefault();
    if (busyRef.current || locating || !changed) return;
    for (const step of [0, 1, 2]) {
      const message = validateAdoption(form, request.city_id, availableCatalog.species, step, catalog.availability, '', { requireCpf: false });
      if (message) {
        setError(message);
        requestAnimationFrame(() => [dataRef, localRef, speciesRef][step].current?.scrollIntoView({ block: 'start' }));
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
      <DialogHeader className="task-dialog-heading"><DialogTitle>Alterar pedido {adoptionProtocol(request)}</DialogTitle><DialogDescription>{cityLabel}</DialogDescription></DialogHeader>
      <div className="task-dialog-body adoption-edit-body tree-form-theme" data-task-scroll>
        <form id="tree-adoption-edit" onSubmit={save} noValidate>
          <fieldset disabled={busy} className="min-w-0">
            <section ref={localRef} className="adoption-edit-section" aria-label="Local de plantio">
              <TreeAdoptionLocation intro={<h3 className="adoption-form-intro text-base font-semibold">Local de plantio</h3>} form={form} city={city} cityLabel={cityLabel} onChange={change} busy={busy} onLocatingChange={setLocating} />
            </section>
            <section ref={speciesRef} className="adoption-edit-section" aria-label="Espécies e quantidade">
              <h3 className="adoption-edit-section-title">Espécies e quantidade</h3>
              <TreeAdoptionSpecies catalog={availableCatalog} form={form} onChange={change} cityId={request.city_id} />
            </section>
            <section ref={dataRef} className="adoption-edit-section" aria-label="Dados e contato">
              <h3 className="adoption-edit-section-title">Dados e contato</h3>
              <div className="adoption-edit-fields">
                <label className="adoption-field">Finalidade<select value={form.purpose} onChange={event => change({ purpose: event.target.value })}>{Object.entries(ADOPTION_PURPOSES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
                <label className="adoption-field">Nome completo<Input maxLength={160} autoComplete="name" value={form.requester_name || ''} onChange={event => change({ requester_name: event.target.value })} /></label>
                <label className="adoption-field">Telefone / WhatsApp com DDD<Input maxLength={30} type="tel" autoComplete="tel" value={form.requester_phone || ''} onChange={event => change({ requester_phone: event.target.value })} /></label>
                <label className="adoption-field">E-mail (opcional)<Input maxLength={254} type="email" autoComplete="email" value={form.requester_email || ''} onChange={event => change({ requester_email: event.target.value })} /></label>
                <label className="adoption-field adoption-edit-notes">Observação (opcional)<textarea rows={3} maxLength={3000} value={form.notes || ''} onChange={event => change({ notes: event.target.value })} /></label>
              </div>
            </section>
          </fieldset>
        </form>
      </div>
      <TaskDialogFooter>{error && <p role="alert" className="adoption-edit-error">{error}</p>}<p className="adoption-edit-status">Ao salvar, o pedido volta para análise. Agendamentos anteriores serão cancelados.</p><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" form="tree-adoption-edit" disabled={busy || locating || !changed || catalog.loading || Boolean(catalog.error)}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar alterações</Button></TaskDialogFooter>
    </TaskDialogContent>
  </Dialog>;
}
