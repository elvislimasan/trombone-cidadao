import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight, BarChart3, CheckCircle2, MapPin, RotateCcw, Wrench, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { summarizeElectricianWork } from '@/lib/electricianStats';
import { electricianVisitTitle } from '@/lib/electricianPole';

const PAGE_SIZE = 500;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Data não informada';

export default function ElectricianStatsPage() {
  const context = useOutletContext();
  const municipalityId = context.municipality?.id;
  const [orders, setOrders] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    if (!municipalityId || !context.userId) { setLoading(false); return undefined; }
    let active = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const all = [];
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const { data, error: failure } = await supabase.rpc('atendimentos_eletricista_iluminacao', {
            p_prefeitura: municipalityId,
          }).range(offset, offset + PAGE_SIZE - 1);
          if (failure) throw failure;
          all.push(...(data || []));
          if (!active) return;
          if ((data || []).length < PAGE_SIZE) break;
        }
        if (active) setOrders(all);
        const rankResult = await supabase.rpc('ranking_eletricistas_iluminacao', { p_prefeitura: municipalityId });
        if (rankResult.error) throw rankResult.error;
        if (active) setRanking(rankResult.data || []);
      } catch (failure) {
        if (active) setError(failure.message || 'Não foi possível carregar as estatísticas.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [municipalityId, context.userId, refreshKey]);

  const stats = useMemo(() => summarizeElectricianWork(orders), [orders]);
  const cards = [
    { label: 'Postes atendidos', value: stats.poles, detail: 'Postes diferentes atendidos', icon: Zap },
    { label: 'Atendimentos concluídos', value: stats.completed, detail: 'Solicitações resolvidas e ordens avulsas', icon: CheckCircle2 },
    { label: 'Neste mês', value: stats.thisMonth, detail: 'Atendimentos concluídos no mês atual', icon: Wrench },
    { label: 'Bairros atendidos', value: stats.neighborhoods, detail: 'Bairros registrados nas ordens', icon: MapPin },
  ];

  return <div className="page-shell-fluid min-w-0 pb-8 pt-5 sm:py-8">
    <Helmet><title>Minhas estatísticas | Painel do eletricista</title><meta name="robots" content="noindex" /></Helmet>
    <header className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-widest text-brand sm:text-xs">Seu trabalho na iluminação pública</p><h1 className="mt-1 font-display text-2xl font-black sm:text-3xl">Estatísticas</h1><p className="mt-1 text-xs text-content-secondary sm:text-sm">Solicitações atendidas, inclusive em ordens ainda em execução.</p></div>
      <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading} aria-label="Atualizar estatísticas" className="shrink-0 px-2 sm:px-3"><RotateCcw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} /></Button>
    </header>
    <Link to="/prefeitura/eletricista/estatisticas/geral" className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-brand/30 bg-brand-subtleBg px-3 text-sm font-bold text-brand">Ver estatísticas gerais de iluminação<ArrowRight className="ml-2 h-4 w-4" /></Link>
    {error && <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-subtleBg p-3 text-sm text-danger">{error}</p>}
    {loading ? <div role="status" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"><span className="sr-only">Carregando estatísticas…</span>{cards.map(({ label }) => <div key={label} className="h-28 animate-pulse rounded-2xl bg-surface-subtle" />)}</div> : <>
      <div className="mt-5 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">{cards.map(({ label, value, detail, icon: Icon }) => <section key={label} className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-3 shadow-sm sm:p-5"><Icon className="h-4 w-4 text-brand sm:h-5 sm:w-5" aria-hidden="true" /><strong className="mt-2 block font-display text-2xl font-black tabular-nums sm:text-3xl">{value.toLocaleString('pt-BR')}</strong><h2 className="mt-1 text-xs font-bold leading-tight sm:text-sm">{label}</h2><p className="mt-1 text-[10px] leading-snug text-content-secondary sm:text-xs">{detail}</p></section>)}</div>
      <section className="mt-5 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5"><h2 className="font-display text-lg font-extrabold">Ranking de eletricistas</h2><p className="mt-1 text-xs text-content-secondary">Serviços executados nas solicitações e ordens avulsas desta prefeitura.</p>{ranking.length ? <ol className="mt-3 divide-y divide-edge-subtle">{ranking.map((person, index) => <li key={person.user_id} className={'flex items-center justify-between gap-3 py-2 text-sm ' + (person.user_id === context.userId ? 'font-bold text-brand' : '')}><span className="min-w-0 truncate">{index + 1}. {person.nome}{person.user_id === context.userId ? ' · Você' : ''}</span><strong className="tabular-nums">{Number(person.servicos).toLocaleString('pt-BR')}</strong></li>)}</ol> : <p className="mt-3 text-sm text-content-secondary">Nenhum serviço concluído.</p>}</section>
      {stats.completed === 0 ? <section className="mt-5 rounded-2xl border border-edge-subtle bg-surface-raised p-5 sm:p-6"><BarChart3 className="h-6 w-6 text-brand" /><h2 className="mt-3 font-display text-lg font-extrabold">Suas estatísticas começam aqui</h2><p className="mt-2 text-sm text-content-secondary">Quando você atender uma solicitação, os dados aparecerão nesta página.</p><Button asChild className="mt-4"><Link to="/prefeitura/eletricista">Ver minhas ordens<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></section> : <div className="mt-5 grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5"><h2 className="font-display text-lg font-extrabold">Tipos de serviço</h2><p className="mt-1 text-xs text-content-secondary">Atendimentos que incluíram cada serviço</p><div className="mt-5 space-y-4">{stats.services.map(({ key, label, count }) => <div key={key}><div className="flex items-center justify-between gap-3 text-xs sm:text-sm"><span className="font-semibold">{label}</span><strong className="tabular-nums">{count} <span className="font-normal text-content-secondary">· {Math.round(count / stats.completed * 100)}%</span></strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-subtle" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={stats.completed} aria-valuenow={count}><div className="h-full rounded-full bg-brand" style={{ width: `${count / stats.completed * 100}%` }} /></div></div>)}</div></section>
        <section className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5"><h2 className="font-display text-lg font-extrabold">Bairros atendidos</h2><p className="mt-1 text-xs text-content-secondary">Locais com mais ordens concluídas</p>{stats.topNeighborhoods.length ? <ol className="mt-4 divide-y divide-edge-subtle">{stats.topNeighborhoods.map(({ name, count }) => <li key={name} className="flex min-w-0 items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0 break-words">{name}</span><strong className="shrink-0 tabular-nums text-brand">{count}</strong></li>)}</ol> : <p className="mt-5 text-sm text-content-secondary">Nenhum bairro informado nas ordens concluídas.</p>}</section>
        <section className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5 lg:col-span-2"><h2 className="font-display text-lg font-extrabold">Atendimentos recentes</h2><div className="mt-3 grid min-w-0 gap-2 lg:grid-cols-2">{stats.recent.map((order) => <Link key={order.id} to={`/prefeitura/eletricista/ordem/${order.order_id || order.id}`} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-edge-subtle px-3 py-3 text-sm transition hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><span className="min-w-0"><strong className="block truncate">{electricianVisitTitle(order.titulo || order.protocolo || 'Atendimento concluído')}</strong><span className="mt-1 block truncate text-xs text-content-secondary">{order.bairro || 'Bairro não informado'} · {dateLabel(order.concluida_em || order.executada_em)}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-brand" /></Link>)}</div></section>
      </div>}
    </>}
  </div>;
}
