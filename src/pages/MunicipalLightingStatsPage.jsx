import { poleCode } from '@/lib/poleDisplay';
import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { CircleMarker, MapContainer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import ThemedTileLayer from '@/components/map/ThemedTileLayer';
import { CalendarDays, CheckCircle2, ChevronDown, ClipboardList, Clock3, Info, LampDesk, Lightbulb, List, Loader2, PieChart, RotateCcw, Wrench, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { normalizeLampType } from '@/lib/lightingCatalog';
import { problemPolesByNeighborhood } from '@/lib/lightingNeighborhoodStats';
import { rotuloDoTipoDeProblemaIluminacao } from '@/lib/reportCategoryFields';
import useMunicipalityWorkspace from '@/hooks/useMunicipalityWorkspace';

const BATCH = 1000;
const completed = (order) => order.status === 'concluida';
const hoursToComplete = (order) => {
  const start = Date.parse(order.created_at);
  const end = Date.parse(order.concluida_em || order.executada_em);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 3600000 : null;
};
const duration = (hours) => hours == null ? 'Sem dados' : hours < 48
  ? `${hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
  : `${(hours / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const periods = [
  ['30', 'Últimos 30 dias'],
  ['90', 'Últimos 90 dias'],
  ['365', 'Últimos 12 meses'],
  ['all', 'Todo o período'],
];
const tones = {
  green: { card: 'border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-surface-raised to-surface-raised dark:border-emerald-900/60 dark:from-emerald-950/30', icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300', accent: 'bg-emerald-500', dot: 'bg-red-500' },
  orange: { card: 'border-orange-100 bg-gradient-to-br from-orange-50/80 via-surface-raised to-surface-raised dark:border-orange-900/60 dark:from-orange-950/30', icon: 'bg-orange-100 text-orange-500 dark:bg-orange-900/50 dark:text-orange-300', accent: 'bg-orange-400', dot: 'bg-orange-500' },
  blue: { card: 'border-blue-100 bg-gradient-to-br from-blue-50/80 via-surface-raised to-surface-raised dark:border-blue-900/60 dark:from-blue-950/30', icon: 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300', accent: 'bg-blue-500', dot: 'bg-blue-500' },
  purple: { card: 'border-violet-100 bg-gradient-to-br from-violet-50/80 via-surface-raised to-surface-raised dark:border-violet-900/60 dark:from-violet-950/30', icon: 'bg-violet-100 text-violet-600 dark:bg-violet-900/50 dark:text-violet-300', accent: 'bg-violet-500', dot: 'bg-violet-500' },
  rose: { card: 'border-rose-100 bg-gradient-to-br from-rose-50/80 via-surface-raised to-surface-raised dark:border-rose-900/60 dark:from-rose-950/30', icon: 'bg-rose-100 text-rose-500 dark:bg-rose-900/50 dark:text-rose-300', accent: 'bg-rose-400', dot: 'bg-rose-500' },
};
const lampColors = [
  { bar: 'bg-red-500', badge: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300', hex: '#ef4444' },
  { bar: 'bg-orange-500', badge: 'bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-300', hex: '#f97316' },
  { bar: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300', hex: '#fbbf24' },
  { bar: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', hex: '#94a3b8' },
  { bar: 'bg-blue-500', badge: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300', hex: '#3b82f6' },
  { bar: 'bg-violet-500', badge: 'bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300', hex: '#8b5cf6' },
  { bar: 'bg-fuchsia-500', badge: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-950/50 dark:text-fuchsia-300', hex: '#d946ef' },
  { bar: 'bg-pink-500', badge: 'bg-pink-50 text-pink-600 dark:bg-pink-950/50 dark:text-pink-300', hex: '#ec4899' },
];

async function loadAll(table, fields, apply) {
  const rows = [];
  for (let start = 0; ; start += BATCH) {
    const { data, error } = await apply(supabase.from(table).select(fields)).range(start, start + BATCH - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < BATCH) return rows;
  }
}

async function loadElectricianStatisticRows(functionName, municipalityId) {
  const rows = [];
  for (let start = 0; ; start += BATCH) {
    const { data, error } = await supabase.rpc(functionName, { p_prefeitura: municipalityId }).range(start, start + BATCH - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < BATCH) return rows;
  }
}

function FocusNeighborhood({ poles }) {
  const map = useMap();
  useEffect(() => {
    const points = poles.map((pole) => [Number(pole.latitude), Number(pole.longitude)]);
    if (points.length === 1) map.setView(points[0], 17);
    else if (points.length > 1) map.fitBounds(points, { padding: [24, 24], maxZoom: 17 });
  }, [map, poles]);
  return null;
}

function SparkBars({ color }) {
  return <span aria-hidden="true" className="flex h-9 items-end justify-end gap-1 opacity-75">{[9, 15, 12, 22, 18, 27, 14].map((height, index) => <i key={index} className={'w-[3px] rounded-full ' + color} style={{ height }} />)}</span>;
}

function MetricCard({ label, value, detail, tone, icon: Icon }) {
  const style = tones[tone];
  return <article className={'grid min-h-28 min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_2rem] items-center gap-3 rounded-xl border p-4 shadow-sm ' + style.card}>
    <span className={'flex h-14 w-14 items-center justify-center rounded-2xl ' + style.icon}><Icon className="h-7 w-7 stroke-[1.8]" /></span>
    <div className="min-w-0"><h2 className="text-[11px] font-bold leading-4 text-content-primary">{label}</h2><strong className="mt-1 block text-2xl font-extrabold leading-none tabular-nums tracking-tight sm:text-[1.7rem]">{value}</strong><p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-content-secondary"><span className={'mt-1 h-1.5 w-1.5 shrink-0 rounded-full ' + style.dot} />{detail}</p></div>
    <SparkBars color={style.accent} />
  </article>;
}

function ServiceMetric({ label, value, detail, tone, icon: Icon, info }) {
  const style = tones[tone];
  return <article className={'relative flex min-h-28 min-w-0 items-center gap-4 overflow-hidden rounded-xl border p-5 shadow-sm ' + style.card}>
    <span className={'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ' + style.icon}><Icon className="h-7 w-7 stroke-[1.8]" /></span>
    <div className="relative z-10 min-w-0"><h2 className="flex items-center gap-1.5 text-xs font-bold leading-4">{label}{info && <span title={info} aria-label={info}><Info className="h-3.5 w-3.5 text-content-tertiary" /></span>}</h2><strong className="mt-2 block text-xl font-extrabold leading-none tabular-nums sm:text-2xl">{value}</strong><p className="mt-1.5 text-[11px] leading-4 text-content-secondary">{detail}</p></div>
    <Icon aria-hidden="true" className={'pointer-events-none absolute -bottom-4 right-3 h-28 w-28 rotate-[-16deg] opacity-[0.08] ' + style.icon.split(' ').find((className) => className.startsWith('text-'))} />
  </article>;
}

function ViewSwitch({ label, value, options, onChange }) {
  return <div role="group" aria-label={label} className="flex shrink-0 rounded-lg border border-edge-subtle bg-surface-subtle/60 p-0.5">{options.map(([key, textLabel, Icon]) => <button key={key} type="button" aria-pressed={value === key} aria-label={textLabel} onClick={() => onChange(key)} className={'flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (value === key ? 'bg-surface-raised text-blue-600 shadow-sm ring-1 ring-inset ring-blue-200 dark:text-blue-300' : 'text-content-secondary hover:text-content-primary')}><Icon className="h-3.5 w-3.5" /><span className={label === 'Visualização das lâmpadas' ? 'sr-only' : 'hidden sm:inline'}>{textLabel}</span></button>)}</div>;
}

export default function MunicipalLightingStatsPage() {
  const context = useMunicipalityWorkspace();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [period, setPeriod] = useState('30');
  const [lampView, setLampView] = useState('list');
  const [serviceView, setServiceView] = useState('table');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('');
  const cityId = context.municipality?.city_id;
  const municipalityId = context.municipality?.id;

  useEffect(() => {
    if (!cityId || !municipalityId) return undefined;
    let active = true;
    setLoading(true); setError(''); setData(null);
    Promise.all([
      loadAll('poles', 'id,identifier,latitude,longitude,lamp_type,lamp_power_w,lighting_status,is_broken,raw_properties', (query) => query.eq('city_id', cityId).neq('lighting_status', 'removido').order('id')),
      context.isElectrician ? loadElectricianStatisticRows('ordens_estatisticas_iluminacao', municipalityId) : loadAll('demandas_municipais', 'id,protocolo,titulo,issue_type,service_type,service_types,status,created_at,executada_em,concluida_em,bairro,pole_id', (query) => query.eq('prefeitura_id', municipalityId).eq('category_id', 'iluminacao').order('id')),
      context.isElectrician ? loadElectricianStatisticRows('solicitacoes_estatisticas_iluminacao', municipalityId) : loadAll('reports', 'id,pole_id,neighborhood,created_at,status', (query) => query.eq('city_id', cityId).eq('category_id', 'iluminacao').order('id')),
    ]).then(([poles, orders, reports]) => { if (active) setData({ poles, orders, reports }); })
      .catch((cause) => { if (active) setError(cause.message || 'Não foi possível carregar os dados.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cityId, municipalityId, context.isElectrician, revision]);

  const stats = useMemo(() => {
    if (!data) return null;
    const cutoff = period === 'all' ? null : Date.now() - Number(period) * 86400000;
    const orders = cutoff == null ? data.orders : data.orders.filter((order) => Date.parse(order.created_at) >= cutoff);
    const lampCounts = new Map();
    let problems = 0;
    for (const pole of data.poles) {
      const name = normalizeLampType(pole.lamp_type) || 'Não informado';
      lampCounts.set(name, (lampCounts.get(name) || 0) + 1);
      if (pole.is_broken || ['apagado', 'manutencao'].includes(pole.lighting_status)) problems++;
    }
    const resolved = orders.filter(completed);
    const durations = resolved.map(hoursToComplete).filter((value) => value != null);
    const forService = (service) => resolved.filter((order) => (order.service_types?.length ? order.service_types : [order.service_type]).includes(service)).map(hoursToComplete).filter((value) => value != null);
    const categories = new Map();
    for (const order of orders) {
      const key = order.issue_type || 'Não informado';
      const row = categories.get(key) || { issue: key, total: 0, complete: 0, hours: [] };
      row.total++;
      if (completed(order)) { row.complete++; const hours = hoursToComplete(order); if (hours != null) row.hours.push(hours); }
      categories.set(key, row);
    }
    return {
      lampCounts: [...lampCounts].sort((a, b) => b[1] - a[1]), problems,
      neighborhoodCounts: problemPolesByNeighborhood(data.poles, data.orders, data.reports, true),
      requests: data.reports.filter((report) => cutoff == null || Date.parse(report.created_at) >= cutoff).length,
      requestsResolved: data.reports.filter((report) => report.status === 'resolved' && (cutoff == null || Date.parse(report.created_at) >= cutoff)).length,
      completed: resolved.length, open: orders.length - resolved.length,
      overall: average(durations), lamp: average(forService('lamp_replacement')),
      arm: average(forService('arm_installation')),
      categories: [...categories.values()].sort((a, b) => b.total - a.total),
      measured: durations.length,
    };
  }, [data, period]);

  if (context.loading) return <div className="page-shell-fluid py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!context.municipality) return <div className="page-shell-fluid py-10">Acesso institucional necessário.</div>;
  if (!context.enabledCategoryIds?.includes('iluminacao')) return <div className="page-shell-fluid py-10">Iluminação indisponível para esta prefeitura.</div>;
  const maxLamp = stats?.lampCounts[0]?.[1] || 1;
  const totalLamps = data?.poles.length || 0;
  const donutSegments = stats?.lampCounts.reduce((result, [, count], index) => {
    const start = result.offset;
    const end = start + (totalLamps ? count / totalLamps * 100 : 0);
    return { offset: end, stops: [...result.stops, `${lampColors[index % lampColors.length].hex} ${start}% ${end}%`] };
  }, { offset: 0, stops: [] }).stops || [];
  const maxService = stats?.categories[0]?.total || 1;
  const maxNeighborhood = stats?.neighborhoodCounts[0]?.count || 1;
  const selectedNeighborhoodRow = stats?.neighborhoodCounts.find((row) => row.name === selectedNeighborhood);
  const selectedIds = new Set(selectedNeighborhoodRow?.poleIds || []);
  const selectedPoles = data?.poles.filter((pole) => selectedIds.has(pole.id) && Number.isFinite(Number(pole.latitude)) && Number.isFinite(Number(pole.longitude))) || [];
  return <div className="page-shell-fluid min-w-0 pb-8 pt-5 text-content-primary" style={{ paddingInline: 'clamp(1rem, 2vw, 2.5rem)' }}>
    <Helmet><title>Estatísticas de iluminação | Prefeitura</title><meta name="robots" content="noindex" /></Helmet>
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-surface-base to-blue-50/30 p-4 shadow-sm dark:border-edge-subtle dark:from-slate-950 dark:via-surface-base dark:to-slate-950 sm:p-5">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-red-600">Iluminação pública</p><h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Estatísticas de manutenção</h1><p className="mt-1 text-xs text-content-secondary sm:text-sm">Solicitações de iluminação, atendimentos e inventário dos postes da cidade.</p>{context.isElectrician && <Link to="/prefeitura/eletricista/estatisticas" className="mt-2 inline-block text-xs font-bold text-brand underline">Ver minha produção e ranking</Link>}</div>
        <div className="flex flex-wrap items-center gap-2.5"><label className="relative flex h-10 items-center rounded-lg border border-edge-subtle bg-surface-raised shadow-sm"><CalendarDays className="pointer-events-none ml-3 h-4 w-4 text-content-secondary" /><span className="sr-only">Período das ordens de serviço</span><select aria-label="Período das ordens de serviço" value={period} onChange={(event) => setPeriod(event.target.value)} className="h-full min-w-40 appearance-none bg-transparent pl-2 pr-9 text-xs font-semibold text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">{periods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-content-secondary" /></label><Button variant="outline" onClick={() => setRevision((value) => value + 1)} disabled={loading} className="h-10 border-edge-subtle bg-surface-raised px-4 text-xs font-semibold shadow-sm"><RotateCcw className={'mr-2 h-4 w-4 ' + (loading ? 'animate-spin' : '')} />Atualizar</Button></div>
      </header>
      {loading && <p role="status" className="mt-8 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Carregando estatísticas…</p>}
      {error && <p role="alert" className="mt-8 rounded-xl border border-danger-subtleFg/20 bg-danger-subtleBg p-4 text-sm text-danger-subtleFg">{error}</p>}
      {stats && !loading && <>
        <section aria-label="Indicadores de manutenção" className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 min-[1360px]:grid-cols-4">
          <MetricCard label="Postes ativos" value={totalLamps.toLocaleString('pt-BR')} detail={`${stats.problems.toLocaleString('pt-BR')} apagados ou com problema`} tone="green" icon={LampDesk} />
          <MetricCard label="Solicitações recebidas" value={stats.requests.toLocaleString('pt-BR')} detail={`${stats.open.toLocaleString('pt-BR')} ordens em aberto`} tone="orange" icon={ClipboardList} />
          <MetricCard label="Solicitações resolvidas" value={stats.requestsResolved.toLocaleString('pt-BR')} detail={`${stats.completed.toLocaleString('pt-BR')} ordens concluídas`} tone="blue" icon={CheckCircle2} />
          <MetricCard label="Tempo médio geral" value={duration(stats.overall)} detail="Da abertura à execução ou conclusão" tone="purple" icon={Clock3} />
        </section>
        <section aria-label="Tempo médio por serviço" className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
          <ServiceMetric label="Tempo médio para troca de lâmpada" value={duration(stats.lamp)} detail="Ordens concluídas registradas como troca de lâmpada" tone="rose" icon={stats.lamp == null ? XCircle : Lightbulb} info="A média considera apenas ordens com serviço executado informado como troca de lâmpada." />
          <ServiceMetric label="Tempo médio para instalar braço de luz" value={duration(stats.arm)} detail="Ordens concluídas registradas como instalação de braço" tone="blue" icon={Wrench} />
        </section>
        <div className="mt-3 grid min-w-0 gap-3 min-[1360px]:grid-cols-2">
          <section className="min-h-[360px] min-w-0 rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5" aria-labelledby="lighting-lamps-title">
            <header className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><Lightbulb className="h-5 w-5" /></span><div className="min-w-0"><h2 id="lighting-lamps-title" className="text-base font-extrabold">Tipos de lâmpada</h2><p className="mt-0.5 text-[11px] text-content-secondary">Quantidade de postes ativos por tecnologia cadastrada.</p></div></div><ViewSwitch label="Visualização das lâmpadas" value={lampView} onChange={setLampView} options={[["list", "Lista", List], ["chart", "Gráfico", PieChart]]} /></header>
            {lampView === 'list' ? <div className="mt-5 space-y-2.5">{stats.lampCounts.map(([name, count], index) => { const color = lampColors[index % lampColors.length]; const share = totalLamps ? count / totalLamps * 100 : 0; return <div key={name} className="grid min-w-0 grid-cols-[minmax(0,6rem)_minmax(0,1fr)_3.2rem] items-center gap-2 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_3.5rem_3.2rem] sm:gap-3"><span className="truncate text-[11px] font-medium" title={name}>{name}</span><div className="h-2.5 min-w-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={'h-full rounded-full ' + color.bar} style={{ width: `${count / maxLamp * 100}%` }} /></div><strong className="text-right text-xs tabular-nums">{count.toLocaleString('pt-BR')}</strong><span className={'hidden rounded-full px-1.5 py-1 text-center text-[10px] font-bold tabular-nums sm:block ' + color.badge}>{share.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span></div>; })}{!stats.lampCounts.length && <p className="py-8 text-center text-sm text-content-secondary">Nenhum poste cadastrado.</p>}</div> : <div className="mt-6 grid items-center gap-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]"><div role="img" aria-label={`Distribuição dos tipos de lâmpada em ${totalLamps} postes`} className="relative mx-auto aspect-square w-full max-w-52 rounded-full" style={{ background: donutSegments.length ? `conic-gradient(${donutSegments.join(', ')})` : '#e2e8f0' }}><div className="absolute inset-[20%] flex flex-col items-center justify-center rounded-full bg-surface-raised text-center shadow-inner"><strong className="text-2xl font-extrabold tabular-nums">{totalLamps.toLocaleString('pt-BR')}</strong><span className="text-[10px] text-content-secondary">postes ativos</span></div></div><ul className="space-y-2">{stats.lampCounts.map(([name, count], index) => <li key={name} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2"><i className={'h-2.5 w-2.5 shrink-0 rounded-full ' + lampColors[index % lampColors.length].bar} /><span className="truncate" title={name}>{name}</span></span><strong className="tabular-nums">{(totalLamps ? count / totalLamps * 100 : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</strong></li>)}</ul></div>}
          </section>
          <section className="min-h-[360px] min-w-0 rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5" aria-labelledby="lighting-services-title">
            <header className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><Wrench className="h-5 w-5" /></span><div className="min-w-0"><h2 id="lighting-services-title" className="text-base font-extrabold">Serviços por problema</h2><p className="mt-0.5 text-[11px] text-content-secondary">Ordens de iluminação registradas pela prefeitura.</p></div></div><ViewSwitch label="Visualização dos serviços" value={serviceView} onChange={setServiceView} options={[["table", "Tabela", List], ["chart", "Gráfico", PieChart]]} /></header>
            {serviceView === 'table' ? <div className="mt-5 min-w-0 overflow-x-auto"><table className="w-full min-w-[30rem] text-left text-xs"><thead className="bg-slate-50 text-[11px] text-content-secondary dark:bg-slate-800/50"><tr><th scope="col" className="w-8 rounded-l-lg px-3 py-2.5">#</th><th scope="col" className="px-3 py-2.5">Problema</th><th scope="col" className="px-3 py-2.5 text-right">Total</th><th scope="col" className="px-3 py-2.5 text-right">Concluídas</th><th scope="col" className="rounded-r-lg px-3 py-2.5 text-right">Tempo médio</th></tr></thead><tbody className="divide-y divide-edge-subtle">{stats.categories.map((row, index) => <tr key={row.issue}><td className="px-3 py-3.5 font-bold tabular-nums">{index + 1}</td><td className="px-3 py-3.5">{row.issue === 'Não informado' ? row.issue : rotuloDoTipoDeProblemaIluminacao(row.issue)}</td><td className="px-3 py-3.5 text-right tabular-nums">{row.total}</td><td className="px-3 py-3.5 text-right tabular-nums">{row.complete}</td><td className="px-3 py-3.5 text-right font-semibold tabular-nums">{duration(average(row.hours))}</td></tr>)}</tbody></table>{!stats.categories.length && <p className="py-8 text-center text-sm text-content-secondary">Nenhuma ordem de iluminação registrada neste período.</p>}</div> : <div className="mt-6 space-y-4">{stats.categories.map((row) => <div key={row.issue}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-semibold" title={row.issue}>{row.issue === 'Não informado' ? row.issue : rotuloDoTipoDeProblemaIluminacao(row.issue)}</span><span className="shrink-0 tabular-nums text-content-secondary">{row.complete}/{row.total} concluídas</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="relative h-full rounded-full bg-blue-200 dark:bg-blue-900" style={{ width: `${row.total / maxService * 100}%` }}><div className="h-full rounded-full bg-blue-500" style={{ width: `${row.total ? row.complete / row.total * 100 : 0}%` }} /></div></div></div>)}{!stats.categories.length && <p className="py-8 text-center text-sm text-content-secondary">Nenhuma ordem de iluminação registrada neste período.</p>}<p className="flex items-center gap-4 text-[10px] text-content-secondary"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />Concluídas</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-blue-200" />Total</span></p></div>}
          </section>
        </div>
        <section className="mt-3 min-w-0 rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5" aria-labelledby="lighting-neighborhoods-title">
          <header className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300"><LampDesk className="h-5 w-5" /></span>
            <div className="min-w-0"><h2 id="lighting-neighborhoods-title" className="text-base font-extrabold">Postes apagados por bairro</h2><p className="mt-0.5 text-[11px] text-content-secondary">Situação atual dos postes apagados, em manutenção ou com relato ativo. Bairros vêm do cadastro do poste, da ordem de serviço ou de broncas vinculadas.</p></div>
          </header>
          {stats.neighborhoodCounts.length ? <div className="mt-5 grid min-w-0 gap-x-8 gap-y-3.5 lg:grid-cols-2" role="list" aria-label="Postes com problema por bairro">
            {stats.neighborhoodCounts.map(({ name, count }) => <div key={name} role="listitem"><button type="button" aria-pressed={selectedNeighborhood === name} onClick={() => setSelectedNeighborhood(name)} className="w-full min-w-0 rounded-lg p-1 text-left hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand"><span className="mb-1 flex items-baseline justify-between gap-3 text-xs"><span className="min-w-0 truncate font-semibold" title={name}>{name}</span><strong className="shrink-0 tabular-nums">{count.toLocaleString('pt-BR')}</strong></span><span className="block h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><span className="block h-full rounded-full bg-red-500" style={{ width: `${count / maxNeighborhood * 100}%` }} /></span></button></div>)}
          </div> : <p className="py-8 text-center text-sm text-content-secondary">Nenhum poste apagado ou com problema cadastrado.</p>}
          {selectedNeighborhoodRow && <div className="mt-5"><h3 className="mb-2 text-sm font-bold">{selectedNeighborhoodRow.count} postes com problema em {selectedNeighborhood}</h3>{selectedPoles.length ? <div className="h-80 overflow-hidden rounded-xl border border-edge-subtle"><MapContainer key={selectedNeighborhood} center={[Number(selectedPoles[0].latitude), Number(selectedPoles[0].longitude)]} zoom={15} scrollWheelZoom={false} className="h-full w-full"><ThemedTileLayer /><FocusNeighborhood poles={selectedPoles} />{selectedPoles.map((pole) => <CircleMarker key={pole.id} center={[Number(pole.latitude), Number(pole.longitude)]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }}><Tooltip>Poste {poleCode(pole.identifier || pole.id)}</Tooltip></CircleMarker>)}</MapContainer></div> : <p className="text-xs text-content-secondary">Os postes deste bairro não têm coordenadas cadastradas.</p>}</div>}
        </section>
        <p className="mt-4 text-[11px] leading-4 text-content-secondary">O período selecionado filtra ordens pela data de abertura. O inventário de postes mostra a situação atual. Os tempos usam ordens concluídas com data de execução ou conclusão; médias por serviço dependem do campo “Serviço executado”.</p>
      </>}
    </div>
  </div>;
}
