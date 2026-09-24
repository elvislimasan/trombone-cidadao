import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { municipalTableRows } from '@/lib/municipalTable';

export default function MunicipalTable({ rows, columns, searchText, onOpen, title, searchPlaceholder, filters, filterKey = '', defaultSort = 'nome', loading = false }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(defaultSort);
  const [direction, setDirection] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const sorted = useMemo(() => municipalTableRows(rows, { search, searchText, sortValue: columns.find((column) => column.key === sort)?.value || ((row) => row.id), direction }), [rows, search, searchText, columns, sort, direction]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * pageSize;
  useEffect(() => setPage(1), [search, filterKey, sort, direction, pageSize]);
  useEffect(() => setPage((value) => Math.min(value, pages)), [pages]);
  const changeSort = (key) => { setSort(key); setDirection(sort === key && direction === 'asc' ? 'desc' : 'asc'); };

  return <section className="min-w-0 overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm" aria-label={title}>
    <div className="flex flex-wrap items-end gap-3 border-b border-edge-subtle p-4 sm:p-5">
      <label className="min-w-0 flex-[1_1_18rem] text-xs font-semibold text-content-secondary">Pesquisar
        <div className="relative mt-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-tertiary" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} className="pl-9" /></div>
      </label>
      {filters}
    </div>
    <div className="flex flex-wrap justify-between gap-2 px-5 py-3 text-xs text-content-secondary"><p aria-live="polite">{loading ? 'Carregando registros…' : `${sorted.length} ${sorted.length === 1 ? 'registro encontrado' : 'registros encontrados'}`}</p><p>Clique em uma linha para consultar e editar.</p></div>
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[800px] table-fixed text-left text-sm">
        <caption className="sr-only">{title}</caption>
        <thead className="border-y border-edge-subtle bg-surface-subtle text-xs text-content-secondary"><tr>
          {columns.map((column) => <th key={column.key} scope="col" className="px-4 py-3 font-bold" style={{ width: column.width }} aria-sort={sort === column.key ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => changeSort(column.key)} className="flex items-center gap-1.5 text-left hover:text-brand focus-visible:ring-2 focus-visible:ring-brand">{column.label}{sort === column.key ? direction === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" /> : <ArrowUpDown className="h-3 w-3 shrink-0" />}</button></th>)}
          <th scope="col" className="w-20 px-3 py-3"><span className="sr-only">Detalhes</span></th>
        </tr></thead>
        <tbody className="divide-y divide-edge-subtle">
          {!loading && sorted.slice(start, start + pageSize).map((row) => <tr key={row.id} onClick={() => onOpen(row)} className="cursor-pointer transition-colors hover:bg-brand-subtleBg focus-within:bg-brand-subtleBg">
            {columns.map((column) => <td key={column.key} className="break-words px-4 py-4 align-top text-content-secondary">{column.render ? column.render(row) : column.value(row) || '—'}</td>)}
            <td className="px-3 py-3 align-top"><Button type="button" variant="ghost" size="sm" className="text-brand" onClick={(event) => { event.stopPropagation(); onOpen(row); }} aria-label={`Abrir ${columns[0].value(row)}`}>Abrir</Button></td>
          </tr>)}
          {(loading || !sorted.length) && <tr><td colSpan={columns.length + 1} className="px-5 py-12 text-center text-content-tertiary">{loading ? 'Carregando…' : 'Nenhum registro encontrado. Ajuste a pesquisa ou os filtros.'}</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge-subtle p-4 text-xs text-content-secondary">
      <label className="flex items-center gap-2">Por página<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-9 rounded-lg border border-edge-subtle bg-surface-raised px-2">{[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
      <span>{sorted.length ? `${start + 1}–${Math.min(start + pageSize, sorted.length)} de ${sorted.length}` : '0 registros'}</span>
      <div className="flex items-center gap-2"><Button type="button" variant="outline" size="icon" aria-label="Página anterior" disabled={currentPage <= 1 || loading} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button><span>Página {currentPage} de {pages}</span><Button type="button" variant="outline" size="icon" aria-label="Próxima página" disabled={currentPage >= pages || loading} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
    </div>
  </section>;
}
