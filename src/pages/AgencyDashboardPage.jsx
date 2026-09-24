import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import AgencyReportImage from '@/components/municipality/AgencyReportImage';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError } from '@/lib/appError';
import { AGENCY_SORTS, createAgencyCasesQuery, isAgencyCaseOverdue, loadAgencyMapCases } from '@/lib/agencyCaseFilters';
import {
  AGENCY_CASE_STATUSES,
  agencyCaseStatus,
} from '@/lib/agencyPanel';

const PAGE_SIZE = 25;
const AgencyCasesMap = lazy(() => import('@/components/municipality/AgencyCasesMap'));
const EMPTY_SUMMARY = Object.freeze({
  total: 0,
  abertas: 0,
  novas: 0,
  atrasadas: 0,
  aguardandoConfirmacao: 0,
});

const CASE_SELECT = `
  report_id, canal_id, status, prioridade, protocolo, prazo_em, created_at, updated_at,
  canal:orgao_canais!orgao_casos_canal_id_fkey(id, nome, canal_triagem, city_id),
  responsavel:profiles!orgao_casos_atribuido_a_fkey(id, name),
  report:reports!orgao_casos_report_id_fkey!inner(
    id, title, address, neighborhood, created_at, location,
    category_id, featured_image_url, report_media(url, type, created_at), category:categories(name, icon)
  )
`;

const fmtDate = (value, withTime = false) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', withTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'short' });
};

const cityLabel = (channel) => {
  const city = channel?.cidade;
  return [city?.name, city?.states?.uf].filter(Boolean).join(' · ');
};

const channelLabel = (channel) => (
  channel?.canal_triagem ? 'Triagem municipal' : channel?.nome
);

const StatusBadge = ({ item }) => {
  const status = agencyCaseStatus(item);
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${status.tone}`}>{status.label}</span>;
};

export default function AgencyDashboardPage({ view = 'list' }) {
  const mapView = view === 'map';
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cases, setCases] = useState([]);
  const [municipalityMemberships, setMunicipalityMemberships] = useState([]);
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [totalCount, setTotalCount] = useState(0);
  const [contextLoading, setContextLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const listRequestSequence = useRef(0);

  const search = searchParams.get('q') || '';
  const channelId = searchParams.get('secretaria') || 'all';
  const statusFilter = searchParams.get('situacao') || 'abertas';
  const category = searchParams.get('categoria') || 'all';
  const priority = searchParams.get('prioridade') || 'all';
  const assignment = searchParams.get('responsavel') || 'all';
  const age = searchParams.get('idade') || 'all';
  const overdue = searchParams.get('atrasadas') === '1';
  const sort = searchParams.get('ordem') || 'antigas';
  const requestedPage = Number.parseInt(searchParams.get('pagina') || '1', 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [searchInput, setSearchInput] = useState(search);

  const updateFilter = useCallback((key, value, defaultValue) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (!value || value === defaultValue) next.delete(key);
      else next.set(key, value);
      if (key !== 'pagina') next.delete('pagina');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => { setSearchInput(search); }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchInput !== search) updateFilter('q', searchInput, '');
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search, searchInput, updateFilter]);

  const loadContext = useCallback(async () => {
    setContextLoading(true);
    const [municipalityResult, channelResult, categoryResult] = await Promise.all([
      supabase
        .from('prefeitura_membros')
        .select('id, prefeitura_id, user_id, papel, ativo, prefeitura:prefeituras!prefeitura_membros_prefeitura_id_fkey(id, city_id, nome, status)')
        .eq('user_id', user?.id)
        .eq('ativo', true),
      supabase
        .from('orgao_canais')
        .select('id, nome, city_id, ativo, canal_triagem, cidade:cities(name, states(uf))')
        .or('ativo.eq.true,canal_triagem.eq.true')
        .order('canal_triagem', { ascending: false })
        .order('nome'),
      supabase.from('categories').select('id, name').order('name'),
    ]);
    setMunicipalityMemberships(municipalityResult.data || []);
    setChannels(channelResult.data || []);
    setCategories(categoryResult.data || []);
    setContextLoading(false);
  }, [user?.id]);

  const loadCases = useCallback(async ({ quiet = false } = {}) => {
    const requestId = ++listRequestSequence.current;
    if (quiet) setRefreshing(true);
    else setListLoading(true);
    setLoadError('');

    const channelArgument = channelId === 'all' ? null : channelId;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const queryFactory = () => createAgencyCasesQuery(supabase, CASE_SELECT, {
      channelId, statusFilter, search, category, priority, assignment, age, overdue, sort, userId: user?.id,
    });
    try {
      const [caseResult, summaryResult] = await Promise.all([
        mapView
          ? loadAgencyMapCases(queryFactory, () => requestId === listRequestSequence.current).then((data) => ({ data, count: data?.length || 0 }))
          : queryFactory().range(from, to),
        supabase.rpc('resumo_casos_prefeitura', { p_canal: channelArgument }).maybeSingle(),
      ]);

      if (requestId !== listRequestSequence.current) return;

      if (caseResult.error) throw caseResult.error;
      setCases(caseResult.data || []);
      setTotalCount(caseResult.count || 0);
      const totals = summaryResult.data;
      setSummary(totals ? {
        total: Number(totals.total || 0),
        abertas: Number(totals.abertas || 0),
        novas: Number(totals.novas || 0),
        atrasadas: Number(totals.atrasadas || 0),
        aguardandoConfirmacao: Number(totals.aguardando_confirmacao || 0),
      } : EMPTY_SUMMARY);
    } catch (error) {
      if (requestId !== listRequestSequence.current) return;
      setLoadError(error.message || 'Não foi possível carregar as demandas.');
      setCases([]);
      setTotalCount(0);
      showAppError({ title: 'Não foi possível abrir o painel', description: error.message, variant: 'destructive' });
    } finally {
      if (requestId === listRequestSequence.current) {
        setListLoading(false);
        setRefreshing(false);
      }
    }
  }, [channelId, page, search, statusFilter, category, priority, assignment, age, overdue, sort, mapView, user?.id]);

  useEffect(() => { loadContext(); }, [loadContext]);
  useEffect(() => { loadCases(); return () => { listRequestSequence.current += 1; }; }, [loadCases]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    if (!mapView && !listLoading && page > totalPages) updateFilter('pagina', String(totalPages), '1');
  }, [mapView, listLoading, page, totalPages, updateFilter]);

  if (contextLoading && listLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;
  }

  const platformUser = user?.is_admin || user?.is_master;
  if (platformUser || municipalityMemberships.length === 0) {
    return (
      <div className="page-shell-fluid py-12">
        <div className="mx-auto max-w-xl rounded-3xl border border-edge-subtle bg-surface-raised p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-10 w-10 text-content-tertiary" />
          <h1 className="mt-4 text-2xl font-black">Acesso institucional necessário</h1>
          <p className="mt-2 text-sm leading-6 text-content-secondary">
            {platformUser
              ? 'O administrador da plataforma gerencia os cadastros, mas não entra no painel operacional das prefeituras.'
              : 'Este painel é exclusivo para contas convidadas ou aprovadas como integrantes de uma prefeitura.'}
          </p>
          <Button asChild className="mt-5">
            <Link to={platformUser ? '/admin/prefeituras' : '/prefeitura/acesso'}>
              {platformUser ? 'Gerenciar prefeituras' : 'Solicitar cadastro'}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const filterParams = new URLSearchParams(searchParams);
  filterParams.delete('origem');
  const currentQuery = filterParams.toString();

  const activeFilterCount = [channelId !== 'all', statusFilter !== 'abertas', category !== 'all', priority !== 'all', assignment !== 'all', age !== 'all', overdue, sort !== 'antigas'].filter(Boolean).length;
  const searchControls = <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1 sm:justify-end">
    <label className="relative min-w-0 flex-1 sm:max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary" />
      <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar título, endereço ou protocolo" aria-label="Buscar título, endereço ou protocolo" className="pl-9" />
    </label>
    <Button type="button" variant="outline" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" className="shrink-0 gap-2">
      <SlidersHorizontal className="h-4 w-4" />Filtrar
      {activeFilterCount > 0 && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] text-white">{activeFilterCount}</span>}
    </Button>
  </div>;

  return (
    <>
      <Helmet>
        <title>{mapView ? 'Mapa de broncas' : 'Caixa de entrada'} | Painel da Prefeitura</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="page-shell-fluid py-6 sm:py-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-brand">Gestão pública</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">{mapView ? 'Mapa de broncas' : 'Caixa de entrada'}</h1>
            <p className="mt-2 max-w-3xl text-sm text-content-secondary">
              Priorize as demandas da cidade e abra cada bronca para distribuir, responder e acompanhar o atendimento.
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => loadCases({ quiet: true })} disabled={refreshing} title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </header>

        <nav aria-label="Visualização das demandas" className="mt-5 flex gap-2">
          {[['list', '/prefeitura/broncas', 'Lista de demandas'], ['map', '/prefeitura/mapa', 'Mapa de broncas']].map(([id, path, label]) => <Link key={id} to={`${path}?${currentQuery}`} aria-current={view === id ? 'page' : undefined} className={`rounded-full px-4 py-2 text-sm font-bold ${view === id ? 'bg-brand text-content-onBrand' : 'border border-edge-subtle bg-surface-raised text-content-secondary hover:bg-brand-subtleBg'}`}>{label}</Link>)}
        </nav>

        <section className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Na fila', summary.abertas, Inbox, 'text-brand'],
            ['Aguardando recebimento', summary.novas, AlertTriangle, 'text-amber-600'],
            ['Atrasadas', summary.atrasadas, Clock, 'text-red-600'],
            ['Aguardando confirmação', summary.aguardandoConfirmacao, CheckCircle2, 'text-emerald-600'],
            ['Total recebido', summary.total, FileText, 'text-content-secondary'],
          ].map(([label, value, Icon, tone]) => (
            <div key={label} className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-content-secondary">{label}</p>
                <Icon className={`h-4 w-4 ${tone}`} />
              </div>
              <p className="mt-2 text-2xl font-black tabular-nums">{value}</p>
            </div>
          ))}
        </section>

        <MunicipalDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtrar demandas" description="Os filtros são aplicados à lista e ao mapa conforme você seleciona."
          footer={<div className="flex items-center justify-between gap-3"><Button variant="outline" onClick={() => { setSearchInput(''); setSearchParams({}, { replace: true }); }}>Limpar filtros</Button><Button onClick={() => setFiltersOpen(false)}>Ver resultados</Button></div>}>
          <div className="grid min-w-0 gap-5">
          <label className="grid min-w-0 gap-1 text-xs font-semibold text-content-secondary">Secretaria
          <select
            aria-label="Secretaria"
            value={channelId}
            onChange={(event) => updateFilter('secretaria', event.target.value, 'all')}
            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">Todas as secretarias</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>{channelLabel(channel)} · {cityLabel(channel)}</option>
            ))}
          </select></label>
          <label className="grid min-w-0 gap-1 text-xs font-semibold text-content-secondary">Situação
          <select
            aria-label="Situação"
            value={statusFilter}
            onChange={(event) => updateFilter('situacao', event.target.value, 'abertas')}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="abertas">Demandas abertas</option>
            <option value="all">Todas as situações</option>
            {AGENCY_CASE_STATUSES.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}
          </select></label>
          {[
            ['categoria', 'Categoria', category, [['all', 'Todas as categorias'], ...categories.map((item) => [item.id, item.name])]],
            ['prioridade', 'Prioridade', priority, [['all', 'Todas as prioridades'], ['urgente', 'Urgente'], ['alta', 'Alta'], ['normal', 'Normal'], ['baixa', 'Baixa']]],
            ['responsavel', 'Responsável', assignment, [['all', 'Todos os responsáveis'], ['minhas', 'Atribuídas a mim'], ['sem', 'Sem responsável']]],
            ['idade', 'Tempo desde o registro da bronca', age, [['all', 'Qualquer tempo'], ['7', 'Há pelo menos 7 dias'], ['30', 'Há pelo menos 30 dias'], ['90', 'Há pelo menos 90 dias']]],
            ['ordem', 'Ordenar demandas', sort, AGENCY_SORTS.map((item) => [item.id, item.label])],
          ].map(([key, label, value, options]) => <label key={key} className="min-w-0 text-xs font-semibold text-content-secondary">{label}<select value={value} onChange={(event) => updateFilter(key, event.target.value, key === 'ordem' ? 'antigas' : 'all')} className="mt-1 h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-content-primary">{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>)}
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="accent-red-600" checked={overdue} onChange={(event) => updateFilter('atrasadas', event.target.checked ? '1' : '', '')} />Somente atrasadas</label>
          </div>
        </MunicipalDrawer>
        {(mapView || loadError) && <div className="mt-5 rounded-2xl border border-edge-subtle bg-surface-raised p-4">{searchControls}</div>}


        {loadError ? <div role="alert" className="mt-5 rounded-2xl border border-edge-subtle bg-surface-raised p-6"><p className="font-bold">Não foi possível carregar as demandas</p><p className="mt-2 text-sm text-content-secondary">{loadError}</p><Button className="mt-3" onClick={() => loadCases()}>Tentar novamente</Button></div> : mapView ? (listLoading || refreshing ? <div role="status" className="flex min-h-56 items-center justify-center gap-2 text-sm"><Loader2 className="h-6 w-6 animate-spin text-brand" />Carregando todas as demandas dos filtros…</div> : <Suspense fallback={<p className="p-6">Carregando mapa…</p>}><AgencyCasesMap cases={cases} query={currentQuery} /></Suspense>) :

        <section className="mt-5 min-w-0 overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm">
          <div className="flex flex-col gap-3 border-b border-edge-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-sm font-black">Demandas municipais</h2>
              <p className="text-xs text-content-tertiary">{totalCount} {totalCount === 1 ? 'demanda encontrada' : 'demandas encontradas'}</p>
            </div>
            {searchControls}
          </div>

          {listLoading ? (
            <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
          ) : cases.length === 0 ? (
            <div className="p-12 text-center">
              <Inbox className="mx-auto h-8 w-8 text-content-tertiary/40" />
              <p className="mt-3 text-sm text-content-tertiary">Nenhuma demanda corresponde aos filtros.</p>
            </div>
          ) : (
            <div className="divide-y divide-edge-subtle">
              {cases.map((item) => {
                const detailsPath = `/prefeitura/broncas/${item.report_id}${currentQuery ? `?${currentQuery}` : ''}`;
                return (
                  <Link
                    key={item.report_id}
                    to={detailsPath}
                    className="group grid min-w-0 gap-4 p-4 transition-colors hover:bg-surface-subtle sm:grid-cols-[5.5rem_minmax(0,1fr)] xl:grid-cols-[5.5rem_minmax(0,1.6fr)_minmax(0,0.65fr)_minmax(0,0.75fr)_auto] xl:items-center xl:px-5"
                  >
                    <AgencyReportImage report={item.report} compact />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge item={item} />
                        {item.prioridade === 'urgente' && <span className="text-[10px] font-black uppercase text-red-600">Urgente</span>}
                        {isAgencyCaseOverdue(item) && <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700">Prazo vencido</span>}
                      </div>
                      <h3 className="mt-2 line-clamp-2 text-sm font-black leading-5 group-hover:text-brand">
                        {item.report?.title || 'Bronca sem título'}
                      </h3>
                      <p className="mt-1 truncate text-xs text-content-tertiary">
                        {item.report?.category?.name || item.report?.category_id} · {item.report?.neighborhood || item.report?.address || 'Local não informado'}
                      </p>
                      <p className="mt-1 text-xs text-content-secondary">Bronca registrada em {fmtDate(item.report?.created_at)}</p>
                    </div>

                    <div className="min-w-0 sm:col-start-2 xl:col-start-auto">
                      <p className="text-[10px] font-black uppercase tracking-wide text-content-tertiary">Destino</p>
                      <p className="mt-1 truncate text-xs font-bold">{channelLabel(item.canal)}</p>
                      {item.canal?.canal_triagem && <p className="mt-1 text-[11px] text-amber-700">Aguardando distribuição</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs sm:col-start-2 xl:col-start-auto xl:grid-cols-1">
                      <p className="flex min-w-0 items-center gap-2 text-content-secondary"><User className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{item.responsavel?.name || 'Não atribuída'}</span></p>
                      <p className="flex min-w-0 items-center gap-2 text-content-secondary"><CalendarDays className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{item.prazo_em ? `Prazo ${fmtDate(item.prazo_em)}` : `Recebida ${fmtDate(item.created_at)}`}</span></p>
                    </div>

                    <ChevronRight className="hidden h-5 w-5 text-content-tertiary transition-transform group-hover:translate-x-1 group-hover:text-brand xl:block" />
                  </Link>
                );
              })}
            </div>
          )}

          {!listLoading && totalCount > 0 && (
            <div className="flex flex-col gap-3 border-t border-edge-subtle px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs text-content-tertiary">
                Exibindo {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} de {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateFilter('pagina', String(page - 1), '1')}
                  disabled={page <= 1}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />Anterior
                </Button>
                <span className="min-w-20 text-center text-xs font-bold">Página {page} de {totalPages}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateFilter('pagina', String(page + 1), '1')}
                  disabled={page >= totalPages}
                  className="gap-1"
                >
                  Próxima<ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </section>}
      </div>
    </>
  );
}
