import React, { useState } from 'react';
import { Check, ChevronDown, Loader2, MapPin, Minus, Plus, Search, ShieldCheck, Sprout, Trees } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TreePhoto from './TreePhoto';
import TreeSpeciesIllustration from './TreeSpeciesIllustration';
import TreeAdoptionAvailabilityAlert from './TreeAdoptionAvailabilityAlert';
import { treeNameKey } from '@/lib/treeInventory';
import { SIDEWALK_SUITABILITY } from '@/lib/treeSpecies';
import { TREE_ORIGINS } from '@/lib/arborization';
import { adoptionProviderLabel, availableAdoptionProviders, adoptionItems, adoptionQuantity, MONTHLY_SEEDLING_LIMIT } from '@/lib/treeAdoption';
import { pickupDetails, pickupInstructions } from '@/lib/treePickup';

function SpeciesImage({ species, className = '' }) {
  return <div className={`adoption-species-image ${className}`}><TreePhoto tree={{ ...species, species_illustration_url: species?.illustration_url }} className="adoption-species-photo" imageClassName="h-full w-full object-contain" captionClassName="sr-only" fallback={<TreeSpeciesIllustration />} /></div>;
}

function SpeciesFacts({ species }) {
  return <span className="adoption-species-facts">
    {TREE_ORIGINS[species.origin] && species.origin !== 'nao_identificada' && <span><Trees size={15} aria-hidden="true" />Árvore {TREE_ORIGINS[species.origin].toLocaleLowerCase('pt-BR')}</span>}
    <span><ShieldCheck size={15} aria-hidden="true" />Calçada: {SIDEWALK_SUITABILITY[species.sidewalk_suitability] || 'Não avaliada'}</span>
  </span>;
}

function SeedlingQuantity({ item, name, onChange, max }) {
  const quantity = Number(item.quantity) || 0;
  return <label className="tree-seedling-quantity">Quantidade<span className="tree-seedling-counter"><button type="button" aria-label={`Diminuir quantidade de ${name}`} disabled={quantity <= 1} onClick={() => onChange(Math.max(1, quantity - 1))}><Minus size={18} aria-hidden="true" /></button><Input aria-label={`Quantidade de ${name}`} type="number" inputMode="numeric" min={1} max={max} step={1} value={item.quantity} onChange={event => onChange(event.target.value)} /><button type="button" aria-label={`Aumentar quantidade de ${name}`} disabled={quantity >= max} onClick={() => onChange(Math.min(max, quantity + 1))}><Plus size={18} aria-hidden="true" /></button></span></label>;
}

function SeedlingCard({ species, item, providers, catalog, requestType, onToggle, onChange, maxQuantity, selectionDisabled }) {
  const selected = Boolean(item);
  const provider = providers.find(row => row.provider === item?.provider);
  const pickup = provider ? pickupDetails(provider) : null;
  const directions = pickup ? pickupInstructions({ ...pickup, latitude: null, longitude: null }) : '';
  return <article className={`tree-seedling-card${selected ? ' is-selected' : ''}`} data-species-id={species.id}>
    <label className="tree-seedling-select"><input className="sr-only" type="checkbox" name="adoption-species" value={species.id} checked={selected} disabled={selectionDisabled} onChange={onToggle} /><SpeciesImage species={species} className="tree-seedling-photo" /><span className="tree-seedling-identity"><strong>{species.common_name}</strong><small>{selected ? 'Selecionada' : selectionDisabled ? 'Limite do pedido atingido' : 'Disponível para solicitar'}</small></span><span className="tree-seedling-check" aria-hidden="true">{selected && <Check size={16} />}</span></label>
    {selected && <div className="tree-seedling-controls"><SeedlingQuantity item={item} name={species.common_name} max={maxQuantity} onChange={quantity => onChange({ quantity })} /><label className="tree-seedling-provider">{requestType === 'plantio' ? 'Fornecedor' : 'Retirar em'}<select required aria-label={`Fornecedor de ${species.common_name}`} value={item.provider} onChange={event => onChange({ provider: event.target.value })}><option value="">Escolha o viveiro</option>{providers.map(row => <option key={row.provider} value={row.provider}>{adoptionProviderLabel(row.provider, catalog)}</option>)}</select></label></div>}
    <details className="tree-seedling-details"><summary>Espécie e orientações<ChevronDown size={16} aria-hidden="true" /></summary><div>{species.scientific_name && <p className="italic">{species.scientific_name}</p>}<SpeciesFacts species={species} />{species.summary && <p>{species.summary}</p>}{species.planting_guidance && <p>{species.planting_guidance}</p>}{directions && <p className="whitespace-pre-wrap">{directions}</p>}{pickup?.latitude != null && pickup.longitude != null && <a href={`https://www.google.com/maps/search/?api=1&query=${pickup.latitude},${pickup.longitude}`} target="_blank" rel="noreferrer"><MapPin size={15} aria-hidden="true" />Ver local de retirada</a>}</div></details>
  </article>;
}

export default function TreeAdoptionSpecies({ catalog, form, onChange, cityId }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const items = adoptionItems(form);
  const total = adoptionQuantity(form);
  const seedlingRequest = form.request_type === 'muda';
  const unavailable = items.filter(item => !catalog.species.some(species => species.id === item.species_id));
  const removeUnavailable = () => {
    const next = items.filter(item => catalog.species.some(species => species.id === item.species_id));
    onChange({ items: next, species_id: next[0]?.species_id || '', provider: next[0]?.provider || '' });
  };
  const updateItem = (id, patch) => onChange({ items: items.map(item => item.species_id === id ? { ...item, ...patch } : item), ...(id === form.species_id && patch.provider ? { provider: patch.provider } : {}) });
  const toggle = id => {
    const providers = availableAdoptionProviders(catalog.availability, id);
    const exists = items.some(item => item.species_id === id);
    if (!exists && seedlingRequest && total >= MONTHLY_SEEDLING_LIMIT) return;
    const next = exists ? items.filter(item => item.species_id !== id) : [...items, { species_id: id, quantity: 1, provider: providers.length === 1 ? providers[0].provider : '' }];
    const focus = exists ? next[0] : next[next.length - 1];
    onChange({ items: next, species_id: focus?.species_id || '', provider: focus?.provider || '' });
  };
  const filtered = catalog.species.filter(species => (!selectedOnly || items.some(item => item.species_id === species.id)) && treeNameKey([species.common_name, species.scientific_name, ...(species.aliases || [])].join(' ')).includes(treeNameKey(search)));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 6));
  const currentPage = Math.min(page, pageCount - 1);
  if (catalog.loading) return <p role="status" className="flex items-center gap-2 py-8"><Loader2 size={20} className="animate-spin" />Carregando mudas…</p>;
  if (catalog.error) return <div role="alert" className="space-y-3 py-6"><p className="text-sm text-destructive">{catalog.error}</p><Button type="button" variant="outline" onClick={catalog.refresh}>Tentar novamente</Button></div>;
  if (!catalog.species.length) return <div className="adoption-catalog-empty"><Sprout size={30} /><h3>Nenhuma muda disponível agora</h3><p>Ative um aviso para saber quando houver disponibilidade.</p><TreeAdoptionAvailabilityAlert key={cityId} cityId={cityId} onAvailable={catalog.refresh} /><Button type="button" variant="outline" onClick={catalog.refresh}>Atualizar catálogo</Button>{items.length > 0 && <Button type="button" variant="ghost" onClick={removeUnavailable}>Limpar seleção anterior</Button>}</div>;
  return <section className="tree-seedling-picker" aria-label="Escolher mudas e fornecedores">
    {unavailable.length > 0 && <div className="tree-seedling-unavailable" role="status"><p>Uma seleção anterior não está mais disponível.</p><Button type="button" variant="outline" onClick={removeUnavailable}>Remover indisponíveis</Button></div>}
    <div className="tree-seedling-toolbar"><label className="tree-seedling-search"><Search size={19} aria-hidden="true" /><span className="sr-only">Buscar espécie</span><Input placeholder="Buscar espécie" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label><button type="button" className="tree-seedling-filter" aria-pressed={selectedOnly} onClick={() => { setSelectedOnly(value => !value); setPage(0); }}>{selectedOnly ? 'Ver todas' : `Escolhidas (${items.length})`}</button></div>
    <div className="tree-seedling-caption"><span>{filtered.length} {filtered.length === 1 ? 'espécie disponível' : 'espécies disponíveis'}</span><span aria-live="polite">{total} {total === 1 ? 'muda no pedido' : 'mudas no pedido'}{seedlingRequest ? ` · até ${MONTHLY_SEEDLING_LIMIT} por pedido` : ''}</span></div>
    <div className="tree-seedling-grid">{filtered.slice(currentPage * 6, (currentPage + 1) * 6).map(species => { const item = items.find(row => row.species_id === species.id); return <SeedlingCard key={species.id} species={species} item={item} providers={availableAdoptionProviders(catalog.availability, species.id)} catalog={catalog} requestType={form.request_type} maxQuantity={seedlingRequest ? Math.max(1, MONTHLY_SEEDLING_LIMIT - (total - Number(item?.quantity || 0))) : 1000} selectionDisabled={seedlingRequest && !item && total >= MONTHLY_SEEDLING_LIMIT} onToggle={() => toggle(species.id)} onChange={patch => updateItem(species.id, patch)} />; })}</div>
    {!filtered.length && <p className="tree-seedling-empty">{selectedOnly ? 'Nenhuma muda selecionada neste filtro.' : 'Nenhuma espécie encontrada. Tente outro nome.'}</p>}
    {pageCount > 1 && <nav className="tree-seedling-pagination" aria-label="Páginas do catálogo"><span>{currentPage + 1} de {pageCount}</span><Button type="button" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</Button><Button type="button" variant="outline" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Próxima</Button></nav>}
  </section>;
}
