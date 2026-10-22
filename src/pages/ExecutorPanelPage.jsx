import React, { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { MapPin, Navigation, RotateCcw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, BottomSheetContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from '@/components/ui/drawer';
import { offerGroup } from '@/lib/electricianPanel';
import ExecutorWorkMap from '@/components/municipality/ExecutorWorkMap';
import { ServiceCard } from './ElectricianPanelPage';
import { useExecutorServicesPage } from '@/hooks/useElectricianServicesPage';
import { supabase } from '@/lib/customSupabaseClient';
import { municipalContextPath } from '@/lib/municipalAccess';

const stages = [['fazer', 'Para fazer'], ['execucao', 'Em execução'], ['conferencia', 'Aguardando'], ['historico', 'Histórico']];
export default function ExecutorPanelPage() {
  const context = useOutletContext();
  const activity = context.executionActivity;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') === 'disponiveis' ? 'disponiveis' : 'minhas';
  const stage = stages.some(([id]) => id === params.get('etapa')) ? params.get('etapa') : 'fazer';
  const map = params.get('vista') === 'mapa';
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('priority');
  const [deferred, setDeferred] = useState({ scope: '', items: [] });
  const [showDeferred, setShowDeferred] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const scope = `${context.userId}:${context.municipality.id}:${context.activeChannelId}:${activity.id}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  useEffect(() => {
    setBusy(false);
    let items = [];
    try { items = JSON.parse(sessionStorage.getItem('executor-deferred:' + scope) || '[]'); } catch { /* Optional preference. */ }
    setDeferred({ scope, items: Array.isArray(items) ? items : [] }); setPreview(null); setActionError(''); setQuery('');
  }, [scope]);
  const pending = deferred.scope === scope ? deferred.items : [];
  const page = useExecutorServicesPage({ municipalityId: context.municipality.id, userId: context.userId, activity: activity.id,
    channelId: context.activeChannelId, tab: map ? 'minhas' : tab, stage: map ? 'todas' : stage, query, sortMode: sort, deferred: pending, showDeferred, all: map, includeAvailable: map });
  const scoped = path => municipalContextPath(path, context.municipality.city_id, context.activeChannelId);
  const change = updates => setParams(current => { const next = new URLSearchParams(current); for (const [key, value] of Object.entries(updates)) next.set(key, value); return next; });
  const open = item => { if (item.atribuido_a === context.userId) navigate(scoped(activity.path + '/ordem/' + item.id)); else { setPreview({ scope, item }); setActionError(''); } };
  const selected = preview?.scope === scope ? preview.item : null;
  const defer = () => {
    const items = [...new Set([...pending, `${selected.tipo}:${selected.id}`])];
    setDeferred({ scope, items });
    try { sessionStorage.setItem('executor-deferred:' + scope, JSON.stringify(items)); } catch { /* Optional preference. */ }
    setPreview(null);
  };
  const accept = async () => {
    if (busy || !selected) return;
    setBusy(true); setActionError('');
    try {
      const response = await supabase.rpc('aceitar_servico_executor', { p_prefeitura: context.municipality.id, p_especialidade: activity.id, p_canal: context.activeChannelId || null, p_tipo: selected.tipo, p_id: selected.id });
      if (currentScope.current !== scope) return;
      if (response.error) throw response.error;
      navigate(scoped(activity.path + '/ordem/' + response.data));
    } catch (failure) { if (currentScope.current === scope) { setActionError(failure.message); page.refresh(); } }
    finally { if (currentScope.current === scope) setBusy(false); }
  };
  const groups = tab === 'disponiveis' ? [['Urgentes', 0], ['Ordens de serviço', 1], ['Solicitações', 2]].map(([label, group]) => ({ label, items: page.items.filter(item => offerGroup(item) === group) })).filter(group => group.items.length) : [];
  const searchControl = (onMap = false) => <div className={onMap ? 'pointer-events-auto flex max-w-lg gap-2' : 'mt-3 flex min-w-0 items-center gap-1.5 sm:mt-5 sm:gap-3'}><label className="relative min-w-0 flex-1"><span className="sr-only">Buscar serviço</span><Search className={'pointer-events-none absolute h-4 w-4 text-content-secondary ' + (onMap ? 'left-3.5 top-3.5' : 'left-3 top-1/2 -translate-y-1/2')} /><Input aria-label="Buscar serviços" value={query} onChange={event => setQuery(event.target.value)} placeholder="Protocolo, serviço ou endereço" className={onMap ? 'h-11 rounded-full border-edge-default bg-surface-raised/95 pl-10 text-sm shadow-md' : 'h-9 rounded-lg bg-surface-raised pl-9 text-xs sm:h-10 sm:text-sm'} /></label>{!onMap && <select aria-label="Ordenar serviços" value={sort} onChange={event => setSort(event.target.value)} className="h-9 max-w-28 rounded-lg border border-edge-default bg-surface-raised px-2 text-xs sm:h-10"><option value="priority">Prioridade</option><option value="recent">Mais recentes</option><option value="oldest">Mais antigas</option></select>}<Button variant="outline" size="icon" disabled={page.loading} onClick={page.refresh} aria-label="Atualizar serviços" className={onMap ? 'h-11 w-11 shrink-0 rounded-full border-edge-default bg-surface-raised/95 shadow-md' : 'h-9 w-9 shrink-0 rounded-lg bg-surface-raised sm:h-10 sm:w-10'}><RotateCcw className={'h-4 w-4 ' + (page.loading ? 'animate-spin' : '')} /></Button></div>;
  const cards = items => <div className="grid min-w-0 gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-3 2xl:grid-cols-4">{items.map(item => <ServiceCard key={item.tipo + item.id} item={item} mine={tab === 'minhas'} titleForItem={row => row.titulo} activityLabel={activity.label} onSelect={() => open(item)} />)}</div>;
  return <div className={map ? 'flex h-full min-h-0 min-w-0 flex-col overflow-hidden' : 'page-shell-fluid min-w-0 pb-16 pt-3 sm:py-8'} data-testid="executor-panel">
    <Helmet><title>{activity.title}</title><meta name="robots" content="noindex" /></Helmet>
    {!map ? <section className="min-w-0"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-widest text-danger sm:text-xs">{tab === 'minhas' ? 'Acompanhe sua execução' : 'Escolha o próximo serviço'}</p><h1 className="mt-0.5 font-display text-xl font-extrabold leading-tight sm:mt-1 sm:text-2xl">{tab === 'minhas' ? 'Minhas ordens' : 'Serviços disponíveis'}</h1></div>
      {searchControl()}
      {tab === 'disponiveis' && pending.length > 0 && <label className="mt-3 flex min-h-10 items-center gap-2 text-xs text-content-secondary"><input type="checkbox" checked={showDeferred} onChange={event => setShowDeferred(event.target.checked)} className="h-4 w-4 accent-brand" />Mostrar serviços deixados para depois ({pending.length})</label>}
      {tab === 'minhas' && <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Etapa das minhas ordens">{stages.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={stage === key} onClick={() => change({ etapa: key })} className={'flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ' + (stage === key ? 'border-brand/30 bg-brand-subtleBg text-brand' : 'border-edge-subtle bg-surface-raised text-content-secondary hover:border-brand/30 hover:text-content-primary')}>{label}<span className={'rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ' + (stage === key ? 'bg-surface-raised text-brand' : 'bg-surface-subtle text-content-secondary')}>{page.stageCounts[key]}</span></button>)}</div>}
      {page.error && <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-subtleBg p-3 text-sm text-danger">{page.error}</p>}
      {page.loading ? <div role="status" className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3"><span className="h-56 animate-pulse rounded-2xl bg-surface-subtle" /><span className="hidden h-56 animate-pulse rounded-2xl bg-surface-subtle md:block" /><span className="hidden h-56 animate-pulse rounded-2xl bg-surface-subtle xl:block" /><span className="sr-only">Carregando serviços…</span></div> : !page.error && <>{page.items.length ? tab === 'disponiveis' ? <div className="mt-2.5 space-y-5 sm:mt-5 sm:space-y-7">{groups.map(group => <section key={group.label} aria-label={group.label}><div className="mb-1.5 flex items-baseline gap-1.5 sm:mb-3 sm:gap-2"><h3 className="font-display text-sm font-extrabold sm:text-lg">{group.label}</h3><span className="text-[11px] font-semibold tabular-nums text-content-tertiary">{group.items.length}</span></div>{cards(group.items)}</section>)}</div> : <div className="mt-5">{cards(page.items)}</div> : <div className="mt-5 rounded-2xl border border-edge-subtle bg-surface-raised p-5"><h2 className="font-bold">Nenhuma ordem nesta etapa</h2><p className="mt-2 text-sm text-content-secondary">Os serviços da sua secretaria aparecerão aqui.</p></div>}{page.total > 0 && <nav aria-label="Paginação dos serviços" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-edge-subtle pt-4"><p className="text-xs text-content-secondary">{(page.page - 1) * 20 + 1}–{Math.min(page.page * 20, page.total)} de {page.total} serviços</p><div className="flex items-center gap-2"><Button variant="outline" onClick={() => page.setPage(page.page - 1)} disabled={page.page <= 1}>Anterior</Button><span className="text-xs font-semibold">Página {page.page} de {page.pages}</span><Button variant="outline" onClick={() => page.setPage(page.page + 1)} disabled={page.page >= page.pages}>Próxima</Button></div></nav>}</>}
    </section> : <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden"><ExecutorWorkMap items={page.items} activity={activity} cityId={context.municipality.city_id} onSelect={open} fullBleed loading={page.loading} toolbar={<div className="pointer-events-none absolute inset-x-0 top-0 z-[1200] space-y-2 p-3 sm:p-4">{searchControl(true)}{page.error && <p role="alert" className="rounded-xl bg-surface-raised p-3 text-xs text-danger">{page.error}</p>}</div>} /></div>}
    <Drawer open={Boolean(selected)} onOpenChange={value => { if (!value && !busy) setPreview(null); }} dismissible={!busy}><BottomSheetContent><DrawerHeader className="shrink-0 flex-row items-start justify-between gap-3 border-b border-edge-subtle px-4 pb-3 text-left"><div className="min-w-0"><p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.17em] text-brand">Oportunidade de serviço</p><DrawerTitle className="font-display text-lg font-extrabold">{selected?.titulo || 'Serviço indisponível'}</DrawerTitle><DrawerDescription className="mt-1 text-xs">{selected?.protocolo || activity.label}</DrawerDescription></div><DrawerClose asChild><button disabled={busy} aria-label="Fechar oportunidade" className="flex h-10 w-10 items-center justify-center rounded-full"><X className="h-5 w-5" /></button></DrawerClose></DrawerHeader><div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{selected && <div className="space-y-4 text-sm"><section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4"><h3 className="text-xs font-bold uppercase tracking-widest text-content-tertiary">O que aconteceu</h3><p className="mt-2 whitespace-pre-line leading-6 text-content-secondary">{selected.descricao || 'Confira as informações do serviço.'}</p></section><section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4"><h3 className="text-xs font-bold uppercase tracking-widest text-content-tertiary">Onde e quando</h3><p className="mt-3 flex items-start gap-2"><MapPin className="h-4 w-4 shrink-0 text-brand" />{[selected.endereco, selected.bairro].filter(Boolean).join(' · ') || 'Local a confirmar'}</p></section><ExecutorWorkMap items={[selected]} activity={activity} cityId={context.municipality.city_id} compact />{selected.latitude != null && selected.longitude != null && <Button asChild variant="outline" size="sm"><a href={'https://www.google.com/maps/dir/?api=1&destination=' + selected.latitude + ',' + selected.longitude} target="_blank" rel="noreferrer"><Navigation className="mr-2 h-4 w-4" />Ver rota</a></Button>}<p className="rounded-xl bg-brand-subtleBg p-3 text-xs leading-5 text-brand">Ao aceitar, a ordem passa para suas ordens em execução e você já pode registrar o atendimento.</p>{actionError && <p role="alert" className="text-danger">{actionError}</p>}</div>}</div><footer className="shrink-0 border-t border-edge-subtle bg-surface-raised px-4 pt-3 pb-[max(1rem,var(--safe-area-bottom,0px))]"><div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={defer} disabled={busy} className="min-h-12">Deixar para depois</Button><Button onClick={accept} disabled={busy} className="min-h-12">{busy ? 'Aceitando…' : 'Aceitar serviço'}</Button></div></footer></BottomSheetContent></Drawer>
  </div>;
}
