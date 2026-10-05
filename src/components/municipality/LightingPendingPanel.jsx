import { poleCode, poleReferenceText } from '@/lib/poleDisplay';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowRight, ChevronDown, ClipboardList, Lightbulb, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MunicipalEmptyState, MunicipalPagination } from '@/components/municipality/MunicipalPageUi';
import { supabase } from '@/lib/customSupabaseClient';
import { DEMAND_PRIORITIES, DEMAND_STATUSES, OPEN_DEMAND_STATUSES } from '@/lib/municipalDemand';

const priorityRank = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
const labelFor = (values, value) => values.find(([key]) => key === value)?.[1] || value;
const formatDate = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '';
const PAGE_SIZE = 8;
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const isOverdue = (row) => Boolean(row.prazo_em && Date.parse(row.prazo_em) < Date.now());

export default function LightingPendingPanel({ municipalityId, cityId, revision, showHeading = true }) {
  const [state, setState] = useState({ rows: [], count: 0, unassigned: [], unassignedCount: 0, loading: true, error: '' });
  const [section, setSection] = useState('unassigned');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('all');
  const [page, setPage] = useState(1);
  const searchId = useId();
  const priorityId = useId();
  const listRef = useRef(null);
  useEffect(() => {
    if (!municipalityId || !cityId) return undefined;
    let active = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    const orders = supabase.from('demandas_municipais')
      .select('id,protocolo,titulo,status,prioridade,prazo_em,created_at,pole_id,pole:poles(identifier,plate,address),responsavel:profiles!demandas_municipais_atribuido_a_fkey(name)', { count: 'exact' })
      .eq('prefeitura_id', municipalityId).eq('category_id', 'iluminacao')
      .not('pole_id', 'is', null).in('status', OPEN_DEMAND_STATUSES)
      .order('created_at', { ascending: false }).limit(50);
    Promise.all([orders, supabase.rpc('postes_iluminacao_sem_ordem', { p_city_id: cityId })])
      .then(([orderResult, unassignedResult]) => {
        if (active) setState({
          rows: orderResult.data || [], count: orderResult.count || 0,
          unassigned: unassignedResult.data || [], unassignedCount: Number(unassignedResult.data?.[0]?.total || 0),
          loading: false, error: [orderResult.error?.message, unassignedResult.error?.message].filter(Boolean).join(' · '),
        });
      })
      .catch((error) => {
        if (active) setState((current) => ({ ...current, loading: false, error: error.message || 'Não foi possível carregar as pendências.' }));
      });
    return () => { active = false; };
  }, [municipalityId, cityId, revision]);

  const rows = useMemo(() => {
    const now = Date.now();
    return [...state.rows].sort((a, b) => {
      const overdueA = a.prazo_em && Date.parse(a.prazo_em) < now ? 0 : 1;
      const overdueB = b.prazo_em && Date.parse(b.prazo_em) < now ? 0 : 1;
      return overdueA - overdueB || (priorityRank[a.prioridade] ?? 2) - (priorityRank[b.prioridade] ?? 2)
        || Date.parse(a.prazo_em || '9999-12-31') - Date.parse(b.prazo_em || '9999-12-31')
        || Date.parse(a.created_at) - Date.parse(b.created_at);
    });
  }, [state.rows]);

  const filteredRows = useMemo(() => {
    const terms = normalize(search).trim().split(/\s+/).filter(Boolean);
    const source = section === 'unassigned' ? state.unassigned : rows;
    return source.filter((row) => {
      if (section === 'orders' && priority !== 'all' && !(priority === 'overdue' ? isOverdue(row) : row.prioridade === priority)) return false;
      const text = section === 'unassigned'
        ? `${poleCode(row.identifier || row.plate || row.id)} ${row.address || ''}`
        : `${row.protocolo || ''} ${poleCode(row.pole?.identifier || row.pole?.plate || row.pole_id)} ${poleReferenceText(row.titulo)} ${row.pole?.address || ''} ${row.responsavel?.name || ''}`;
      return terms.every((term) => normalize(text).includes(term));
    });
  }, [section, search, priority, state.unassigned, rows]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE)));
  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleRows = filteredRows.slice(start, start + PAGE_SIZE);
  const hasFilters = Boolean(search.trim() || (section === 'orders' && priority !== 'all'));
  const clearFilters = () => { setSearch(''); setPriority('all'); setPage(1); };
  const changePage = (next) => {
    setPage(next);
    listRef.current?.scrollIntoView({ block: 'nearest' });
  };

  return <div className="min-w-0 space-y-4">
    {showHeading && <h2 className="text-sm font-semibold">Pendências de iluminação</h2>}
    {state.loading ? <p role="status" className="flex items-center gap-2 text-xs text-content-secondary"><Loader2 className="h-4 w-4 animate-spin" />Carregando pendências…</p>
      : <>
        {state.error && <p role="alert" className="text-xs text-danger">Alguns dados não foram carregados: {state.error}</p>}
        <Tabs.Root value={section} onValueChange={(value) => { setSection(value); clearFilters(); }} className="min-w-0 space-y-4">
          <Tabs.List aria-label="Tipo de pendência" className="grid grid-cols-2 gap-2 rounded-xl bg-surface-subtle p-1.5">
            {[
              ['unassigned', 'Sem ordem', state.unassignedCount, Lightbulb],
              ['orders', 'Ordens abertas', state.count, ClipboardList],
            ].map(([key, label, count, Icon]) => <Tabs.Trigger key={key} value={key} className="flex min-w-0 items-center justify-center gap-2 rounded-lg px-2 py-3 text-xs font-semibold text-content-secondary transition-colors hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand data-[state=active]:bg-surface-raised data-[state=active]:text-content-primary data-[state=active]:shadow-sm sm:text-sm">
              <Icon aria-hidden="true" className="hidden h-4 w-4 shrink-0 sm:block" /><span>{label}</span><span className="shrink-0 rounded-md bg-surface-subtle px-1.5 py-0.5 text-xs tabular-nums">{count.toLocaleString('pt-BR')}</span>
            </Tabs.Trigger>)}
          </Tabs.List>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <label htmlFor={searchId} className="sr-only">{section === 'unassigned' ? 'Buscar poste ou endereço' : 'Buscar poste, protocolo, endereço ou responsável'}</label>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-secondary" />
              <Input id={searchId} type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={section === 'unassigned' ? 'Buscar poste ou endereço' : 'Buscar poste, protocolo, endereço…'} className="min-w-0 border-edge-subtle bg-surface-raised pl-9 pr-10 [&::-webkit-search-cancel-button]:appearance-none" />
              {search && <button type="button" onClick={() => { setSearch(''); setPage(1); }} aria-label="Limpar busca" className="absolute right-1 top-1 rounded-md p-2 text-content-secondary hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><X className="h-4 w-4" /></button>}
            </div>
            {section === 'orders' && <div className="min-w-0 sm:w-48 sm:shrink-0">
              <label htmlFor={priorityId} className="sr-only">Filtrar por prioridade ou prazo</label>
              <select id={priorityId} value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }} className="h-10 w-full rounded-md border border-edge-subtle bg-surface-raised px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <option value="all">Todas as prioridades</option><option value="overdue">Prazo vencido</option>
                {DEMAND_PRIORITIES.slice().reverse().map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>}
          </div>
          <Tabs.Content key={section} value={section} className="min-w-0 space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <p className="text-xs leading-5 text-content-secondary">{section === 'unassigned' ? 'Postes com problema que precisam de uma ordem de serviço.' : 'Prazos vencidos e maiores prioridades aparecem primeiro.'}</p>
            {((section === 'unassigned' && state.unassignedCount > state.unassigned.length) || (section === 'orders' && state.count > rows.length)) && <p className="rounded-lg bg-surface-subtle px-3 py-2 text-xs leading-5 text-content-secondary">{section === 'unassigned' ? `Busca e paginação nos primeiros ${state.unassigned.length} postes. Para ver todos, use “Apagado ou com problema” no mapa.` : `Busca e filtros nas ${rows.length} ordens mais recentes. Consulte todas em Ordens de serviço.`}</p>}
            <div ref={listRef} className="min-w-0 overflow-hidden rounded-xl border border-edge-subtle">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge-subtle bg-surface-subtle px-4 py-2.5">
                <p role="status" className="text-xs text-content-secondary">{filteredRows.length ? `${start + 1}–${Math.min(start + PAGE_SIZE, filteredRows.length)} de ${filteredRows.length.toLocaleString('pt-BR')}${hasFilters ? ' resultados' : section === 'unassigned' ? ' postes' : ' ordens'}` : 'Nenhum item para exibir'}</p>
                {hasFilters && <button type="button" onClick={clearFilters} className="rounded text-xs font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Limpar filtros</button>}
              </div>
              {visibleRows.length ? <ul className="divide-y divide-edge-subtle">{visibleRows.map((row) => section === 'unassigned'
                ? <li key={row.id}>
                  <Link to={`/prefeitura/demandas/nova?poste=${row.id}`} className="group flex min-w-0 flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:flex-row sm:items-center sm:gap-4">
                    <span aria-hidden="true" className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-content-secondary sm:flex"><Lightbulb className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><strong className="block break-words text-sm">Poste {poleCode(row.identifier || row.plate || row.id)}</strong><span className="mt-1 block break-words text-xs leading-5 text-content-secondary">{row.address || 'Endereço não informado'}</span></span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-edge-subtle px-2.5 py-1.5 text-xs font-semibold text-brand group-hover:border-brand/30 sm:self-center">Criar ordem<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></span>
                  </Link>
                </li>
                : <li key={row.id} className="min-w-0 px-4 py-3.5">
                  <Link to={`/prefeitura/demandas/${row.id}`} className="group flex min-w-0 items-start justify-between gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                    <span className="min-w-0 flex-1"><strong className="block break-words text-sm group-hover:text-brand">Poste {poleCode(row.pole?.identifier || row.pole?.plate || row.pole_id)}</strong><span className="mt-1 block break-words text-xs leading-5 text-content-secondary">{row.protocolo}{row.pole?.address ? ` · ${row.pole.address}` : ''}</span></span>
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-brand"><span className="hidden sm:inline">Abrir ordem</span><ArrowRight aria-hidden="true" className="h-4 w-4" /></span>
                  </Link>
                  <details className="group mt-2 text-xs">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 rounded text-content-secondary hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
                      <span className="text-[11px]">{labelFor(DEMAND_STATUSES, row.status)}</span>
                      {isOverdue(row) ? <span className="rounded-md bg-danger-subtleBg px-2 py-0.5 text-[11px] font-semibold text-danger-subtleFg">Prazo vencido</span> : ['urgente', 'alta'].includes(row.prioridade) && <span className="rounded-md bg-brand-subtleBg px-2 py-0.5 text-[11px] font-semibold text-brand-subtleFg">{labelFor(DEMAND_PRIORITIES, row.prioridade)}</span>}
                      <span className="ml-auto inline-flex items-center gap-1">Detalhes<span className="sr-only"> da ordem {row.protocolo || row.id}</span><ChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></span>
                    </summary>
                    <div className="mt-2 space-y-2 rounded-lg bg-surface-subtle p-3 text-content-secondary">
                      <p className="break-words leading-5">{poleReferenceText(row.titulo)}</p>
                      <dl className="grid gap-3 sm:grid-cols-3">
                        <div className="min-w-0"><dt>Prazo</dt><dd className="mt-0.5 font-medium text-content-primary">{row.prazo_em ? formatDate(row.prazo_em) : 'Não definido'}</dd></div>
                        <div className="min-w-0"><dt>Responsável</dt><dd className="mt-0.5 break-words font-medium text-content-primary">{row.responsavel?.name || 'Não atribuído'}</dd></div>
                        <div className="min-w-0"><dt>Prioridade</dt><dd className="mt-0.5 font-medium text-content-primary">{labelFor(DEMAND_PRIORITIES, row.prioridade)}</dd></div>
                      </dl>
                    </div>
                  </details>
                </li>)}</ul> : <MunicipalEmptyState title={hasFilters ? 'Nenhum resultado encontrado' : state.error ? 'Dados indisponíveis' : section === 'unassigned' ? 'Nenhum poste sem ordem' : 'Nenhuma ordem aberta'} description={hasFilters ? 'Tente outro número, endereço ou prioridade.' : state.error ? 'Não foi possível carregar os dados desta lista.' : section === 'unassigned' ? 'Não há postes com problema sem ordem ativa.' : 'Não há ordens abertas vinculadas a postes.'} action={hasFilters && <Button type="button" variant="outline" size="sm" onClick={clearFilters}>Limpar filtros</Button>} />}
              <MunicipalPagination page={currentPage} total={filteredRows.length} pageSize={PAGE_SIZE} onPageChange={changePage} />
            </div>
          </Tabs.Content>
        </Tabs.Root>
        <div className="flex justify-end"><Link to="/prefeitura/demandas" className="inline-flex items-center gap-1.5 rounded text-xs font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Ver todas as ordens <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link></div>
      </>}
  </div>;
}
