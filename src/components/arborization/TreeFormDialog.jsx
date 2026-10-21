import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Leaf, Loader2, LocateFixed, MapPin, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TreeMap from './TreeMap';
import { EMPTY_TREE, TREE_ACTIONS, TREE_ORIGINS, TREE_STATUS, TREE_PLANTED_BY, treePayload } from '@/lib/arborization';
import { loadTreeCatalogs, treeNameKey } from '@/lib/treeInventory';
import { reverseGeocodePin } from '@/lib/reverseGeocodePin';
import { supabase } from '@/lib/customSupabaseClient';

const selectClass = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';
const Field = ({ label, children }) => <label className="grid min-w-0 gap-1.5 text-sm font-medium">{label}{children}</label>;

export default function TreeFormDialog({ tree, city, cityId, onClose, onSave, reportMode = false, initialPhoto = null }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_TREE, ...tree }));
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [addressLookup, setAddressLookup] = useState('idle');
  const [locationRevision, setLocationRevision] = useState(0);
  const addressEdited = useRef({ address: false, neighborhood: false });
  const [error, setError] = useState('');
  const [catalogs, setCatalogs] = useState({ species: [], neighborhoods: [] });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [newSpecies, setNewSpecies] = useState(null);
  const [speciesSaving, setSpeciesSaving] = useState(false);
  const [speciesError, setSpeciesError] = useState('');
  const speciesSelect = useRef(null);
  const [photo, setPhoto] = useState(initialPhoto);
  const photoInput = useRef(null);
  const [preview, setPreview] = useState('');
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
  const selectSpecies = id => {
    if (id === '__new_species__' && !reportMode) {
      setSpeciesError('');
      setNewSpecies({ common_name: '', scientific_name: '', origin: '' });
      return;
    }
    const species = catalogs.species.find(item => item.id === id);
    setForm(current => ({ ...current, species_id: id, common_name: species?.common_name || 'Não identificada', scientific_name: species?.scientific_name || '', origin: species?.origin || 'nao_identificada' }));
  };
  const addSpecies = async event => {
    event.preventDefault(); event.stopPropagation();
    if (speciesSaving) return;
    setSpeciesSaving(true); setSpeciesError('');
    try {
      if (!newSpecies.common_name.trim()) throw new Error('Informe o nome popular da espécie.');
      if (!newSpecies.scientific_name.trim()) throw new Error('Informe o nome científico da espécie.');
      if (!TREE_ORIGINS[newSpecies.origin]) throw new Error('Selecione a origem da espécie.');
      const { data, error: catalogSaveError } = await supabase.from('city_tree_species').insert({ city_id: cityId, common_name: newSpecies.common_name.trim(), scientific_name: newSpecies.scientific_name.trim() || null, origin: newSpecies.origin }).select().single();
      if (catalogSaveError) throw new Error(catalogSaveError.code === '23505' ? 'Este nome popular ou científico já está no catálogo. Selecione a espécie existente.' : 'Não foi possível incluir a espécie.');
      setCatalogs(current => ({ ...current, species: [...current.species, data].sort((a, b) => a.common_name.localeCompare(b.common_name, 'pt-BR')) }));
      setForm(current => ({ ...current, species_id: data.id, common_name: data.common_name, scientific_name: data.scientific_name || '', origin: data.origin }));
      setNewSpecies(null);
    } catch (err) { setSpeciesError(err.message); }
    finally { setSpeciesSaving(false); }
  };
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
    setForm(current => ({ ...current, ...values, address: '', neighborhood: '', bairro_id: '' }));
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
  const submit = async event => {
    event.preventDefault();
    event.stopPropagation();
    if (addressLookup === 'loading' || locating || saving || newSpecies || catalogLoading || catalogError) return;
    setError(''); setSaving(true);
    try {
      const species = catalogs.species.find(item => item.id === form.species_id);
      const neighborhood = catalogs.neighborhoods.find(item => item.id === form.bairro_id);
      const payload = treePayload({ ...form, common_name: species?.common_name || 'Não identificada', scientific_name: species?.scientific_name || '', origin: species?.origin || 'nao_identificada', neighborhood: neighborhood?.name || '' }, cityId);
      await onSave(payload, tree?.id, photo); onClose();
    }
    catch (err) { setError(err.message || 'Não foi possível salvar a árvore. Tente novamente.'); }
    finally { setSaving(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    {/* A largura é limitada somente neste formulário, mantendo as páginas do inventário fluidas. */}
    <DialogContent className="flex max-h-[92dvh] w-[calc(100%-1rem)] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:w-[calc(100%-3rem)]" onClick={event => event.stopPropagation()} onInteractOutside={event => saving && event.preventDefault()}>
      <DialogHeader className="shrink-0 border-b border-edge-subtle px-5 py-4 pr-12 text-left sm:px-6 sm:py-5">
        <DialogTitle className="flex items-center gap-2"><Leaf className="h-5 w-5 text-emerald-700" />{tree?.id ? 'Editar árvore' : 'Cadastrar árvore'}</DialogTitle>
        <DialogDescription>{city?.name} · Selecione a espécie e marque a árvore no mapa.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" data-testid="tree-form-scroll">
          <fieldset disabled={saving} className="min-w-0 space-y-5">
            <div className="grid min-w-0 items-start gap-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="contents min-w-0 md:order-2 md:block md:space-y-5">
                <section className="order-1 min-w-0 space-y-4 rounded-xl border border-edge-subtle p-4" aria-label="Identificação da árvore">
                  <h3 className="flex items-center gap-2 text-sm font-semibold"><Leaf className="h-4 w-4 text-emerald-700" />Identificação</h3>
                  <div className="rounded-lg bg-surface-subtle px-3 py-2.5 text-sm"><p className="text-xs text-muted-foreground">Código da árvore</p><p className="mt-1 break-words font-semibold">{tree?.public_code || 'Gerado automaticamente ao salvar o cadastro'}</p></div>
                  <Field label="Nome popular"><select ref={speciesSelect} disabled={catalogLoading || !!catalogError} className={selectClass} value={form.species_id || ''} onChange={event => selectSpecies(event.target.value)}>
                    <option value="">{catalogLoading ? 'Carregando espécies…' : 'Não identificada'}</option>
                    {catalogs.species.map(item => <option key={item.id} value={item.id}>{item.common_name}</option>)}
                    {!reportMode && <option value="__new_species__">+ Adicionar nova espécie</option>}
                  </select></Field>
                  {form.species_id ? <div className="space-y-1.5 rounded-lg bg-surface-subtle px-3 py-2.5" data-testid="selected-species-info"><p className="break-words text-sm italic">{catalogs.species.find(item => item.id === form.species_id)?.scientific_name || form.scientific_name || 'Nome científico não informado'}</p><p className="text-xs text-muted-foreground">Origem: {TREE_ORIGINS[catalogs.species.find(item => item.id === form.species_id)?.origin || form.origin]}</p></div> : <p className="text-xs leading-relaxed text-muted-foreground">Não sabe a espécie? Você pode cadastrar a árvore como “Não identificada”.</p>}
                  {!reportMode && <Field label="Situação"><select className={selectClass} value={form.status} onChange={event => change('status', event.target.value)}>{Object.entries(TREE_STATUS).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
                  {catalogError && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{catalogError}</p><Button type="button" variant="outline" size="sm" onClick={() => setCatalogRevision(value => value + 1)}>Tentar novamente</Button></div>}
                </section>
                <section className="order-3 min-w-0 space-y-3 rounded-xl border border-edge-subtle p-4" aria-label="Foto da árvore">
                  <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><Camera className="h-4 w-4 text-emerald-700" />Foto da árvore</h3><span className="text-xs text-muted-foreground">Opcional</span></div>
                  {(preview || form.photo_url) && <img src={preview || form.photo_url} alt="Prévia da foto da árvore" className="h-36 w-full rounded-lg object-cover" />}
                  <Field label="Uma foto em JPG, PNG ou WebP, até 5 MB"><Input ref={photoInput} className="text-xs" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0]; if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { setError('Selecione uma foto JPG, PNG ou WebP de até 5 MB.'); event.target.value = ''; return; } setError(''); setPhoto(file || null); }} /></Field>
                  {(preview || form.photo_url) && <Button type="button" variant="ghost" size="sm" onClick={() => { setPhoto(null); change('photo_url', ''); if (photoInput.current) photoInput.current.value = ''; }}>Remover foto</Button>}
                </section>
              </div>
              <section className="order-2 min-w-0 space-y-3 rounded-xl border border-edge-subtle p-4 md:order-1" aria-label="Localização da árvore">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-emerald-700" />Localização *</h3><Button type="button" variant="outline" size="sm" disabled={locating} onClick={locate}>{locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LocateFixed className="mr-2 h-4 w-4" />}Usar GPS</Button></div>
                <p className="text-xs text-muted-foreground">Clique no mapa ou arraste o marcador até a árvore.</p>
                <div className="relative isolate h-56 overflow-hidden rounded-xl border"><TreeMap city={city} position={position} onPick={pick} /></div>
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
                <details className="border-t border-edge-subtle pt-3"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">Ajustar coordenadas</summary><div className="mt-3 grid grid-cols-2 gap-3"><Field label="Latitude"><Input inputMode="decimal" value={form.latitude} onChange={event => changeLocation({ latitude: event.target.value })} placeholder="-8.597031" /></Field><Field label="Longitude"><Input inputMode="decimal" value={form.longitude} onChange={event => changeLocation({ longitude: event.target.value })} placeholder="-38.574217" /></Field></div></details>
              </section>
            </div>
            {!reportMode && <details className="rounded-xl border border-edge-subtle p-4" data-testid="tree-extra-fields"><summary className="cursor-pointer text-sm font-semibold">Dados complementares <span className="ml-1 font-normal text-muted-foreground">· Medidas, plantio e manejo</span></summary><div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Altura (m)"><Input type="number" min="0.01" step="0.01" value={form.height_m ?? ''} onChange={event => change('height_m', event.target.value)} /></Field>
                <Field label="Diâmetro da copa (m)"><Input type="number" min="0.01" step="0.01" value={form.crown_diameter_m ?? ''} onChange={event => change('crown_diameter_m', event.target.value)} /></Field>
                <Field label="Data do plantio"><Input type="date" value={form.planted_at || ''} onChange={event => change('planted_at', event.target.value)} /></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Responsável pelo plantio"><select className={selectClass} value={form.planted_by} onChange={event => change('planted_by', event.target.value)}>{Object.entries(TREE_PLANTED_BY).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field><Field label="Ano de nascimento estimado"><Input type="number" min="1" max={new Date().getFullYear()} value={form.estimated_birth_year ?? ''} onChange={event => change('estimated_birth_year', event.target.value)} placeholder="Se conhecido ou estimado pela equipe" /></Field></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_historic_site} onChange={event => change('is_historic_site', event.target.checked)} />Localizada no sítio histórico</label>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Manejo necessário"><select className={selectClass} value={form.maintenance_action} onChange={event => change('maintenance_action', event.target.value)}>{Object.entries(TREE_ACTIONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Prazo do manejo"><Input type="date" disabled={form.maintenance_action === 'nenhuma'} value={form.maintenance_due_at || ''} onChange={event => change('maintenance_due_at', event.target.value)} /></Field></div>
              <Field label="Observações públicas"><textarea className={`${selectClass} h-24 py-2`} maxLength={5000} value={form.notes || ''} onChange={event => change('notes', event.target.value)} placeholder="Condições da árvore e orientações de manejo. Evite dados pessoais." /></Field>
            </div></details>}
          </fieldset>
        </div>
        <div className="shrink-0 space-y-3 border-t border-edge-subtle bg-surface-raised px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6" data-testid="tree-form-footer">
          {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving || locating || addressLookup === 'loading' || catalogLoading || !!catalogError || !!newSpecies}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{reportMode ? 'Usar esta árvore na bronca' : 'Salvar árvore'}</Button></div>
        </div>
      </form>
      {!reportMode && <Dialog open={Boolean(newSpecies)} onOpenChange={open => { if (!open && !speciesSaving) setNewSpecies(null); }}>
        <DialogContent overlayClassName="z-[10001]" className="z-[10002] max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl" onClick={event => event.stopPropagation()} onInteractOutside={event => speciesSaving && event.preventDefault()} onCloseAutoFocus={event => { event.preventDefault(); speciesSelect.current?.focus(); }}>
          <DialogHeader className="text-left"><DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-emerald-700" />Adicionar espécie</DialogTitle><DialogDescription>Informe os dados da nova opção. Ela ficará disponível no catálogo de {city?.name}.</DialogDescription></DialogHeader>
          {newSpecies && <form onSubmit={addSpecies} className="space-y-4"><fieldset disabled={speciesSaving} className="space-y-4">
            <Field label="Nome popular da espécie"><Input required maxLength={160} autoComplete="off" placeholder="Ex.: Ipê-amarelo" value={newSpecies.common_name} onChange={event => setNewSpecies(current => ({ ...current, common_name: event.target.value }))} /></Field>
            <Field label="Nome científico da espécie"><Input required maxLength={200} autoComplete="off" placeholder="Ex.: Handroanthus albus" value={newSpecies.scientific_name} onChange={event => setNewSpecies(current => ({ ...current, scientific_name: event.target.value }))} /></Field>
            <Field label="Origem da espécie"><select required className={selectClass} value={newSpecies.origin} onChange={event => setNewSpecies(current => ({ ...current, origin: event.target.value }))}><option value="" disabled>Selecione a origem</option>{Object.entries(TREE_ORIGINS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
          </fieldset>{speciesError && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-destructive text-sm">{speciesError}</p>}<div className="flex flex-wrap justify-end gap-2 border-t border-edge-subtle pt-4"><Button type="button" variant="outline" disabled={speciesSaving} onClick={() => setNewSpecies(null)}>Cancelar inclusão</Button><Button type="submit" disabled={speciesSaving}>{speciesSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Adicionar ao catálogo</Button></div></form>}
        </DialogContent>
      </Dialog>}
    </DialogContent>
  </Dialog>;
}
