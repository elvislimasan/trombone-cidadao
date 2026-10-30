import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Clock3, Leaf, Loader2, MapPin, Pencil, Plus, Search, Sprout, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { useCanManageArborization } from '@/hooks/useCanManageArborization';
import { ADOPTION_AVAILABILITY } from '@/lib/treeAdoption';
import { treeNameKey } from '@/lib/treeInventory';
import { pickupDetails, pickupInstructions, pickupPayload, validatePickup, PICKUP_DAYS } from '@/lib/treePickup';
import TreePickupFields from './TreePickupFields';
import TreeSpeciesField from './TreeSpeciesField';
import TreeAdoptionAvailabilityList from './TreeAdoptionAvailabilityList';

export function NurseryPickupSummary({ nursery, compact = false }) {
  const pickup = pickupDetails(nursery);
  return <div className="tree-nursery-pickup">
    <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{pickup.address || 'Endereço não informado'}</span></p>
    {(compact ? pickup.schedule.slice(0, 1) : pickup.schedule).map((period, index) => <p key={index} className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" /><span>{period.days.map(day => PICKUP_DAYS[day]).join(', ')} · {period.from} às {period.to}</span></p>)}
    {compact && pickup.schedule.length > 1 && <p className="tree-nursery-more-periods">+{pickup.schedule.length - 1} {pickup.schedule.length === 2 ? 'período de atendimento' : 'períodos de atendimento'}</p>}
    {pickup.legacy_hours && !pickup.schedule.length && <p className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" /><span>{pickup.legacy_hours}</span></p>}
    {!compact && pickup.notes && <p className="whitespace-pre-wrap">{pickup.notes}</p>}
    {pickup.latitude != null && pickup.longitude != null && <a href={`https://www.google.com/maps/search/?api=1&query=${pickup.latitude},${pickup.longitude}`} target="_blank" rel="noreferrer" className="font-semibold text-primary underline">Ver viveiro no mapa</a>}
  </div>;
}

function nurserySummary(nursery, offers) {
  const pickup = pickupDetails(nursery);
  const missing = [!pickup.address.trim() && 'endereço', !pickup.schedule.length && !pickup.legacy_hours && 'horários'].filter(Boolean);
  return { offers, available: offers.filter(row => row.status === 'disponivel').length,
    pending: offers.filter(row => row.status === 'sob_consulta').length, missing };
}

function NurserySteps({ current }) {
  return <ol className="nursery-steps" aria-label="Etapas do cadastro">
    {['Local', 'Atendimento', 'Espécies'].map((label, index) => <li key={label} aria-current={current === index ? 'step' : undefined} className={index < current ? 'is-done' : ''}><span>{index < current ? <CheckCircle2 size={17} /> : index + 1}</span><strong>{label}</strong></li>)}
  </ol>;
}

export function NurseryEditor({ nursery, cityId, city, onClose, onSaved }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(nursery?.name || '');
  const [pickup, setPickup] = useState(() => pickupDetails(nursery));
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const headingRef = useRef(null);
  useEffect(() => { headingRef.current?.focus(); }, [step]);
  const save = async event => {
    event.preventDefault();
    if (busyRef.current || locating) return;
    if (name.trim().length < 3 || name.trim().length > 160) { setError('Informe o nome do viveiro (3 a 160 caracteres).'); return; }
    if (pickup.address.trim().length < 5) { setError('Informe o endereço do viveiro (pelo menos 5 caracteres).'); return; }
    if (step === 0) { setError(''); setStep(1); return; }
    const validation = validatePickup(pickup);
    if (validation) { setError(validation); return; }
    if (!pickupPayload(pickup).schedule.length && !pickup.legacy_hours) { setError('Informe os dias e horários de atendimento do viveiro.'); return; }
    busyRef.current = true; setBusy(true); setError('');
    try {
      const payload = { name: name.trim(), pickup_details: pickupPayload(pickup), instructions: pickupInstructions(pickup) || null };
      const query = nursery ? supabase.from('tree_nurseries').update(payload).eq('id', nursery.id).eq('city_id', cityId)
        : supabase.from('tree_nurseries').insert({ ...payload, city_id: cityId });
      const { data, error: failure } = await query.select('*').single();
      if (failure) throw failure;
      onSaved(data);
    } catch { setError('Não foi possível salvar o viveiro. Seus dados foram mantidos. Tente novamente.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <form onSubmit={save} className="tree-availability-editor tree-nursery-editor" aria-label={nursery ? 'Editar viveiro' : 'Cadastrar viveiro'}>
    <div className="tree-availability-summary"><div><h3>{nursery ? 'Editar viveiro' : 'Novo viveiro'}</h3><p className="mt-1 text-xs text-content-secondary">{nursery ? nursery.name : 'Cadastre o local e depois adicione as espécies.'}</p></div><Button type="button" variant="ghost" size="sm" disabled={busy || locating} onClick={onClose}>Cancelar</Button></div>
    <NurserySteps current={step} />
    <div className="nursery-form-stage">
      <div className="nursery-form-intro"><span className="tree-nursery-icon">{step === 0 ? <MapPin size={24} /> : <Clock3 size={24} />}</span><div><h4 ref={headingRef} tabIndex={-1}>{step === 0 ? 'Onde fica o viveiro?' : 'Quando o cidadão pode retirar?'}</h4><p>{step === 0 ? 'Informe o nome e o endereço do local de retirada.' : 'Defina os dias e horários de atendimento deste viveiro.'}</p></div></div>
      <fieldset disabled={busy} className="tree-availability-body">
        {step === 0 && <label className="nursery-name-field grid gap-2 text-sm font-medium">Nome do viveiro<Input required minLength={3} maxLength={160} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Viveiro municipal" /></label>}
        <TreePickupFields section={step === 0 ? 'location' : 'schedule'} value={pickup} onChange={patch => setPickup(current => ({ ...current, ...patch }))} cityId={cityId} city={city} busy={busy} onLocatingChange={setLocating} />
      </fieldset>
    </div>
    {error && <p role="alert" className="nursery-form-error"><AlertCircle size={17} />{error}</p>}
    <div className="tree-availability-footer"><Button type="button" variant="ghost" disabled={busy || locating} onClick={() => { if (step) { setStep(0); setError(''); } else onClose(); }}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button><Button type="submit" disabled={busy || locating}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{step === 0 ? 'Continuar' : nursery ? 'Salvar alterações' : 'Salvar e adicionar espécies'}{!busy && <ArrowRight className="ml-2 h-4 w-4" />}</Button></div>
  </form>;
}

export function NurserySpeciesEditor({ nursery, catalog, cityId, initialRow, onClose, onSaved, onboarding = false }) {
  const { canManage } = useCanManageArborization(cityId);
  const [selected, setSelected] = useState(initialRow ? [initialRow.species_id] : []);
  const [status, setStatus] = useState(initialRow?.status || 'disponivel');
  const [search, setSearch] = useState('');
  const [created, setCreated] = useState([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const species = [...catalog.species, ...created.filter(row => !catalog.species.some(item => item.id === row.id))];
  const filtered = species.filter(row => treeNameKey(`${row.common_name} ${row.scientific_name || ''}`).includes(treeNameKey(search)));
  const save = async event => {
    event.preventDefault();
    if (busyRef.current || creating || !selected.length || catalog.loading || catalog.error) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const rows = selected.map(species_id => ({ species_id, nursery_id: nursery.id, provider: nursery.provider, status }));
      const { error: failure } = await supabase.from('tree_species_availability').upsert(rows, { onConflict: 'species_id,provider' });
      if (failure) throw failure;
      onSaved();
    } catch { setError('Não foi possível salvar as espécies do viveiro. Sua seleção foi mantida.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <form onSubmit={save} className="tree-availability-editor tree-nursery-species-editor" aria-label="Espécies do viveiro">
    <div className="tree-availability-summary"><div><h3>{initialRow ? 'Editar disponibilidade' : 'Adicionar espécies'}</h3><p className="mt-1 text-xs text-content-secondary">{nursery.name}</p></div><Button type="button" variant="ghost" size="sm" disabled={busy || creating} onClick={onClose}>{onboarding ? 'Adicionar depois' : 'Voltar ao viveiro'}</Button></div>
    {onboarding && <NurserySteps current={2} />}
    <fieldset disabled={busy || catalog.loading || Boolean(catalog.error)} className="tree-nursery-species-body">
      <section className="tree-availability-batch" aria-label="Selecionar espécies">
        <div className="nursery-section-heading"><h4>{initialRow ? 'Espécie' : 'Selecione as espécies'}</h4>{!initialRow && <span>{selected.length} selecionadas</span>}</div>
        {!initialRow && <><label className="tree-nursery-search"><Search size={17} /><Input aria-label="Buscar espécies do viveiro" placeholder="Buscar pelo nome da espécie" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="nursery-selection-actions"><Button type="button" variant="ghost" size="sm" onClick={() => setSelected(current => [...new Set([...current, ...filtered.map(row => row.id)])])}>Selecionar todas da busca</Button>{!!selected.length && <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>Limpar seleção</Button>}</div></>}
        <div className="tree-nursery-species-options">{(initialRow ? species.filter(row => row.id === initialRow.species_id) : filtered).map(row => <label key={row.id} className={`tree-nursery-species-option ${selected.includes(row.id) ? 'is-selected' : ''}`}>
          {!initialRow && <input type="checkbox" checked={selected.includes(row.id)} onChange={event => setSelected(current => event.target.checked ? [...new Set([...current, row.id])] : current.filter(id => id !== row.id))} />}
          {row.illustration_url ? <img src={row.illustration_url} alt="" className="nursery-species-thumb" /> : <span className="tree-nursery-icon" aria-hidden="true"><Leaf size={21} /></span>}
          <span className="nursery-species-name"><strong>{row.common_name}</strong>{row.scientific_name && <small>{row.scientific_name}</small>}</span>
        </label>)}</div>
        {!filtered.length && <p className="nursery-no-species">Nenhuma espécie encontrada. Busque outro nome ou cadastre uma espécie.</p>}
        {!initialRow && canManage && <TreeSpeciesField compact creationOnly label="Não encontrou a espécie?" cityId={cityId} species={species} value="" allowUnknown={false} allowEdit={false} allowCreate={canManage} onCreatingChange={setCreating} onSelect={item => { if (item) setSelected(current => [...new Set([...current, item.id])]); }} onCreated={item => { setCreated(current => [...current, item]); setSelected(current => [...new Set([...current, item.id])]); }} />}
      </section>
      <fieldset className="nursery-status-choices"><legend>Disponibilidade</legend><p>Aplicar às espécies selecionadas.</p>{Object.entries(ADOPTION_AVAILABILITY).map(([key, label]) => <label key={key} className={`nursery-status-choice is-${key} ${status === key ? 'is-selected' : ''}`}><input type="radio" name="nursery-availability" value={key} checked={status === key} onChange={() => setStatus(key)} /><span><strong>{label}</strong><small>{key === 'disponivel' ? 'Pode ser solicitada pelo cidadão.' : key === 'sob_consulta' ? 'A equipe precisa confirmar a oferta.' : 'Sem oferta para novos pedidos.'}</small></span></label>)}<p className="nursery-status-note"><MapPin size={16} />A retirada será em {nursery.name}.</p></fieldset>
    </fieldset>
    <div className="tree-availability-footer"><div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div><Button type="submit" disabled={busy || creating || !selected.length || catalog.loading || Boolean(catalog.error)}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{initialRow ? 'Salvar disponibilidade' : `Adicionar ${selected.length || ''} ${selected.length === 1 ? 'espécie' : 'espécies'}`}</Button></div>
  </form>;
}

export default function TreeNurseryManager({ catalog, cityId, city }) {
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('list');
  const [editingRow, setEditingRow] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [onboarding, setOnboarding] = useState(false);
  const [notice, setNotice] = useState('');
  const [statusUpdates, setStatusUpdates] = useState({});
  useEffect(() => { setStatusUpdates({}); }, [catalog.availability]);
  const workspaceRef = useRef(null);
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    const heading = workspaceRef.current?.querySelector('h1, h3');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
    workspaceRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  }, [view]);
  const nursery = catalog.nurseries?.find(row => row.id === selected?.id) || selected;
  const refresh = message => { setNotice(message); catalog.refresh(); window.dispatchEvent(new Event('tree-adoption-updated')); };
  const allNurseries = catalog.nurseries || [];
  const speciesById = new Map(catalog.species.map(row => [row.id, row]));
  const offersByNursery = new Map();
  for (const original of catalog.availability) {
    const key = `${original.nursery_id}:${original.species_id}`;
    const offer = statusUpdates[key] ? { ...original, status: statusUpdates[key] } : original;
    if (!offersByNursery.has(offer.nursery_id)) offersByNursery.set(offer.nursery_id, []);
    offersByNursery.get(offer.nursery_id).push(offer);
  }
  const summaries = new Map(allNurseries.map(row => [row.id, nurserySummary(row, offersByNursery.get(row.id) || [])]));
  const filters = { all: 'Todos os viveiros', available: 'Com disponibilidade', empty: 'Sem disponibilidade', incomplete: 'Dados pendentes', unlinked: 'Sem espécies vinculadas' };
  const matchesFilter = summary => filter === 'all' || (filter === 'available' && summary.available > 0)
    || (filter === 'empty' && !summary.available) || (filter === 'incomplete' && summary.missing.length > 0)
    || (filter === 'unlinked' && !summary.offers.length);
  const nurseries = allNurseries.filter(row => {
    const summary = summaries.get(row.id);
    const names = summary.offers.map(offer => speciesById.get(offer.species_id)?.common_name || '').join(' ');
    return matchesFilter(summary) && treeNameKey(`${row.name} ${pickupDetails(row).address} ${names}`).includes(treeNameKey(search));
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const disabled = catalog.loading || Boolean(catalog.error);
  const openNursery = (row, nextView = 'nursery') => { setSelected(row); setOnboarding(false); setNotice(''); setView(nextView); };
  const openSpecies = row => { setEditingRow(row || null); setOnboarding(false); setView('species'); };
  const onList = () => { setSelected(null); setView('list'); setNotice(''); };
  const updateStatus = async (row, status) => {
    const { error } = await supabase.from('tree_species_availability').upsert([{ species_id: row.species_id, nursery_id: nursery.id, provider: nursery.provider, status }], { onConflict: 'species_id,provider' });
    if (error) throw error;
    setStatusUpdates(current => ({ ...current, [`${nursery.id}:${row.species_id}`]: status }));
    window.dispatchEvent(new Event('tree-adoption-updated'));
  };
  const workspace = content => <div className={`tree-nursery-workspace is-${view}`} ref={workspaceRef}>
    {content}
  </div>;
  if (view === 'editor') return workspace(<NurseryEditor nursery={nursery} cityId={cityId} city={city} onClose={() => setView(nursery ? 'nursery' : 'list')} onSaved={row => { setSelected(row); setEditingRow(null); setOnboarding(!nursery); setView(nursery ? 'nursery' : 'species'); refresh('Viveiro salvo.'); }} />);
  if (view === 'species' && nursery) return workspace(<NurserySpeciesEditor nursery={nursery} catalog={catalog} cityId={cityId} initialRow={editingRow} onboarding={onboarding} onClose={() => setView('nursery')} onSaved={() => { setView('nursery'); refresh('Espécies do viveiro atualizadas.'); }} />);
  if (view === 'nursery' && nursery) {
    const summary = nurserySummary(nursery, offersByNursery.get(nursery.id) || []);
    return workspace(<div className="tree-nursery-detail">
      <header className="tree-nursery-detail-header"><div className="tree-nursery-heading"><Button variant="outline" size="icon" onClick={onList} aria-label="Voltar aos viveiros"><ArrowLeft size={18} /></Button><div><h1>{nursery.name}</h1><p>{summary.offers.length} {summary.offers.length === 1 ? 'espécie cadastrada' : 'espécies cadastradas'}</p></div></div><Button variant="outline" size="sm" disabled={disabled} onClick={() => setView('editor')}><Pencil className="mr-2 h-4 w-4" />Editar viveiro</Button></header>
      {notice && <p role="status" className="tree-nursery-notice"><CheckCircle2 size={18} />{notice}</p>}
      <TreeAdoptionAvailabilityList key={nursery.id} catalog={{ ...catalog, availability: summary.offers }} nursery={nursery} onNew={() => openSpecies()} onStatusChange={updateStatus} />
    </div>);
  }
  return workspace(<section className="tree-nursery-list" aria-label="Viveiros cadastrados">
    <div className="tree-nursery-list-heading"><div><h1>Viveiros e mudas</h1></div><Button disabled={disabled} onClick={() => openNursery(null, 'editor')}><Plus className="mr-2 h-4 w-4" />Cadastrar viveiro</Button></div>
    <div className="tree-nursery-results">
      {(allNurseries.length > 0 || catalog.loading || catalog.error) && <div className="tree-nursery-toolbar"><label className="tree-nursery-search"><span className="sr-only">Buscar viveiro, endereço ou espécie</span><Search size={17} aria-hidden="true" /><Input placeholder="Buscar viveiro, endereço ou espécie" value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="Limpar busca" onClick={() => setSearch('')}><X size={15} /></button>}</label><label className="tree-nursery-filter"><span className="sr-only">Filtrar viveiros</span><select value={filter} disabled={disabled} onChange={event => setFilter(event.target.value)}>{Object.entries(filters).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>}
      <div className="tree-nursery-result-summary"><p role="status">{catalog.loading ? 'Buscando viveiros…' : catalog.error ? 'Consulta indisponível' : `${nurseries.length} ${nurseries.length === 1 ? 'viveiro' : 'viveiros'}`}</p>{(search || filter !== 'all') && <button type="button" onClick={() => { setSearch(''); setFilter('all'); }}>Limpar filtros<X size={13} /></button>}</div>
      {catalog.loading ? <div role="status" className="tree-nursery-loading"><Loader2 className="h-5 w-5 animate-spin" /><p>Carregando viveiros…</p></div> : catalog.error ? <div role="alert" className="adoption-queue-empty"><AlertCircle className="h-7 w-7 text-destructive" /><h3>Não foi possível consultar os viveiros</h3><p>{catalog.error}</p><Button variant="outline" onClick={catalog.refresh}>Tentar novamente</Button></div> : !nurseries.length ? <div className="adoption-queue-empty"><span className="tree-nursery-icon"><Sprout size={28} /></span><h3>{allNurseries.length ? 'Nenhum viveiro encontrado' : 'Cadastre o primeiro viveiro da cidade'}</h3><p>{allNurseries.length ? 'Tente outra busca ou limpe os filtros.' : 'Informe o local, defina o atendimento e adicione as espécies.'}</p>{allNurseries.length && <Button variant="outline" onClick={() => { setSearch(''); setFilter('all'); }}>Ver todos os viveiros</Button>}</div> : <div className="tree-nursery-grid">{nurseries.map(row => {
        const summary = summaries.get(row.id);
        return <article key={row.id} className="tree-nursery-card">
          <header className="tree-nursery-card-header"><span className="tree-nursery-icon"><Sprout size={23} /></span><span className={`tree-nursery-badge ${summary.available ? 'is-available' : 'is-empty'}`}><span />{summary.available ? 'Com mudas disponíveis' : 'Sem oferta disponível'}</span><Button variant="ghost" size="icon" disabled={disabled} aria-label={`Editar viveiro ${row.name}`} title="Editar viveiro" onClick={() => openNursery(row, 'editor')}><Pencil size={16} /></Button></header>
          <div className="nursery-card-identity"><h3>{row.name}</h3><p><MapPin size={15} /><span>{pickupDetails(row).address || 'Endereço não informado'}</span></p></div>
          {!!summary.missing.length && <button type="button" className="tree-nursery-warning" disabled={disabled} onClick={() => openNursery(row, 'editor')}><AlertCircle size={15} /><span>Completar {summary.missing.join(' e ')}</span><ChevronRight size={14} /></button>}
          <footer><p><strong>{summary.offers.length}</strong> {summary.offers.length === 1 ? 'espécie' : 'espécies'}</p><Button variant="outline" onClick={() => openNursery(row)}>Gerenciar viveiro<ArrowRight className="ml-2 h-4 w-4" /></Button></footer>
        </article>;
      })}</div>}
    </div>
  </section>);
}
