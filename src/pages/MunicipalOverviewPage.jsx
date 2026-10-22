import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, BarChart3, CheckCircle2, ChevronRight, ClipboardList, Clock3, FileText, List, Loader2, Plus, RotateCcw, Users, Zap } from 'lucide-react';
import Icon, { categoryIconName } from '@/design-system/icons';
import { Button } from '@/components/ui/button';
import { MunicipalPageHeader } from '@/components/municipality/MunicipalPageUi';
import MunicipalReportCreateDialog from '@/components/municipality/MunicipalReportCreateDialog';
import useMunicipalityWorkspace from '@/hooks/useMunicipalityWorkspace';
import { applyMunicipalCategoryFilter } from '@/lib/municipalCategories';
import { supabase } from '@/lib/customSupabaseClient';
import { REPORT_PHASES } from '@/lib/municipalReports';
import { attendanceOverviewScope, loadAttendanceOverview, overviewReportPath } from '@/lib/municipalOverview';
import { municipalContextPath } from '@/lib/municipalAccess';

const number = (value) => Number(value || 0);
const format = (value) => number(value).toLocaleString('pt-BR');

function weekDays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const start = new Date(today);
    start.setDate(start.getDate() + index - 6);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      label: start.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      date: start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      start: start.toISOString(),
      end: end.toISOString(),
    };
  });
}

function Metric({ label, value, caption, icon: Icon, accent }) {
  return <div className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm sm:p-6">
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-semibold text-content-secondary">{label}</p>
      <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' + accent}><Icon className="h-5 w-5" /></span>
    </div>
    <p className="mt-3 font-display text-3xl font-black tabular-nums tracking-tight sm:text-4xl">{value}</p>
    <p className="mt-1 text-xs leading-5 text-content-secondary">{caption}</p>
  </div>;
}

function Distribution({ summary }) {
  const total = number(summary.total);
  const segments = [
    { label: 'Abertas', value: number(summary.abertas), color: 'rgb(var(--status-pending-fg))', to: '/prefeitura/demandas?status=aberta' },
    { label: 'Em atendimento', value: number(summary.em_andamento), color: 'rgb(var(--status-progress-fg))', to: '/prefeitura/demandas?status=all&fila=em_atendimento' },
    { label: 'Em conferência', value: number(summary.aguardando_confirmacao), color: 'rgb(var(--brand))', to: '/prefeitura/demandas?status=aguardando_confirmacao' },
    { label: 'Concluídas', value: number(summary.concluidas), color: 'rgb(var(--success-fg))', to: '/prefeitura/demandas?status=concluida' },
    { label: 'Outras finalizadas', value: Math.max(0, total - number(summary.abertas) - number(summary.em_andamento) - number(summary.aguardando_confirmacao) - number(summary.concluidas)), color: 'rgb(var(--border-strong))', to: '/prefeitura/demandas?status=all' },
  ];
  let position = 0;
  const gradient = total ? `conic-gradient(${segments.map(({ value, color }) => {
    const from = position;
    position += value / total * 100;
    return `${color} ${from}% ${position}%`;
  }).join(', ')})` : 'rgb(var(--surface-sunken))';

  return <section className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm sm:p-6" aria-labelledby="distribution-title">
    <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Carteira de serviços</p><h2 id="distribution-title" className="mt-1 text-lg font-bold">Situação das ordens</h2><p className="mt-1 text-xs text-content-secondary">Distribuição de todas as ordens cadastradas</p></div>
    <div className="mt-6 grid items-center gap-7 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)] xl:grid-cols-[minmax(12rem,0.9fr)_minmax(12rem,1.1fr)]">
      <div className="relative mx-auto aspect-square w-full max-w-[15rem] rounded-full" style={{ background: gradient }} role="img" aria-label={total ? `Distribuição de ${format(total)} ordens por situação` : 'Nenhuma ordem cadastrada'}>
        <div className="absolute inset-[21%] flex flex-col items-center justify-center rounded-full bg-surface-raised text-center">
          <strong className="font-display text-3xl font-black tabular-nums sm:text-4xl">{format(total)}</strong>
          <span className="text-xs text-content-secondary">ordens no total</span>
        </div>
      </div>
      <div className="space-y-1" aria-label="Valores por situação">{segments.map((item) => <Link key={item.label} to={item.to} className="group flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
        <span className="min-w-0 flex-1 text-xs font-medium text-content-secondary group-hover:text-content-primary">{item.label}</span>
        <strong className="text-sm tabular-nums">{format(item.value)}</strong>
        <span className="w-10 text-right text-xs tabular-nums text-content-tertiary">{total ? Math.round(item.value / total * 100) : 0}%</span>
      </Link>)}</div>
    </div>
  </section>;
}

function WeeklyChart({ days, error, loading, onRetry, title = 'Novas ordens por dia', seriesLabel = 'novas ordens', emptyMessage = 'Nenhuma ordem criada neste período.' }) {
  const max = Math.max(1, ...days.map((day) => day.value));
  const weeklyTotal = days.reduce((sum, day) => sum + day.value, 0);
  return <section className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm sm:p-6" aria-labelledby="weekly-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Movimento recente</p><h2 id="weekly-title" className="mt-1 text-lg font-bold">{title}</h2><p className="mt-1 text-xs text-content-secondary">Últimos 7 dias, incluindo hoje</p></div>{!error && <div className="text-right"><strong className="font-display text-2xl font-black tabular-nums">{format(weeklyTotal)}</strong><p className="text-xs text-content-secondary">na semana</p></div>}</div>
    {loading ? <div className="flex h-56 items-center justify-center" role="status" aria-label="Carregando movimento da semana"><Loader2 className="h-5 w-5 animate-spin text-content-secondary" /></div> : error ? <div className="mt-8 text-sm text-content-secondary"><p>Não foi possível carregar o movimento da semana.</p><Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Tentar novamente</Button></div> : <>
      <div className="mt-8 flex h-48 items-end gap-2 border-b border-edge-default pb-2 sm:gap-3" role="img" aria-label={`Gráfico de ${seriesLabel} nos últimos sete dias: ${days.map((day) => `${day.date}: ${day.value}`).join(', ')}`}>
        {days.map((day) => <div key={day.date} className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-1 text-center">
          <span className="text-[11px] font-bold tabular-nums text-content-primary">{day.value}</span>
          <span className="flex min-h-0 flex-1 items-end"><span className="block w-full rounded-t-md bg-brand/75 transition-colors group-hover:bg-brand" style={{ height: `${Math.max(day.value ? 8 : 3, day.value / max * 100)}%` }} /></span>
        </div>)}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-3" aria-hidden="true">{days.map((day) => <div key={day.date} className="min-w-0 flex-1 text-center"><p className="truncate text-[11px] font-semibold capitalize text-content-secondary">{day.label}</p><p className="hidden text-[10px] tabular-nums text-content-tertiary sm:block">{day.date}</p></div>)}</div>
      {!weeklyTotal && <p className="mt-5 text-center text-xs text-content-secondary">{emptyMessage}</p>}
    </>}
  </section>;
}

function Attention({ summary }) {
  const rows = [
    { label: 'Prazo vencido', caption: 'Ordens em aberto fora do prazo', value: number(summary.atrasadas), icon: AlertCircle, color: 'bg-danger', to: '/prefeitura/demandas?status=all&atrasadas=1' },
    { label: 'Sem responsável', caption: 'Aguardando atribuição', value: number(summary.sem_responsavel), icon: Users, color: 'bg-status-pendingFg', to: '/prefeitura/demandas?status=all&fila=sem_responsavel' },
    { label: 'Revisão pendente', caption: 'Manifestação a revisar', value: number(summary.revisao_pendente), icon: ClipboardList, color: 'bg-status-progressFg', to: '/prefeitura/demandas?status=all&fila=revisao' },
    { label: 'Primeira resposta atrasada', caption: 'Aguardando retorno inicial', value: number(summary.primeira_resposta_atrasada), icon: Clock3, color: 'bg-brand', to: '/prefeitura/demandas?status=all&fila=primeira_resposta' },
  ];
  const max = Math.max(1, ...rows.map((row) => row.value));
  return <section className="mt-4 min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm sm:p-6" aria-labelledby="attention-title">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Prioridades da equipe</p><h2 id="attention-title" className="mt-1 text-lg font-bold">Pontos de atenção</h2><p className="mt-1 text-xs text-content-secondary">Uma ordem pode aparecer em mais de um grupo</p></div><Link to="/prefeitura/demandas" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">Abrir ordens <ArrowRight className="h-3.5 w-3.5" /></Link></div>
    <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">{rows.map(({ label, caption, value, icon: Icon, color, to }) => <Link key={label} to={to} className="group min-w-0 rounded-xl border border-edge-subtle bg-surface-subtle p-4 transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <div className="flex items-start justify-between gap-3"><Icon className="h-5 w-5 shrink-0 text-content-secondary" /><strong className="font-display text-2xl tabular-nums">{format(value)}</strong></div>
      <p className="mt-2 text-sm font-bold">{label}</p><p className="mt-0.5 text-xs text-content-secondary">{caption}</p>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-sunken"><div className={'h-full rounded-full ' + color} style={{ width: `${value ? Math.max(5, value / max * 100) : 0}%` }} /></div>
    </Link>)}</div>
  </section>;
}

function AdministrativeOverview() {
  const navigate = useNavigate();
  const context = useMunicipalityWorkspace();
  const municipalityId = context.municipality?.id;
  const [revision, setRevision] = useState(0);
  const [reportCreateOpen, setReportCreateOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [days, setDays] = useState([]);
  const [summaryError, setSummaryError] = useState('');
  const [weekError, setWeekError] = useState(false);
  const [weekLoading, setWeekLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!municipalityId) return undefined;
    let active = true;
    setLoading(true);
    setSummary(null);
    setSummaryError('');
    setWeekError(false);
    setWeekLoading(true);
    const dates = weekDays();
    supabase.rpc('resumo_demandas_municipais', { p_prefeitura: municipalityId }).maybeSingle()
      .then(({ data, error }) => { if (!active) return; if (error) setSummaryError(error.message); else setSummary(data); })
      .catch((error) => { if (active) setSummaryError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    Promise.all(dates.map(async (day) => {
      const { count, error } = await applyMunicipalCategoryFilter(
        supabase.from('demandas_municipais').select('id', { count: 'exact', head: true })
          .eq('prefeitura_id', municipalityId).gte('created_at', day.start).lt('created_at', day.end),
        'category_id', context.enabledCategoryIds);
      if (error) throw error;
      return { ...day, value: count ?? 0 };
    })).then((result) => { if (active) setDays(result); }).catch(() => { if (active) setWeekError(true); }).finally(() => { if (active) setWeekLoading(false); });
    return () => { active = false; };
  }, [municipalityId, context.enabledCategoryIds, revision]);

  if (context.loading) return <div className="flex min-h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!context.municipality) return <div className="page-shell-fluid py-10"><h1 className="text-2xl font-bold">Acesso institucional necessário</h1><p className="mt-2 text-sm text-content-secondary">{context.error || 'Sua conta não está vinculada a uma prefeitura ativa.'}</p></div>;
  const total = number(summary?.total);
  const concluded = number(summary?.concluidas);
  const active = number(summary?.abertas) + number(summary?.em_andamento) + number(summary?.aguardando_confirmacao);
  const completion = total ? Math.round(concluded / total * 100) : 0;

  return <div className="page-shell-fluid min-w-0 pb-10 pt-6 text-content-primary sm:pt-8">
    <Helmet><title>Visão geral | Prefeitura</title><meta name="robots" content="noindex" /></Helmet>
    <MunicipalPageHeader eyebrow="Gestão municipal" title="Visão geral" description="Acompanhe o ritmo dos serviços e identifique onde a equipe precisa agir." action={context.canEdit && <Button onClick={() => setReportCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Criar solicitação de serviço</Button>} />
    {summaryError && <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-danger/20 bg-danger-subtleBg p-4 text-sm text-danger"><span>Não foi possível carregar os indicadores. {summaryError}</span><Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</Button></div>}
    {loading ? <div className="flex min-h-72 items-center justify-center" role="status" aria-label="Carregando visão geral"><Loader2 className="h-6 w-6 animate-spin text-content-secondary" /></div> : summary && <>
      <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Indicadores principais">
        <Metric label="Ordens cadastradas" value={format(total)} caption="Volume acumulado de serviços" icon={ClipboardList} accent="bg-brand-subtleBg text-brand" />
        <Metric label="Em aberto" value={format(active)} caption="Da abertura à conferência interna" icon={Clock3} accent="bg-status-progressBg text-status-progressFg" />
        <Metric label="Concluídas" value={`${completion}%`} caption={`${format(concluded)} ordens finalizadas com execução`} icon={CheckCircle2} accent="bg-success-bg text-success-fg" />
      </section>
      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2"><Distribution summary={summary} /><WeeklyChart days={days} error={weekError} loading={weekLoading} onRetry={() => setRevision((value) => value + 1)} /></div>
      <Attention summary={summary} />
    </>}
    <MunicipalReportCreateDialog open={reportCreateOpen} municipalityId={context.municipality.id} enabledCategoryIds={context.reportCreationCategoryIds} onClose={() => setReportCreateOpen(false)} onReceiptClose={(report) => { if (report?.id) navigate('/prefeitura/broncas?' + new URLSearchParams({ bronca: report.id, ...(report.is_public === false ? { visibilidade: 'internas' } : {}) })); }} />
  </div>;
}


function VisibilityLinks({ context, phase, counts, category }) {
  if (!category && attendanceOverviewScope(context).length > 1) return <p className="text-xs text-content-secondary">Públicas {format(counts.public)} · Internas {format(counts.internal)}</p>;
  return <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs sm:gap-x-6">
    {[['public', 'Públicas'], ['internal', 'Internas']].map(([visibility, label]) => <Link key={visibility} to={overviewReportPath(context, { phase, visibility, category })} className="inline-flex min-h-6 items-center gap-1 font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">{label} <span className="tabular-nums">{format(counts[visibility])}</span><ArrowRight className="h-3 w-3" /></Link>)}
  </div>;
}

const overviewPhases = [
  { icon: FileText, tone: 'bg-brand-subtleBg text-brand' },
  { icon: Clock3, tone: 'bg-status-pendingBg text-status-pendingFg' },
  { icon: CheckCircle2, tone: 'bg-success-bg text-success-fg' },
];
const overviewPanel = 'min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm sm:p-6';

function PhaseIcon({ index, large = false }) {
  const { icon: PhaseSymbol, tone } = overviewPhases[index];
  return <span className={`flex shrink-0 items-center justify-center rounded-full ${tone} ${large ? 'h-14 w-14 sm:h-16 sm:w-16' : 'h-10 w-10'}`}><PhaseSymbol className={large ? 'h-7 w-7' : 'h-5 w-5'} aria-hidden="true" /></span>;
}

function DepartmentWeeklyChart({ days }) {
  const total = days.reduce((sum, day) => sum + day.value, 0);
  const step = Math.max(1, Math.ceil(Math.max(1, ...days.map(day => day.value)) / 2));
  const ceiling = step * 2;
  return <section className={overviewPanel} aria-labelledby="department-week-title" data-testid="overview-week">
    <div className="flex items-start justify-between gap-3">
      <div><h2 id="department-week-title" className="flex items-center gap-3 text-lg font-bold"><BarChart3 className="h-5 w-5 shrink-0 text-brand" />Movimento recente</h2><h3 className="mt-2 text-sm font-semibold">Novas solicitações por dia</h3><p className="mt-1 text-xs text-content-secondary">Últimos 7 dias, incluindo hoje</p></div>
      <div className="shrink-0 text-right"><strong className="font-display text-2xl font-black tabular-nums">{format(total)}</strong><p className="text-xs text-content-secondary">na semana</p></div>
    </div>
    <div className="mt-8" role="img" aria-label={`Gráfico de novas solicitações nos últimos sete dias: ${days.map(day => `${day.date}: ${day.value}`).join(', ')}`}>
      <div className="relative ml-6 h-40 border-b border-l border-edge-default sm:h-44">
        {[ceiling, step, 0].map((value, index) => <div key={value} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-edge-subtle" style={{ bottom: `${100 - index * 50}%` }}><span className="absolute -left-6 -translate-y-1/2 text-[11px] tabular-nums text-content-secondary">{format(value)}</span></div>)}
        <div className="absolute inset-0 flex items-end gap-2 px-2 sm:gap-4">{days.map(day => <div key={day.date} className="relative min-w-0 flex-1 rounded-t bg-brand/75" style={{ height: `max(3px, ${day.value / ceiling * 100}%)` }}><span className="absolute -top-6 inset-x-0 text-center text-[11px] font-bold tabular-nums">{format(day.value)}</span></div>)}</div>
      </div>
      <div className="ml-6 mt-3 flex gap-2 px-2 sm:gap-4" aria-hidden="true">{days.map(day => <div key={day.date} className="min-w-0 flex-1 text-center text-[10px] leading-5 text-content-secondary sm:text-[11px]"><p className="capitalize">{day.label}</p><p className="tabular-nums">{day.date}</p></div>)}</div>
    </div>
    {!total && <p className="mt-3 text-center text-xs text-content-secondary">Nenhuma solicitação registrada neste período.</p>}
  </section>;
}

function DepartmentOverview({ context }) {
  const categoryIds = attendanceOverviewScope(context);
  const scopeKey = JSON.stringify({ user: context.userId, municipality: context.municipality?.id, city: context.municipality?.city_id, channel: context.activeChannelId, categories: categoryIds });
  const [response, setResponse] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!context.municipality || !context.canReadAttendance) return undefined;
    const controller = new AbortController();
    const scope = JSON.parse(scopeKey);
    setResponse(null);
    loadAttendanceOverview(supabase, { municipalityId: scope.municipality, cityId: scope.city, categoryIds: scope.categories, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResponse({ scopeKey, data }); })
      .catch(error => { if (!controller.signal.aborted) setResponse({ scopeKey, error: error.message || 'Não foi possível carregar as solicitações.' }); });
    return () => controller.abort();
  }, [scopeKey, context.municipality, context.canReadAttendance, revision]);
  const current = response?.scopeKey === scopeKey ? response : null;
  const data = current?.data;
  const names = (context.channels || []).filter(channel => context.readableChannelIds?.includes(String(channel.id)) && (!context.activeChannelId || String(channel.id) === String(context.activeChannelId))).map(channel => channel.nome);
  const categoryNames = (context.categories || []).filter(category => categoryIds.includes(category.id)).map(category => category.name);
  const description = [names.join(', '), categoryNames.join(', ')].filter(Boolean).join(' • ') || 'Nenhuma categoria habilitada para atendimento';
  const retry = () => setRevision(value => value + 1);
  const newOrderPath = municipalContextPath('/prefeitura/demandas/nova', context.municipality?.city_id, context.activeChannelId);
  return <div className="page-shell-fluid min-w-0 space-y-6 pb-10 pt-6 sm:pt-8" data-testid="department-overview">
    <Helmet><title>Visão geral | Secretaria</title><meta name="robots" content="noindex" /></Helmet>
    <header className="flex min-w-0 flex-wrap items-end justify-between gap-4 pb-1"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Atendimento da secretaria</p><h1 className="mt-1 font-display text-3xl font-black tracking-tight">Visão geral</h1><p className="mt-2 text-sm leading-6 text-content-secondary">{description}</p></div><Button variant="outline" className="shrink-0 bg-surface-raised" onClick={retry} disabled={!current} aria-label="Atualizar visão geral"><RotateCcw className={'mr-2 h-4 w-4 ' + (!current ? 'animate-spin' : '')} />Atualizar</Button></header>
    {!categoryIds.length ? <p className="rounded-xl border border-edge-subtle bg-surface-raised p-5 text-sm">A secretaria ainda não tem categorias de atendimento habilitadas. O administrador municipal pode conferir essa configuração.</p> : !current ? <div role="status" className="flex min-h-64 items-center justify-center gap-2 text-sm text-content-secondary"><Loader2 className="h-5 w-5 animate-spin" />Carregando solicitações da secretaria…</div> : current.error ? <div role="alert" className="space-y-3 rounded-xl border border-danger/30 bg-danger-subtleBg p-4 text-sm text-danger"><p>Não foi possível carregar os indicadores. {current.error}</p><Button variant="outline" size="sm" onClick={retry}>Tentar novamente</Button></div> : <>
      <section aria-label="Indicadores das solicitações" className="grid min-w-0 gap-3 md:grid-cols-3">{REPORT_PHASES.map(([phase, label], index) => <article key={phase} className={overviewPanel + ' flex items-start gap-4 sm:gap-6'}><PhaseIcon index={index} large /><div className="min-w-0 flex-1"><h2 className="text-sm font-bold">{label}</h2><div className="mt-1 flex items-center justify-between gap-2"><p className="font-display text-4xl font-black tabular-nums">{format(data.phases[phase].total)}</p><ChevronRight className="h-5 w-5 text-content-secondary" aria-hidden="true" /></div><div className="mt-2"><VisibilityLinks context={context} phase={phase} counts={data.phases[phase]} /></div></div></article>)}</section>
      <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-2" data-testid="overview-detail-grid">
        <section aria-label="Solicitações por categoria" className={overviewPanel}><h2 className="flex items-center gap-3 text-lg font-bold"><BarChart3 className="h-5 w-5 shrink-0 text-brand" />Por categoria</h2><p className="ml-8 mt-1 text-xs leading-5 text-content-secondary">{format(data.total)} solicitações no escopo selecionado, incluindo as vinculadas a ordens de serviço.</p><div className="mt-5 space-y-4">{data.categories.map(category => <article key={category.id} className="min-w-0 overflow-hidden rounded-xl border border-edge-subtle"><div className="flex flex-wrap items-center gap-3 bg-surface-subtle px-4 py-3"><Icon name={categoryIconName(category.id)} size={24} className="shrink-0" /><h3 className="min-w-0 flex-1 text-sm font-bold">{context.categories.find(item => item.id === category.id)?.name || category.id}</h3><span className="text-xs text-content-secondary">{format(category.total)} solicitações</span></div><div className="divide-y divide-edge-subtle border-t border-edge-subtle">{REPORT_PHASES.map(([phase, label], index) => <div key={phase} className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto]"><PhaseIcon index={index} /><p className="text-xs text-content-secondary sm:text-sm">{label}</p><strong className="text-sm tabular-nums">{format(category.phases[phase].total)}</strong><div className="col-span-2 col-start-2 sm:col-span-1 sm:col-start-auto sm:ml-4"><VisibilityLinks context={context} phase={phase} counts={category.phases[phase]} category={category.id} /></div></div>)}</div></article>)}</div></section>
        <DepartmentWeeklyChart days={data.days} />
      </div>
      <section className={overviewPanel} aria-labelledby="overview-shortcuts"><h2 id="overview-shortcuts" className="flex items-center gap-3 text-lg font-bold"><Zap className="h-5 w-5 text-brand" />Acesso rápido</h2><p className="ml-8 mt-1 text-xs text-content-secondary">Ações mais utilizadas no dia a dia.</p><div className={'mt-3 grid gap-3 ' + (context.canReceive ? 'md:grid-cols-2' : '')}>{[
        { to: overviewReportPath(context), label: 'Ver solicitações', description: 'Acompanhe e filtre as solicitações da secretaria.', icon: List },
        ...(context.canReceive ? [{ to: newOrderPath, label: 'Nova ordem de serviço', description: context.canDispatch ? 'Crie uma nova ordem de serviço para a secretaria.' : 'Prepare um rascunho de ordem para aprovação do gestor.', icon: Plus }] : []),
      ].map(({ to, label, description: caption, icon: ShortcutIcon }) => <Link key={label} to={to} className="group flex min-w-0 items-center gap-4 rounded-xl border border-brand/15 bg-brand-subtleBg/40 px-4 py-3 transition-colors hover:bg-brand-subtleBg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"><ShortcutIcon className="h-6 w-6" /></span><div className="min-w-0 flex-1"><h3 className="text-sm font-bold text-brand">{label}</h3><p className="mt-1 text-xs leading-5 text-content-secondary">{caption}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-brand" /></Link>)}</div></section>
    </>}
  </div>;
}

export default function MunicipalOverviewPage() {
  const context = useMunicipalityWorkspace();
  return context.isAdministrator ? <AdministrativeOverview /> : <DepartmentOverview context={context} />;
}
