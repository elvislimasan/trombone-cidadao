import React, { useState } from 'react';
import { Check, Leaf, Loader2, MapPin, Search, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import TreePhoto from './TreePhoto';
import TreeAdoptionAvailabilityAlert from './TreeAdoptionAvailabilityAlert';
import { treeNameKey } from '@/lib/treeInventory';
import { SIDEWALK_SUITABILITY } from '@/lib/treeSpecies';
import { ADOPTION_PROVIDERS, ADOPTION_AVAILABILITY, availableAdoptionProviders } from '@/lib/treeAdoption';
import { pickupDetails, pickupInstructions } from '@/lib/treePickup';

export default function TreeAdoptionSpecies({ catalog, form, onChange, cityId }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const selected = catalog.species.find(item => item.id === form.species_id);
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
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-content-secondary"><p>{filtered.length} {filtered.length === 1 ? 'espécie no catálogo' : 'espécies no catálogo'}</p><span>Selecione a que você deseja plantar</span></div>
      <div className="adoption-species-grid" role="radiogroup" aria-label="Espécie desejada">{filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(item => <label key={item.id} data-species-id={item.id} className={`adoption-species-card ${form.species_id === item.id ? 'is-selected' : ''}`}>
        <input type="radio" name="adoption-species" value={item.id} checked={form.species_id === item.id} onChange={() => onChange({ species_id: item.id, provider: '' })} className="sr-only" />
        <TreePhoto tree={{ ...item, species_illustration_url: item.illustration_url }} className="adoption-species-photo" imageClassName="h-full w-full object-contain" captionClassName="sr-only" fallback={<div className="adoption-species-photo flex items-center justify-center"><Leaf className="h-7 w-7 text-primary/60" /></div>} />
        <span className="adoption-species-name"><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{item.common_name}</span>{item.scientific_name && <span className="mt-1 block break-words text-xs italic text-content-secondary">{item.scientific_name}</span>}</span><span className="adoption-choice-check" aria-hidden="true">{item.id === form.species_id && <Check className="h-3 w-3" />}</span></span>
      </label>)}</div>
      {!filtered.length && <p className="rounded-xl border border-dashed p-6 text-sm text-content-secondary">Nenhuma espécie encontrada. Tente outro nome.</p>}
      {pageCount > 1 && <nav className="adoption-catalog-pagination" aria-label="Páginas do catálogo"><span>Página {currentPage + 1} de {pageCount}</span><Button type="button" size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anteriores</Button><Button type="button" size="sm" variant="outline" disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Próximas</Button></nav>}
    </section>
    <aside className="adoption-species-details" aria-label="Espécie e fornecedor selecionados">
      {!selected ? <div className="adoption-species-placeholder"><span className="adoption-empty-icon"><Sprout size={30} /></span><h3 className="text-base font-semibold">Encontre sua próxima árvore</h3><p className="mt-2 text-sm leading-relaxed text-content-secondary">Selecione uma espécie para consultar os fornecedores.</p><p className="adoption-species-placeholder-note">A equipe avalia se a espécie é adequada ao espaço que você informou.</p></div> : <>
        <div><p className="adoption-eyebrow">Sua escolha</p><h3 className="mt-2 break-words text-xl font-bold">{selected.common_name}</h3>{selected.scientific_name && <p className="mt-1 text-sm italic text-content-secondary">{selected.scientific_name}</p>}</div>
        <p className="adoption-sidewalk-info"><strong>Calçada:</strong> {SIDEWALK_SUITABILITY[selected.sidewalk_suitability] || 'Não avaliada'}</p>
        {(selected.summary || selected.planting_guidance) && <details className="adoption-species-guidance"><summary>Sobre a espécie e cuidados</summary>{selected.summary && <p>{selected.summary}</p>}{selected.planting_guidance && <p>{selected.planting_guidance}</p>}</details>}
        <fieldset className="adoption-providers"><legend className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4" />Onde solicitar?</legend>{availableAdoptionProviders(catalog.availability, selected.id).map(row => {
          const key = row.provider;
          const pickup = pickupDetails(row);
          const directions = pickupInstructions({ ...pickup, latitude: null, longitude: null });
          return <label key={key} className={`adoption-provider ${form.provider === key ? 'is-selected' : ''}`}>
            <input type="radio" name="provider" value={key} checked={form.provider === key} onChange={() => onChange({ provider: key })} className="mt-1 shrink-0 accent-primary" />
            <span className="min-w-0"><span className="block text-sm font-semibold">{ADOPTION_PROVIDERS[key]}</span><span className="mt-1 block text-xs text-success-fg">{ADOPTION_AVAILABILITY[row.status]}</span>{directions && <span className="mt-2 block whitespace-pre-wrap break-words text-xs leading-relaxed text-content-secondary">{directions}</span>}{pickup.latitude != null && pickup.longitude != null && <a href={`https://www.google.com/maps/search/?api=1&query=${pickup.latitude},${pickup.longitude}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold text-primary underline">Ver local de retirada no mapa</a>}</span>
          </label>;
        })}</fieldset>
        <p className="text-xs leading-relaxed text-content-secondary">Aguarde a confirmação da equipe antes de ir ao fornecedor.</p>
      </>}
    </aside>
  </div>;
}
