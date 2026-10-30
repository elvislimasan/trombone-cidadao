import React, { useRef, useState } from 'react';
import { CheckCircle2, Leaf, Loader2, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ADOPTION_AVAILABILITY } from '@/lib/treeAdoption';
import { treeNameKey } from '@/lib/treeInventory';

const PAGE_SIZE = 12;

function SpeciesAvailabilityCard({ row, onStatusChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const busyRef = useRef(false);
  const name = row.species?.common_name || 'Espécie cadastrada';
  const changeStatus = async event => {
    const status = event.target.value;
    if (busyRef.current || status === row.status) return;
    busyRef.current = true; setBusy(true); setError(''); setSaved(false);
    try { await onStatusChange(row, status); setSaved(true); }
    catch { setError('Não foi possível atualizar. Tente novamente.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <article className="nursery-offer-card" data-species-id={row.species_id}>
    <div className="nursery-offer-identity">
      {row.species?.illustration_url ? <img src={row.species.illustration_url} alt="" /> : <span className="tree-nursery-icon"><Leaf size={25} /></span>}
      <div><h3>{name}</h3>{row.species?.scientific_name && <p>{row.species.scientific_name}</p>}</div>
    </div>
    <label className="nursery-offer-status"><span>Disponibilidade {busy ? <Loader2 size={14} className="animate-spin" /> : saved && <CheckCircle2 size={14} />}</span><select aria-label={`Disponibilidade de ${name}`} disabled={busy} value={row.status} onChange={changeStatus} className={`is-${row.status}`}>{Object.entries(ADOPTION_AVAILABILITY).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {busy && <p role="status" className="nursery-offer-feedback">Salvando…</p>}
    {saved && !busy && <p role="status" className="nursery-offer-feedback is-saved">Disponibilidade atualizada</p>}
    {error && <p role="alert" className="nursery-offer-feedback text-destructive">{error}</p>}
  </article>;
}

export default function TreeAdoptionAvailabilityList({ catalog, nursery, onNew, onStatusChange }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const speciesById = new Map(catalog.species.map(item => [item.id, item]));
  const rows = catalog.availability.map(row => ({ ...row, species: speciesById.get(row.species_id) }))
    .sort((a, b) => (a.species?.common_name || '').localeCompare(b.species?.common_name || '', 'pt-BR'));
  const filtered = rows.filter(row => (!status || row.status === status)
    && treeNameKey([row.species?.common_name, row.species?.scientific_name, ...(row.species?.aliases || [])].join(' ')).includes(treeNameKey(search)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * PAGE_SIZE;
  return <section className="nursery-offers" aria-label={`Mudas e árvores de ${nursery.name}`}>
    <div className="nursery-offers-heading"><h2>Mudas e árvores</h2><Button onClick={onNew} disabled={catalog.loading || Boolean(catalog.error)}><Plus className="mr-2 h-4 w-4" />Adicionar espécies</Button></div>
    {(rows.length > 6 || search || status) && <div className="tree-nursery-availability-filters"><label className="tree-nursery-search"><span className="sr-only">Buscar espécies</span><Search size={17} /><Input placeholder="Buscar espécie" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label><select aria-label="Filtrar disponibilidade" className="h-11 min-w-0 rounded-md border bg-background px-3 text-sm" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Todas as situações</option>{Object.entries(ADOPTION_AVAILABILITY).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>}
    {catalog.loading ? <p role="status" className="flex items-center justify-center gap-2 py-8 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Carregando espécies…</p> : catalog.error ? <p role="alert" className="text-sm text-destructive">{catalog.error}</p> : !rows.length ? <div className="adoption-queue-empty"><span className="tree-nursery-icon"><Leaf size={25} /></span><h3>Adicione a primeira espécie</h3><p>Escolha as mudas e árvores oferecidas neste viveiro.</p></div> : !filtered.length ? <p className="p-6 text-sm text-content-secondary">Nenhuma espécie corresponde aos filtros.</p> : <div className="nursery-offers-grid">{filtered.slice(start, start + PAGE_SIZE).map(row => <SpeciesAvailabilityCard key={row.species_id} row={row} onStatusChange={onStatusChange} />)}</div>}
    {pages > 1 && <div className="tree-availability-pagination"><p className="text-xs text-content-secondary">{start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} de {filtered.length} espécies</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><span className="text-xs">{currentPage} de {pages}</span><Button variant="outline" size="sm" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Próxima</Button></div></div>}
  </section>;
}
