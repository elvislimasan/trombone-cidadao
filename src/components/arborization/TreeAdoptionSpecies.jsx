import React, { useState } from 'react';
import { Check, Loader2, MapPin, Minus, Plus, Search, ShieldCheck, Sprout, Trees } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TreePhoto from './TreePhoto';
import TreeSpeciesIllustration from './TreeSpeciesIllustration';
import TreeAdoptionAvailabilityAlert from './TreeAdoptionAvailabilityAlert';
import { treeNameKey } from '@/lib/treeInventory';
import { SIDEWALK_SUITABILITY } from '@/lib/treeSpecies';
import { TREE_ORIGINS } from '@/lib/arborization';
import { ADOPTION_PROVIDERS, ADOPTION_AVAILABILITY, availableAdoptionProviders, adoptionItems, adoptionQuantity } from '@/lib/treeAdoption';
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

function QuantityInput({ item, name, onChange }) {
  const quantity = Number(item.quantity) || 0;
  return <label className="adoption-quantity-field">Quantidade<span className="adoption-quantity-control">
    <button type="button" aria-label={`Diminuir quantidade de ${name}`} disabled={quantity <= 1} onClick={() => onChange(Math.max(1, quantity - 1))}><Minus size={14} aria-hidden="true" /></button>
    <Input aria-label={`Quantidade de ${name}`} type="number" min={1} max={1000} step={1} value={item.quantity} onChange={event => onChange(event.target.value)} />
    <button type="button" aria-label={`Aumentar quantidade de ${name}`} disabled={quantity >= 1000} onClick={() => onChange(Math.min(1000, quantity + 1))}><Plus size={14} aria-hidden="true" /></button>
  </span></label>;
}

export default function TreeAdoptionSpecies({ catalog, form, onChange, cityId }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const items = adoptionItems(form);
  const updateItem = (speciesId, patch) => onChange({ items: items.map(item => item.species_id === speciesId ? { ...item, ...patch } : item), ...(speciesId === form.species_id && patch.provider ? { provider: patch.provider } : {}) });
  const toggle = speciesId => {
    const exists = items.some(item => item.species_id === speciesId);
    const next = exists ? items.filter(item => item.species_id !== speciesId) : [...items, { species_id: speciesId, quantity: 1, provider: '' }];
    const focus = exists ? next[0] : next[next.length - 1];
    onChange({ items: next, species_id: focus?.species_id || '', provider: focus?.provider || '' });
  };
  const selected = catalog.species.find(item => item.id === form.species_id);
  const selectedItem = items.find(item => item.species_id === selected?.id);
  const total = adoptionQuantity(form);
  const unit = form.request_type === 'plantio' ? (total === 1 ? 'árvore' : 'árvores') : (total === 1 ? 'muda' : 'mudas');
  const filtered = catalog.species.filter(item => treeNameKey([item.common_name, item.scientific_name, ...(item.aliases || [])].join(' ')).includes(treeNameKey(search)));
  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  if (catalog.loading) return <p role="status" className="flex items-center gap-2 py-8"><Loader2 className="h-4 w-4 animate-spin" />Carregando espécies…</p>;
  if (catalog.error) return <div role="alert" className="space-y-3 py-6"><p className="text-sm text-destructive">{catalog.error}</p><Button type="button" variant="outline" onClick={catalog.refresh}>Tentar novamente</Button></div>;
  if (!catalog.species.length) return <div className="adoption-catalog-empty"><span className="adoption-empty-icon"><Sprout size={30} /></span><h3>As próximas mudas começam por aqui</h3><p role="status">Nenhuma espécie com disponibilidade confirmada nesta cidade. As opções aparecerão quando a equipe cadastrar mudas disponíveis em um fornecedor.</p><TreeAdoptionAvailabilityAlert key={cityId} cityId={cityId} onAvailable={catalog.refresh} /><Button type="button" variant="outline" onClick={catalog.refresh}>Atualizar catálogo</Button></div>;
  return <div className="adoption-species-layout">
    <section className="adoption-catalog" aria-label="Catálogo de espécies">
      <label className="relative block"><span className="sr-only">Buscar espécie</span><Search className="adoption-search-icon pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-secondary" /><Input className="h-10 pl-10" placeholder="Busque pelo nome popular, regional ou científico" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-content-secondary"><p>{filtered.length} {filtered.length === 1 ? 'espécie no catálogo' : 'espécies no catálogo'}</p><span>Selecione uma ou mais espécies · Total: {adoptionQuantity(form)}</span></div>
      <div className="adoption-species-grid" data-single={filtered.length === 1 || undefined} role="group" aria-label="Espécies desejadas">{filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(item => <label key={item.id} data-species-id={item.id} className={`adoption-species-card ${items.some(row => row.species_id === item.id) ? 'is-selected' : ''}`}>
        <input type="checkbox" name="adoption-species" value={item.id} checked={items.some(row => row.species_id === item.id)} onChange={() => toggle(item.id)} className="sr-only" />
        <div className="adoption-species-visual"><SpeciesImage species={item} /><span className="adoption-species-available"><span />Disponível</span></div>
        <span className="adoption-species-name"><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{item.common_name}</span>{item.scientific_name && <span className="mt-1 block break-words text-xs italic text-content-secondary">{item.scientific_name}</span>}</span><span className="adoption-choice-check" aria-hidden="true">{items.some(row => row.species_id === item.id) && <Check className="h-3 w-3" />}</span></span>
        <SpeciesFacts species={item} />
        {filtered.length === 1 && item.summary && <span className="adoption-species-excerpt">{item.summary}</span>}
      </label>)}</div>
      {!filtered.length && <p className="rounded-xl border border-dashed p-6 text-sm text-content-secondary">Nenhuma espécie encontrada. Tente outro nome.</p>}
      {pageCount > 1 && <nav className="adoption-catalog-pagination" aria-label="Páginas do catálogo"><span>Página {currentPage + 1} de {pageCount}</span><Button type="button" size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anteriores</Button><Button type="button" size="sm" variant="outline" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Próximas</Button></nav>}
    </section>
    <aside className="adoption-species-details" aria-label="Espécie e fornecedor selecionados">
      {items.length > 0 && <section className="adoption-order-summary" aria-label="Espécies no pedido">
        <h3>Seu pedido <span>{total} {unit}</span></h3>
        {items.map(item => {
          const species = catalog.species.find(row => row.id === item.species_id);
          const name = species?.common_name || 'Espécie indisponível';
          return <div key={item.species_id} className="adoption-order-item">
            <Button type="button" variant="ghost" data-active={form.species_id === item.species_id || undefined} className="adoption-order-species" onClick={() => onChange({ species_id: item.species_id, provider: item.provider })}>
              <SpeciesImage species={species} className="adoption-order-image" /><span><strong>{name}</strong>{species?.scientific_name && <small>{species.scientific_name}</small>}</span>
            </Button>
            <QuantityInput item={item} name={name} onChange={quantity => updateItem(item.species_id, { quantity })} />
            <button type="button" className="adoption-remove-species" aria-label={`Remover ${name}`} onClick={() => toggle(item.species_id)}>Remover</button>
            {!item.provider && <p className="adoption-order-pending">Selecione esta espécie e escolha o fornecedor abaixo.</p>}
          </div>;
        })}
      </section>}
      {!selected ? <div className="adoption-species-placeholder"><span className="adoption-empty-icon"><Sprout size={30} /></span><h3 className="text-base font-semibold">Encontre sua próxima árvore</h3><p className="mt-2 text-sm leading-relaxed text-content-secondary">Selecione uma espécie para consultar os fornecedores.</p><p className="adoption-species-placeholder-note">A equipe avalia se a espécie é adequada ao espaço que você informou.</p></div> : <>
        <div className="adoption-selected-heading"><p className="adoption-eyebrow">Sua escolha</p><h3>{selected.common_name}</h3><SpeciesFacts species={selected} /></div>
        {(selected.summary || selected.planting_guidance) && <details className="adoption-species-guidance"><summary>Sobre a espécie e cuidados</summary>{selected.summary && <p>{selected.summary}</p>}{selected.planting_guidance && <p>{selected.planting_guidance}</p>}</details>}
        <fieldset className="adoption-providers"><legend className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4" />Onde solicitar?</legend>{availableAdoptionProviders(catalog.availability, selected.id).map(row => {
          const key = row.provider;
          const pickup = pickupDetails(row);
          const directions = pickupInstructions({ ...pickup, latitude: null, longitude: null });
          return <label key={key} className={`adoption-provider ${selectedItem?.provider === key ? 'is-selected' : ''}`}>
            <input type="radio" name="provider" value={key} checked={selectedItem?.provider === key} onChange={() => updateItem(selected.id, { provider: key })} className="mt-1 shrink-0 accent-primary" />
            <span className="min-w-0"><span className="adoption-provider-title"><strong>{ADOPTION_PROVIDERS[key]}</strong><span>{ADOPTION_AVAILABILITY[row.status]}</span></span>{directions && <span className="mt-2 block whitespace-pre-wrap break-words text-xs leading-relaxed text-content-secondary">{directions}</span>}{pickup.latitude != null && pickup.longitude != null && <a href={`https://www.google.com/maps/search/?api=1&query=${pickup.latitude},${pickup.longitude}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-primary underline">Ver local de retirada no mapa</a>}</span>
          </label>;
        })}</fieldset>
        <p className="text-xs leading-relaxed text-content-secondary">Aguarde a confirmação da equipe antes de ir ao fornecedor.</p>
      </>}
    </aside>
  </div>;
}
