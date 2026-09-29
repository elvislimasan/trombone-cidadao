import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Download, FileText, Loader2, Table2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FormDialogContent } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/lib/customSupabaseClient';
import { DEMAND_PRIORITIES, DEMAND_STATUSES } from '@/lib/municipalDemand';
import { REPORT_AGES, REPORT_STATUSES } from '@/lib/municipalReports';
import { EXPORT_DEFAULT_FILTERS, EXPORT_QUEUES, exportLabel, groupExportRecords, loadMunicipalExport } from '@/lib/municipalExport';

const controlClass = 'h-9 w-full min-w-0 rounded-lg border border-edge-default bg-surface-raised px-3 text-[13px] text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
const GROUPS = [['none', 'Sem agrupamento'], ['status', 'Status'], ['responsible', 'Responsável'], ['channel', 'Secretaria'], ['neighborhood', 'Bairro'], ['category', 'Categoria']];

function SelectField({ label, value, options, onChange, allLabel }) {
  return <label className="grid min-w-0 gap-1.5 text-xs font-medium text-content-secondary">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className={controlClass}>
    {allLabel && <option value="all">{allLabel}</option>}{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
  </select></label>;
}

export default function MunicipalExportDialog({ kind, context, initialFilters, selectedIds = [], onClose }) {
  const demands = kind === 'demands';
  const [filters, setFilters] = useState(() => ({ ...EXPORT_DEFAULT_FILTERS, ...(selectedIds.length ? {} : initialFilters) }));
  const [scope, setScope] = useState(selectedIds.length ? 'selected' : 'filtered');
  const [format, setFormat] = useState('pdf');
  const [layout, setLayout] = useState('table');
  const [groupBy, setGroupBy] = useState('none');
  const [result, setResult] = useState({ filters: null, scope: null, records: [], loading: true, error: '', progress: 0 });
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const busy = result.loading || result.filters !== filters || result.scope !== scope;
  const statuses = demands ? DEMAND_STATUSES : REPORT_STATUSES;
  const members = useMemo(() => [...new Map((context.members || []).map((member) => [member.user_id, member.perfil?.name || 'Membro da equipe'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), [context.members]);
  const channels = (context.channels || []).map((channel) => [String(channel.id), channel.nome]);
  const categories = (context.categories || []).map((category) => [category.id, category.name]);
  const update = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); setFeedback(''); setDownloadError(''); };

  useEffect(() => {
    const controller = new AbortController();
    setResult({ filters, scope, records: [], loading: true, error: '', progress: 0 });
    const timer = window.setTimeout(async () => {
      try {
        const allRecords = await loadMunicipalExport(supabase, {
          kind, municipalityId: context.municipality.id, cityId: context.municipality.city_id, userId: context.userId,
          filters, scope: 'filtered', signal: controller.signal,
          onProgress: (progress) => { if (!controller.signal.aborted) setResult((current) => ({ ...current, progress })); },
        });
        const chosen = new Set(selectedIds);
        const records = scope === 'selected' ? allRecords.filter((record) => chosen.has(record.id)) : allRecords;
        if (!controller.signal.aborted) setResult({ filters, scope, records, total: allRecords.length, loading: false, error: '', progress: records.length });
      } catch (failure) {
        if (!controller.signal.aborted) setResult({ filters, scope, records: [], loading: false, error: failure.message || 'Não foi possível carregar os registros.', progress: 0 });
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [kind, context.municipality.id, context.municipality.city_id, context.userId, filters, scope, selectedIds, revision]);

  const dateError = filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo ? 'A data final deve ser igual ou posterior à data inicial.' : '';
  const filterSummary = () => {
    const rows = [['Abrangência', scope === 'selected' ? 'Selecionados' : 'Todas as páginas']];
    if (groupBy !== 'none') rows.push(['Agrupamento', exportLabel(GROUPS, groupBy)]);
    if (filters.statuses.length) rows.push(['Status', filters.statuses.map((id) => exportLabel(statuses, id)).join(', ')]);
    else if (!demands) rows.push(['Status', 'Todas em aberto']);
    if (filters.query.trim()) rows.push(['Busca', filters.query.trim()]);
    if (filters.responsible !== 'all') rows.push(['Responsável', exportLabel([['unassigned', 'Sem responsável'], ...members], filters.responsible)]);
    if (filters.channel !== 'all') rows.push(['Secretaria', exportLabel(channels, filters.channel)]);
    if (filters.category !== 'all') rows.push(['Categoria', exportLabel(categories, filters.category)]);
    if (filters.neighborhood.trim()) rows.push(['Bairro', filters.neighborhood.trim()]);
    if (filters.priority !== 'all') rows.push(['Prioridade', exportLabel(DEMAND_PRIORITIES, filters.priority)]);
    if (filters.age !== 'all') rows.push(['Idade da bronca', exportLabel(REPORT_AGES, filters.age)]);
    if (filters.orderLink !== 'all') rows.push([demands ? 'Vínculo com bronca' : 'Ordem de serviço', exportLabel(orderLinkOptions, filters.orderLink)]);
    if (filters.queue !== 'all') rows.push(['Fila de atendimento', exportLabel(EXPORT_QUEUES, filters.queue)]);
    if (filters.overdue) rows.push(['Prazo', 'Somente atrasadas']);
    if (filters.dueToday) rows.push(['Vencimento', 'Vencem hoje']);
    const date = (value) => value ? value.split('-').reverse().join('/') : 'Sem limite';
    if (filters.dateFrom) rows.push([demands ? 'Criada a partir de' : 'Publicada a partir de', date(filters.dateFrom)]);
    if (filters.dateTo) rows.push([demands ? 'Criada até' : 'Publicada até', date(filters.dateTo)]);
    rows.push(['Ordenação', exportLabel([['recentes', 'Mais recentes'], ['antigas', 'Mais antigas'], ['prazo', 'Prazo mais próximo']], filters.sort)]);
    return rows;
  };
  const orderLinkOptions = [['all', 'Com e sem vínculo'], ['linked', demands ? 'Com bronca vinculada' : 'Com ordem de serviço'], ['unlinked', demands ? 'Sem bronca vinculada' : 'Sem ordem de serviço']];
  const advancedCount = [filters.age !== 'all', filters.orderLink !== 'all', filters.sort !== 'recentes', Boolean(filters.dateFrom), Boolean(filters.dateTo), groupBy !== 'none', format === 'pdf' && layout !== 'table', demands && filters.priority !== 'all', demands && filters.queue !== 'all', demands && filters.overdue, demands && filters.dueToday].filter(Boolean).length;
  const activeFilters = [];
  const chip = (key, label, value, reset) => activeFilters.push({ key, label, value, remove: () => update(key, reset) });
  if (filters.query.trim()) chip('query', 'Busca', filters.query.trim(), '');
  filters.statuses.forEach((id) => activeFilters.push({ key: 'status-' + id, label: 'Status', value: exportLabel(statuses, id), remove: () => update('statuses', filters.statuses.filter((value) => value !== id)) }));
  if (filters.category !== 'all') chip('category', 'Categoria', exportLabel(categories, filters.category), 'all');
  if (filters.neighborhood.trim()) chip('neighborhood', 'Bairro', filters.neighborhood.trim(), '');
  if (filters.responsible !== 'all') chip('responsible', 'Responsável', exportLabel([['unassigned', 'Sem responsável'], ...members], filters.responsible), 'all');
  if (filters.channel !== 'all') chip('channel', 'Secretaria', exportLabel(channels, filters.channel), 'all');
  if (filters.age !== 'all') chip('age', 'Idade da bronca', exportLabel(REPORT_AGES, filters.age), 'all');
  if (filters.orderLink !== 'all') chip('orderLink', demands ? 'Vínculo com bronca' : 'Ordem de serviço', exportLabel(orderLinkOptions, filters.orderLink), 'all');
  if (filters.priority !== 'all') chip('priority', 'Prioridade', exportLabel(DEMAND_PRIORITIES, filters.priority), 'all');
  if (filters.queue !== 'all') chip('queue', 'Fila de atendimento', exportLabel(EXPORT_QUEUES, filters.queue), 'all');
  if (filters.overdue) chip('overdue', 'Prazo', 'Somente atrasadas', false);
  if (filters.dueToday) chip('dueToday', 'Vencimento', 'Vencem hoje', false);
  if (filters.sort !== 'recentes') chip('sort', 'Ordenação', exportLabel([['antigas', 'Mais antigas'], ['prazo', 'Prazo mais próximo']], filters.sort), 'recentes');
  if (filters.dateFrom) chip('dateFrom', demands ? 'Criada a partir de' : 'Publicada a partir de', filters.dateFrom.split('-').reverse().join('/'), '');
  if (filters.dateTo) chip('dateTo', demands ? 'Criada até' : 'Publicada até', filters.dateTo.split('-').reverse().join('/'), '');
  const mainFilters = activeFilters.filter((filter) => ['category', 'neighborhood', 'responsible', 'channel', 'query'].includes(filter.key) || filter.key.startsWith('status-'));
  const download = async (event) => {
    event.preventDefault();
    if (busy || exporting || dateError || result.error || !result.records.length) return;
    setExporting(true); setDownloadError(''); setFeedback('');
    try {
      const { downloadMunicipalExport } = await import('@/utils/municipalExport');
      await downloadMunicipalExport({ records: result.records, kind, municipality: context.municipality, format, layout, groupBy, filterSummary: filterSummary() });
      setFeedback(`${format.toUpperCase()} gerado com ${result.records.length.toLocaleString('pt-BR')} registros.`);
    } catch (failure) { setDownloadError(failure.message || 'Não foi possível gerar o arquivo. Tente novamente.'); }
    finally { setExporting(false); }
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !exporting) onClose(); }}>
    <FormDialogContent hideClose={exporting} className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden p-0 sm:max-h-[85dvh] sm:w-[calc(100vw-4rem)] sm:max-w-5xl sm:rounded-xl">
      <DialogHeader className="shrink-0 border-b border-edge-subtle px-5 py-4 pr-12 text-left sm:px-6"><DialogTitle className="text-xl">Exportar {demands ? 'ordens de serviço' : 'broncas'}</DialogTitle><DialogDescription className="mt-1 text-xs text-content-secondary">Prepare um relatório com todos os resultados ou com sua seleção.</DialogDescription></DialogHeader>
      <form onSubmit={download} className="flex min-h-0 flex-col">
        <fieldset disabled={exporting} className="min-h-0 min-w-0 overflow-y-auto px-5 py-4 sm:px-6">
          <div className="mb-4 space-y-3 border-b border-edge-subtle pb-4">
            <fieldset className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2"><legend className="sr-only">O que exportar</legend><span className="w-24 shrink-0 text-xs font-medium text-content-secondary">O que exportar</span><div className="inline-flex min-w-0 flex-wrap gap-1 rounded-lg border border-edge-default bg-surface-subtle p-1">
              {[["filtered", 'Todos os resultados', busy ? '…' : result.total?.toLocaleString('pt-BR')], ['selected', 'Selecionados', selectedIds.length.toLocaleString('pt-BR')]].map(([value, title, count]) => <label key={value} className={'flex min-w-0 items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors ' + (scope === value ? 'bg-surface-raised font-semibold text-content-primary shadow-sm' : 'text-content-secondary') + (value === 'selected' && !selectedIds.length ? ' cursor-not-allowed opacity-50' : ' cursor-pointer')}><input type="radio" name="export-scope" value={value} checked={scope === value} disabled={value === 'selected' && !selectedIds.length} onChange={() => { setScope(value); setFeedback(''); }} className="accent-brand" /><span>{title} · <span className="tabular-nums">{count}</span></span></label>)}
            </div></fieldset>
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2"><legend className="sr-only">Formato</legend><span className="w-24 shrink-0 text-xs font-medium text-content-secondary">Formato</span><div className="inline-flex gap-1 rounded-lg border border-edge-default bg-surface-subtle p-1">{[["pdf", 'PDF', FileText], ['csv', 'Planilha', Table2]].map(([value, title, Icon]) => <label key={value} className={'flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-xs ' + (format === value ? 'bg-surface-raised font-semibold text-content-primary shadow-sm' : 'text-content-secondary')}><input type="radio" name="export-format" value={value} checked={format === value} onChange={() => { setFormat(value); setFeedback(''); }} className="accent-brand" /><Icon className={'h-3.5 w-3.5 ' + (format === value ? 'text-brand' : '')} />{title}</label>)}</div><span className="text-[11px] text-content-tertiary">{format === 'pdf' ? 'Pronto para impressão A4' : 'CSV para Excel ou Google Planilhas'}</span></fieldset>
          </div>
          <div className="grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_250px]">
            <div className="min-w-0 space-y-3">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Filtros</h3><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-content-secondary" disabled={!activeFilters.length} onClick={() => { setFilters({ ...EXPORT_DEFAULT_FILTERS }); setFeedback(''); setDownloadError(''); }}>Limpar filtros</Button></div>
              {activeFilters.length > 0 && <section aria-label="Filtros ativos" className="space-y-2"><h4 className="text-[11px] font-medium text-content-secondary">Filtros ativos</h4><div className="flex flex-wrap gap-1.5">{activeFilters.map((filter) => <button key={filter.key} type="button" onClick={filter.remove} aria-label={'Remover filtro: ' + filter.label + ': ' + filter.value} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-edge-subtle bg-surface-subtle px-2 py-1 text-[11px] text-content-secondary hover:border-edge-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><span className="truncate">{filter.label}: {filter.value}</span><X className="h-3 w-3 shrink-0" /></button>)}</div></section>}
              <div className="grid min-w-0 gap-x-3 gap-y-3 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1.5 text-xs font-medium text-content-secondary">Busca<Input value={filters.query} onChange={(event) => update('query', event.target.value)} placeholder={demands ? 'Título, protocolo ou local' : 'Título, descrição ou local'} className={controlClass} /></label>
                <div className="grid min-w-0 gap-1.5"><span id="export-status-label" className="text-xs font-medium text-content-secondary">Status</span><Popover><PopoverTrigger asChild><button type="button" aria-labelledby="export-status-label" className={controlClass + ' flex items-center justify-between gap-2 text-left'} title={filters.statuses.map((id) => exportLabel(statuses, id)).join(', ')}><span className="truncate">{filters.statuses.length ? filters.statuses.map((id) => exportLabel(statuses, id)).join(', ') : demands ? 'Todos os status' : 'Todas em aberto'}</span><ChevronDown className="h-3.5 w-3.5 shrink-0 text-content-tertiary" /></button></PopoverTrigger><PopoverContent align="start" className="max-h-80 max-w-[calc(100vw-2rem)] space-y-1 overflow-y-auto rounded-lg border-edge-default bg-surface-raised p-2"><p className="px-2 py-1 text-[11px] text-content-secondary">Selecione um ou mais status</p><label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-surface-subtle"><input type="checkbox" checked={!filters.statuses.length} onChange={() => update('statuses', [])} disabled={exporting} className="accent-brand" />{demands ? 'Todos os status' : 'Todas em aberto'}</label>{statuses.map(([id, label]) => <label key={id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-surface-subtle"><input type="checkbox" checked={filters.statuses.includes(id)} disabled={exporting} onChange={(event) => update('statuses', event.target.checked ? [...filters.statuses, id] : filters.statuses.filter((value) => value !== id))} className="accent-brand" />{label}</label>)}</PopoverContent></Popover></div>
                <SelectField label="Categoria" value={filters.category} allLabel="Todas as categorias" options={categories} onChange={(value) => update('category', value)} />
                <label className="grid min-w-0 gap-1.5 text-xs font-medium text-content-secondary">Bairro<Input value={filters.neighborhood} onChange={(event) => update('neighborhood', event.target.value)} placeholder="Todos os bairros" className={controlClass} /></label>
                <SelectField label="Responsável" value={filters.responsible} allLabel="Todos os responsáveis" options={[["unassigned", 'Sem responsável'], ...members]} onChange={(value) => update('responsible', value)} />
                <SelectField label="Secretaria" value={filters.channel} allLabel="Todas as secretarias" options={channels} onChange={(value) => update('channel', value)} />
              </div>
              <div className="border-t border-edge-subtle pt-3"><button type="button" aria-expanded={advancedOpen} aria-controls="export-advanced-filters" onClick={() => setAdvancedOpen((current) => !current)} className="flex w-full items-center justify-between rounded py-1 text-xs font-semibold text-content-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><span>Mais filtros{advancedCount > 0 ? ` (${advancedCount})` : ''}</span><ChevronDown className={'h-4 w-4 transition-transform ' + (advancedOpen ? 'rotate-180' : '')} /></button>
                {advancedOpen && <div id="export-advanced-filters" className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                  {demands ? <SelectField label="Prioridade" value={filters.priority} allLabel="Todas as prioridades" options={DEMAND_PRIORITIES} onChange={(value) => update('priority', value)} /> : <SelectField label="Idade da bronca" value={filters.age} options={REPORT_AGES} onChange={(value) => update('age', value)} />}
                  <SelectField label={demands ? 'Vínculo com bronca' : 'Ordem de serviço'} value={filters.orderLink} options={orderLinkOptions} onChange={(value) => update('orderLink', value)} />
                  <SelectField label="Ordenação" value={filters.sort} options={[["recentes", 'Mais recentes'], ['antigas', 'Mais antigas'], ...(demands ? [['prazo', 'Prazo mais próximo']] : [])]} onChange={(value) => update('sort', value)} />
                  {demands && <SelectField label="Fila de atendimento" value={filters.queue} options={EXPORT_QUEUES} onChange={(value) => update('queue', value)} />}
                  <label className="grid min-w-0 gap-1.5 text-xs font-medium text-content-secondary">{demands ? 'Criada a partir de' : 'Publicada a partir de'}<Input type="date" value={filters.dateFrom} onChange={(event) => update('dateFrom', event.target.value)} className={controlClass} /></label>
                  <label className="grid min-w-0 gap-1.5 text-xs font-medium text-content-secondary">{demands ? 'Criada até' : 'Publicada até'}<Input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(event) => update('dateTo', event.target.value)} className={controlClass} /></label>
                  {format === 'pdf' && <SelectField label="Apresentação" value={layout} options={[["table", 'Visão geral'], ['details', 'Fichas com descrição']]} onChange={(value) => { setLayout(value); setFeedback(''); }} />}
                  <SelectField label="Agrupamento" value={groupBy} options={GROUPS} onChange={(value) => { setGroupBy(value); setFeedback(''); }} />
                  {demands && <div className="flex flex-wrap gap-3 text-xs text-content-secondary sm:col-span-2"><label className="flex items-center gap-2"><input type="checkbox" checked={filters.overdue} onChange={(event) => update('overdue', event.target.checked)} className="accent-brand" />Somente atrasadas</label><label className="flex items-center gap-2"><input type="checkbox" checked={filters.dueToday} onChange={(event) => update('dueToday', event.target.checked)} className="accent-brand" />Vencem hoje</label></div>}
                </div>}
              </div>
              {dateError && <p role="alert" className="text-xs text-danger">{dateError}</p>}
              <p className="text-[11px] leading-5 text-content-tertiary">{demands ? 'Os filtros se aplicam somente ao arquivo exportado.' : 'Responsável e secretaria correspondem à ordem vinculada à bronca.'}</p>
            </div>
            <aside className="min-w-0 self-start rounded-lg bg-surface-subtle/70 p-4" aria-live="polite" aria-atomic="true"><h3 className="mb-4 text-sm font-semibold">Resumo da exportação</h3>
              {busy ? <div role="status" className="flex items-center gap-2 text-xs text-content-secondary"><Loader2 className="h-4 w-4 animate-spin" />{result.progress ? `${result.progress.toLocaleString('pt-BR')} registros consultados…` : 'Preparando prévia…'}</div> : result.error ? <div><p role="alert" className="text-xs text-danger">{result.error}</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</Button></div> : <><p className="text-3xl font-semibold tabular-nums text-content-primary">{result.records.length.toLocaleString('pt-BR')}</p><p className="mt-1 text-xs text-content-secondary">{demands ? 'ordens de serviço' : 'broncas'} serão exportadas</p><p className="mt-2 text-xs font-medium text-content-secondary">{format === 'pdf' ? `PDF · ${layout === 'table' ? 'Visão geral' : 'Fichas com descrição'}` : 'Planilha · CSV'}</p>
                {result.records.length === 0 && <p className="mt-3 text-xs leading-5 text-content-secondary">Nenhum resultado. Ajuste os filtros ou sua seleção.</p>}
                {mainFilters.length > 0 && <div className="mt-4"><p className="mb-2 text-[11px] font-semibold text-content-secondary">Filtros principais</p><ul className="space-y-1 text-xs text-content-secondary">{mainFilters.map((filter) => <li key={filter.key} className="break-words">{filter.label}: {filter.value}</li>)}</ul></div>}
                {result.records.length > 0 && <div className="mt-4 space-y-2 border-t border-edge-default pt-3"><h4 className="mb-3 text-[11px] font-semibold text-content-secondary">Distribuição</h4>{groupExportRecords(result.records, 'status').map((group) => <p key={group.name} className="flex items-start justify-between gap-3 text-xs text-content-secondary"><span>{group.name}</span><span className="font-medium tabular-nums text-content-primary">{group.rows.length.toLocaleString('pt-BR')}</span></p>)}</div>}
              </>}
              <p className="mt-4 text-[11px] leading-5 text-content-tertiary">{scope === 'selected' ? 'Inclui sua seleção entre filtros e páginas.' : 'Inclui os resultados de todas as páginas.'}</p>
            </aside>
          </div>
        </fieldset>
        {downloadError && <p role="alert" className="shrink-0 px-6 pb-3 text-xs text-danger">{downloadError}</p>}
        {feedback && <p role="status" className="flex shrink-0 items-center gap-2 px-6 pb-3 text-xs text-success-fg"><CheckCircle2 className="h-4 w-4" />{feedback}</p>}
        <DialogFooter className="shrink-0 gap-2 border-t border-edge-subtle bg-surface-raised px-5 py-3 sm:px-6"><Button type="button" variant="outline" disabled={exporting} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy || exporting || Boolean(dateError || result.error) || !result.records.length}>{exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}{exporting ? 'Gerando arquivo…' : `Baixar ${format === 'pdf' ? 'PDF' : 'planilha'} · ${busy ? '…' : result.records.length.toLocaleString('pt-BR')} ${result.records.length === 1 ? 'registro' : 'registros'}`}</Button></DialogFooter>
      </form>
    </FormDialogContent>
  </Dialog>;
}
