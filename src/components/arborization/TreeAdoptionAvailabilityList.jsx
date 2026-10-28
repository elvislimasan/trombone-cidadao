import React, { useState } from 'react';
import { Loader2, MapPin, Pencil, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ADOPTION_AVAILABILITY, ADOPTION_PROVIDERS } from '@/lib/treeAdoption';
import { treeNameKey } from '@/lib/treeInventory';
import { pickupDetails, PICKUP_DAYS } from '@/lib/treePickup';

const PAGE_SIZE = 8;
const statusStyle = { disponivel: 'tree-availability-status-available', indisponivel: 'tree-availability-status-unavailable', sob_consulta: 'tree-availability-status-pending' };

export default function TreeAdoptionAvailabilityList({ catalog, notice, savedAvailability, onNew, onEdit }) {
  const [search, setSearch] = useState(savedAvailability?.speciesName || '');
  const [status, setStatus] = useState('');
  const [provider, setProvider] = useState(savedAvailability?.provider || '');
  const [page, setPage] = useState(1);
  const speciesById = new Map(catalog.species.map(item => [item.id, item]));
  const rows = catalog.availability.map(row => ({ ...row, species: speciesById.get(row.species_id), pickup: pickupDetails(row) }))
    .sort((a, b) => (a.species?.common_name || '').localeCompare(b.species?.common_name || '', 'pt-BR') || a.provider.localeCompare(b.provider));
  const filtered = rows.filter(row => (!status || row.status === status) && (!provider || row.provider === provider)
    && treeNameKey([row.species?.common_name, row.species?.scientific_name, ...(row.species?.aliases || []), ADOPTION_PROVIDERS[row.provider], row.pickup.address].join(' ')).includes(treeNameKey(search)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const changeFilter = (setter, value) => { setter(value); setPage(1); };
  const clearFilters = () => { setSearch(''); setStatus(''); setProvider(''); setPage(1); };
  return <section className="tree-availability-list" aria-label="Disponibilidades cadastradas">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">Disponibilidades cadastradas</h3><p className="mt-1 text-xs text-content-secondary">Consulte as ofertas e edite os dados de retirada. Somente as disponíveis aparecem como sugestão ao cidadão.</p></div>
      <Button onClick={onNew} disabled={catalog.loading || Boolean(catalog.error)}><Plus className="mr-2 h-4 w-4" />Nova disponibilidade</Button>
    </div>
    {notice && <p role="status" className="text-sm font-medium text-brand">{notice}</p>}
    <div className="tree-availability-filters">
      <label className="relative block min-w-0"><span className="sr-only">Buscar disponibilidades</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-secondary" /><Input className="pl-9" placeholder="Buscar espécie, fornecedor ou endereço" value={search} onChange={event => changeFilter(setSearch, event.target.value)} /></label>
      <label className="grid min-w-0 gap-1 text-xs"><span className="sr-only">Situação da disponibilidade</span><select aria-label="Situação da disponibilidade" className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm" value={status} onChange={event => changeFilter(setStatus, event.target.value)}><option value="">Todas as situações</option>{Object.entries(ADOPTION_AVAILABILITY).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="grid min-w-0 gap-1 text-xs"><span className="sr-only">Fornecedor da disponibilidade</span><select aria-label="Fornecedor da disponibilidade" className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm" value={provider} onChange={event => changeFilter(setProvider, event.target.value)}><option value="">Todos os fornecedores</option>{Object.entries(ADOPTION_PROVIDERS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div>
    {(search || status || provider) && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-content-secondary"><p>Exibindo os cadastros que correspondem aos filtros.</p><Button variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button></div>}
    {catalog.loading ? <p role="status" className="flex items-center justify-center gap-2 py-8 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Carregando disponibilidades…</p> : catalog.error ? null : !rows.length ? <div className="rounded-xl border border-dashed p-6 text-center"><p className="font-semibold">Nenhuma disponibilidade cadastrada nesta cidade</p><p className="mt-2 text-sm text-content-secondary">Use “Nova disponibilidade” para informar a espécie, o fornecedor e os dados de retirada.</p></div> : !filtered.length ? <div className="rounded-xl border border-dashed p-6 text-center text-sm"><p>Nenhuma disponibilidade corresponde aos filtros.</p></div> : <>
      <div className="tree-availability-table-scroll" tabIndex={0} aria-label="Lista de disponibilidades">
        <table className="tree-availability-table"><thead><tr><th scope="col">Espécie</th><th scope="col">Fornecedor</th><th scope="col">Situação</th><th scope="col">Retirada</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{filtered.slice(start, start + PAGE_SIZE).map(row => <tr key={`${row.species_id}:${row.provider}`} data-species-id={row.species_id} data-provider={row.provider}>
            <td><p className="font-semibold">{row.species?.common_name || 'Espécie cadastrada'}</p>{row.species?.scientific_name && <p className="mt-1 text-xs italic text-content-secondary">{row.species.scientific_name}</p>}{row.updated_at && <p className="mt-1 text-xs text-content-secondary">Atualizado em {new Date(row.updated_at).toLocaleDateString('pt-BR')}</p>}</td>
            <td>{ADOPTION_PROVIDERS[row.provider] || row.provider}</td>
            <td><span className={`tree-availability-status ${statusStyle[row.status] || ''}`}>{ADOPTION_AVAILABILITY[row.status] || row.status}</span></td>
            <td><p>{row.pickup.address || 'Endereço não informado'}</p>{row.pickup.schedule.map((period, index) => <p key={index} className="mt-1 text-xs text-content-secondary">{period.days.map(day => PICKUP_DAYS[day]).join(', ')} · {period.from} às {period.to}</p>)}{row.pickup.legacy_hours && <p className="mt-1 text-xs text-content-secondary">{row.pickup.legacy_hours}</p>}{row.pickup.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-content-secondary">{row.pickup.notes}</p>}{row.pickup.latitude != null && row.pickup.longitude != null && <a className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand underline" href={`https://www.google.com/maps/search/?api=1&query=${row.pickup.latitude},${row.pickup.longitude}`} target="_blank" rel="noreferrer"><MapPin className="h-3 w-3" />Ver no mapa</a>}</td>
            <td><Button variant="outline" size="sm" aria-label={`Editar ${row.species?.common_name || 'espécie'} · ${ADOPTION_PROVIDERS[row.provider] || row.provider}`} onClick={() => onEdit(row)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Editar</Button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="tree-availability-pagination"><p className="text-xs text-content-secondary">{start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} de {filtered.length} cadastros</p><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><span className="text-xs">{currentPage} de {pages}</span><Button variant="outline" size="sm" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Próxima</Button></div></div>
    </>}
  </section>;
}
