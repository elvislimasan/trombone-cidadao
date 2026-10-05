import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { ArrowRight, Clock3, MapPin, Navigation, RotateCcw, Search, X, Zap } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, BottomSheetContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose } from '@/components/ui/drawer';
import ElectricianServicesMap from '@/components/municipality/ElectricianServicesMap';
import ElectricianLightingMap from '@/components/municipality/ElectricianLightingMap';
import { MunicipalEmptyState } from '@/components/municipality/MunicipalPageUi';
import { supabase } from '@/lib/customSupabaseClient';
import { DEMAND_PRIORITIES, DEMAND_STATUSES } from '@/lib/municipalDemand';
import { collectExportRows } from '@/lib/municipalExport';
import { rotuloDoTipoDeProblemaIluminacao } from '@/lib/reportCategoryFields';
import { formatDistance, offerGroup, offerKey, orderStage, sortElectricianOffers } from '@/lib/electricianPanel';
import { compactPoleReference, electricianVisitTitle, poleIdentifierFromTitle } from '@/lib/electricianPole';
import { electricianOfferPoleCode, loadElectricianOfferPole } from '@/lib/electricianOfferPole';

const OFFER_PAGE_SIZE = 60;
const orderFields = 'id,protocolo,titulo,descricao,endereco,bairro,issue_type,prioridade,status,prazo_em,previsto_em,created_at,latitude,longitude,pole_id,report_id,revisao_pendente';
const priorityLabel = (value) => DEMAND_PRIORITIES.find(([id]) => id === value)?.[1] || 'Normal';
const statusLabel = (value) => DEMAND_STATUSES.find(([id]) => id === value)?.[1] || value;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const sortItems = (items, mode) => mode === 'priority' ? items : [...items].sort((a, b) =>
  (Date.parse(a.created_at || 0) - Date.parse(b.created_at || 0)) * (mode === 'recent' ? -1 : 1));

function ServiceCard({ item, mine = false, cover, onSelect }) {
  const urgent = item.prioridade === 'urgente';
  const group = mine ? null : offerGroup(item);
  const problemLabel = item.descricao?.trim()
    || (item.issue_type?.trim() ? rotuloDoTipoDeProblemaIluminacao(item.issue_type) : 'Não informado');
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [cover]);
  return <button type="button" onClick={onSelect} className={'group flex h-full w-full min-w-0 flex-col rounded-xl border bg-surface-raised text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:rounded-2xl ' + (urgent ? 'border-danger/40' : 'border-edge-subtle')}>
    <span className="flex min-w-0 flex-1 flex-col px-3 pb-0 pt-2.5 sm:px-5 sm:pt-4">
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className={'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold leading-none sm:text-xs ' + (urgent ? 'bg-danger-subtleBg text-danger' : 'bg-brand-subtleBg text-brand')}><Zap className="h-3 w-3" />{mine ? statusLabel(item.status) : group === 0 ? 'Urgente' : group === 1 ? 'Ordem de serviço' : 'Solicitação pendente'}</span>
        <span className="min-w-0 truncate text-right text-[9px] font-medium text-content-tertiary sm:text-xs">{item.protocolo || 'Sem protocolo'}</span>
      </span>
      <span className="mt-2 flex min-w-0 items-start gap-2.5 sm:mt-4 sm:gap-3">
        <span className="min-w-0 flex-1"><strong className="block break-words font-display text-[13px] font-extrabold leading-[1.2] text-content-primary sm:text-lg">{mine || item.tipo === 'ordem' ? electricianVisitTitle(item.titulo) : compactPoleReference(item.titulo)}</strong><span className="mt-1 line-clamp-2 break-words text-[11px] leading-[1.3] text-content-secondary sm:mt-1.5 sm:text-sm">{problemLabel}</span></span>
        {cover && !imageFailed && <img src={cover} alt="Foto da ocorrência" loading="lazy" decoding="async" onError={() => setImageFailed(true)} className="h-[60px] w-[60px] shrink-0 rounded-lg bg-surface-subtle object-cover sm:h-24 sm:w-24 sm:rounded-xl" />}
      </span>
      <span className="mt-1.5 flex min-w-0 items-start gap-1.5 text-[10px] leading-[1.25] text-content-secondary sm:mt-4 sm:gap-2 sm:text-sm"><MapPin className="h-3 w-3 shrink-0 text-danger sm:mt-0.5 sm:h-4 sm:w-4" /><span className="line-clamp-2 break-words">{[item.endereco, item.bairro].filter(Boolean).join(' · ') || 'Local a confirmar'}</span></span>
      {(item.prazo_em || item.distancia_m != null || (!mine && item.tipo === 'ordem')) && <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-content-secondary sm:mt-3 sm:gap-x-3 sm:text-xs">
        {item.prazo_em && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />Até {dateLabel(item.prazo_em)}</span>}
        {item.distancia_m != null && <span>{formatDistance(item.distancia_m)} de você</span>}
        {!mine && item.tipo === 'ordem' && <span>Prioridade {priorityLabel(item.prioridade).toLowerCase()}</span>}
      </span>}
      <span className="mt-auto flex items-center justify-between gap-2 border-t border-edge-subtle py-2 text-[11px] font-bold text-danger sm:mt-4 sm:py-4 sm:text-sm"><span>{mine ? 'Abrir ordem' : 'Ver detalhes'}</span><ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" /></span>
    </span>
  </button>;
}

export default function ElectricianPanelPage() {
  const context = useOutletContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') === 'disponiveis' ? 'disponiveis' : 'minhas';
  const selectedKey = params.get('oferta');
  const [offers, setOffers] = useState([]);
  const [mine, setMine] = useState([]);
  const [reportCovers, setReportCovers] = useState({});
  const [poleLabels, setPoleLabels] = useState({});
  const [preview, setPreview] = useState(null);
  const [previewPole, setPreviewPole] = useState(null);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState('priority');
  const [stage, setStage] = useState('fazer');
  const view = params.get('vista') === 'mapa' ? 'map' : 'cards';
  const mapMode = view === 'map';
  const [deferred, setDeferred] = useState([]);
  const [showDeferred, setShowDeferred] = useState(false);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const municipalityId = context.municipality?.id;
  const deferredKey = `eletricista-adiadas:${context.userId}:${municipalityId}`;

  const offerArgs = useCallback((offset = 0) => ({
    p_prefeitura: municipalityId, p_limit: OFFER_PAGE_SIZE, p_offset: offset,
  }), [municipalityId]);

  const loadReportCovers = useCallback(async (items) => {
    const ids = [...new Set(items.map((item) => item.tipo === 'solicitacao' ? item.id : item.report_id).filter(Boolean))];
    if (!ids.length) return;
    const batches = Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) => ids.slice(index * 50, (index + 1) * 50));
    const results = await Promise.allSettled(batches.map((batch) => supabase.from('reports')
      .select('id,featured_image_url,report_media(url,type,is_resolution_proof,created_at)')
      .in('id', batch)));
    const covers = {};
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled' || result.value.error) return;
      batches[index].forEach((id) => { covers[id] = null; });
      for (const report of result.value.data || []) {
        const photos = report.report_media || [];
        covers[report.id] = report.featured_image_url?.trim()
          || photos.find((media) => media.type === 'photo' && !media.is_resolution_proof)?.url?.trim()
          || photos.find((media) => media.type === 'photo')?.url?.trim()
          || null;
      }
    });
    if (Object.keys(covers).length) {
      setReportCovers((current) => ({ ...current, ...covers }));
    }
  }, []);

  const loadPoleLabels = useCallback(async (items) => {
    const ids = [...new Set(items.map((item) => item.pole_id).filter(Boolean))];
    if (!ids.length) return;
    const labels = {};
    for (let start = 0; start < ids.length; start += 100) {
      const { data } = await supabase.from('poles').select('id,identifier,plate').in('id', ids.slice(start, start + 100));
      for (const pole of data || []) labels[pole.id] = pole.identifier || pole.plate || '';
    }
    setPoleLabels((current) => ({ ...current, ...labels }));
  }, []);

  const previewKey = preview ? offerKey(preview) : null;
  const resolvedPreviewPole = previewPole?.key === previewKey ? previewPole : null;
  const previewPoleCode = resolvedPreviewPole?.code || electricianOfferPoleCode(poleLabels[preview?.pole_id]
    || (preview?.pole_id && poleIdentifierFromTitle(preview?.titulo)) || '');
  const previewPoleNearby = Boolean(resolvedPreviewPole?.nearby);
  useEffect(() => {
    let active = true;
    setPreviewPole(null);
    if (preview) loadElectricianOfferPole(supabase, preview, municipalityId)
      .then((pole) => { if (active && pole) setPreviewPole({ ...pole, key: offerKey(preview) }); })
      .catch(() => { /* Keep the opportunity available when the optional pole lookup fails. */ });
    return () => { active = false; };
  }, [preview, municipalityId]);

  const refresh = useCallback(async () => {
    if (!municipalityId) return;
    if (mapMode) { setLoading(false); return; }
    setLoading(true); setError('');
    const [available, assigned] = await Promise.all([
      supabase.rpc('listar_ofertas_eletricista', offerArgs()),
      collectExportRows(() => supabase.from('demandas_municipais').select(orderFields)
        .eq('prefeitura_id', municipalityId).eq('atribuido_a', context.userId)
        .eq('category_id', 'iluminacao').order('updated_at', { ascending: false }).order('id'))
        .then((data) => ({ data }), (error) => ({ error })),
    ]);
    if (available.error || assigned.error) setError((available.error || assigned.error).message);
    if (!available.error) {
      setOffers(available.data || []);
      setHasMore((available.data || []).length === OFFER_PAGE_SIZE);
    }
    if (!assigned.error) setMine(assigned.data || []);
    void loadReportCovers([
      ...(!available.error ? available.data || [] : []),
      ...(!assigned.error ? assigned.data || [] : []),
    ]);
    void loadPoleLabels([
      ...(!available.error ? available.data || [] : []),
      ...(!assigned.error ? assigned.data || [] : []),
    ]);
    setLoading(false);
  }, [municipalityId, context.userId, offerArgs, loadReportCovers, loadPoleLabels, mapMode]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);
  useEffect(() => {
    try { setDeferred(JSON.parse(sessionStorage.getItem(deferredKey) || '[]')); }
    catch { setDeferred([]); }
  }, [deferredKey]);
  useEffect(() => {
    if (!selectedKey) { setPreview(null); return undefined; }
    const [tipo, id] = selectedKey.split(':');
    const existing = offers.find((item) => offerKey(item) === selectedKey);
    if (existing) { setPreview(existing); return undefined; }
    setPreview(null);
    if (!['ordem', 'solicitacao'].includes(tipo) || !id) return undefined;
    let active = true;
    supabase.rpc('listar_ofertas_eletricista', { ...offerArgs(), p_limit: 1, p_tipo: tipo, p_id: id })
      .then(({ data }) => { if (active) setPreview(data?.[0] || null); });
    return () => { active = false; };
  }, [selectedKey, offers, offerArgs]);

  const openOffer = (item) => {
    setActionError('');
    setParams((current) => { const next = new URLSearchParams(current); next.set('oferta', offerKey(item)); return next; });
  };
  const closeOffer = () => {
    setActionError('');
    setParams((current) => { const next = new URLSearchParams(current); next.delete('oferta'); return next; });
  };
  const deferOffer = () => {
    if (!preview) return;
    const next = [...new Set([...deferred, offerKey(preview)])];
    setDeferred(next);
    try { sessionStorage.setItem(deferredKey, JSON.stringify(next)); } catch { /* Optional preference. */ }
    closeOffer();
  };
  const acceptOffer = async () => {
    if (!preview || accepting) return;
    setAccepting(true); setActionError('');
    const { data, error: failure } = await supabase.rpc('aceitar_oferta_eletricista', {
      p_prefeitura: municipalityId, p_tipo: preview.tipo, p_id: preview.id,
    });
    setAccepting(false);
    if (failure) {
      setActionError(failure.code === '23505' ? 'Este serviço já foi assumido. A lista será atualizada.' : failure.message);
      refresh();
      return;
    }
    navigate('/prefeitura/eletricista/ordem/' + data);
  };
  const loadMore = async () => {
    if (moreLoading || !hasMore) return;
    setMoreLoading(true);
    const { data, error: failure } = await supabase.rpc('listar_ofertas_eletricista', offerArgs(offers.length));
    setMoreLoading(false);
    if (failure) { setError(failure.message); return; }
    setOffers((current) => [...current, ...(data || [])]);
    setHasMore((data || []).length === OFFER_PAGE_SIZE);
    void loadReportCovers(data || []);
    void loadPoleLabels(data || []);
  };
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const visibleOffers = useMemo(() => sortItems(sortElectricianOffers(offers).filter((item) =>
    (showDeferred || !deferred.includes(offerKey(item))) &&
    (!normalized || [item.titulo, item.protocolo, item.endereco, item.bairro, poleLabels[item.pole_id]].some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalized)))
  ), sortMode), [offers, deferred, showDeferred, normalized, sortMode, poleLabels]);
  const visibleMine = useMemo(() => sortItems(mine.filter((item) => orderStage(item) === stage &&
    (!normalized || [item.titulo, item.protocolo, item.endereco, item.bairro, poleLabels[item.pole_id]].some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalized)))
  ), sortMode), [mine, stage, normalized, sortMode, poleLabels]);
  const visibleItems = tab === 'disponiveis' ? visibleOffers : visibleMine;
  const stageCounts = useMemo(() => Object.fromEntries(['fazer', 'execucao', 'conferencia', 'historico'].map((key) => [key, mine.filter((item) => orderStage(item) === key).length])), [mine]);
  const openItem = (item) => tab === 'disponiveis'
    ? openOffer(item) : navigate('/prefeitura/eletricista/ordem/' + item.id);
  const groups = tab === 'disponiveis' && view === 'cards'
    ? [['Urgentes', 0], ['Ordens de serviço', 1], ['Solicitações', 2]].map(([label, group]) => ({ label, items: visibleOffers.filter((item) => offerGroup(item) === group) })).filter(({ items }) => items.length)
    : [];

  return <div className={mapMode ? 'flex h-full min-h-0 min-w-0 flex-col overflow-hidden' : 'page-shell-fluid min-w-0 pb-8 pt-3 sm:py-8'}>
    <Helmet><title>Painel do eletricista | Trombone Cidadão</title><meta name="robots" content="noindex" /></Helmet>
    <section className={mapMode ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'min-w-0'} aria-label={mapMode ? 'Mapa de iluminação pública' : tab === 'minhas' ? 'Minhas ordens' : 'Oportunidades disponíveis'}>
      {!mapMode && <>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-danger sm:text-xs">{tab === 'minhas' ? 'Acompanhe sua execução' : 'Escolha o próximo serviço'}</p>
        <h1 className="mt-0.5 font-display text-xl font-extrabold leading-tight sm:mt-1 sm:text-2xl">{tab === 'minhas' ? 'Minhas ordens' : 'Serviços disponíveis'}</h1>
      </div>
      <div className="mt-3 flex min-w-0 items-center gap-1.5 sm:mt-5 sm:gap-3">
        <label className="relative min-w-0 flex-1"><span className="sr-only">Buscar serviço</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-secondary" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Número do poste, protocolo ou endereço" className="h-9 rounded-lg bg-surface-raised pl-9 text-xs sm:h-10 sm:text-sm" /></label>
        <select aria-label="Ordenar serviços" value={sortMode} onChange={(event) => setSortMode(event.target.value)} className="h-9 max-w-28 rounded-lg border border-edge-default bg-surface-raised px-2 text-xs sm:h-10"><option value="priority">Prioridade</option><option value="recent">Mais recentes</option><option value="oldest">Mais antigas</option></select>
        <Button type="button" variant="outline" size="icon" onClick={refresh} disabled={loading} aria-label="Atualizar serviços" title="Atualizar serviços" className="h-9 w-9 shrink-0 rounded-lg bg-surface-raised sm:h-10 sm:w-10"><RotateCcw className={'h-4 w-4 ' + (loading ? 'animate-spin' : '')} /></Button>
      </div>
      {tab === 'disponiveis' && deferred.length > 0 && <label className="mt-3 flex min-h-10 items-center gap-2 text-xs text-content-secondary"><input type="checkbox" checked={showDeferred} onChange={(event) => setShowDeferred(event.target.checked)} className="h-4 w-4 accent-brand" />Mostrar serviços deixados para depois ({deferred.length})</label>}
      {tab === 'minhas' && <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Etapa das minhas ordens">{[['fazer', 'Para fazer'], ['execucao', 'Em execução'], ['conferencia', 'Aguardando'], ['historico', 'Histórico']].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={stage === key} onClick={() => setStage(key)} className={'flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ' + (stage === key ? 'border-brand/30 bg-brand-subtleBg text-brand' : 'border-edge-subtle bg-surface-raised text-content-secondary hover:border-brand/30 hover:text-content-primary')}>{label}<span className={'rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ' + (stage === key ? 'bg-surface-raised text-brand' : 'bg-surface-subtle text-content-secondary')}>{stageCounts[key]}</span></button>)}</div>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-subtleBg p-3 text-sm text-danger">{error}</p>}
    {loading ? <div role="status" className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3"><span className="h-56 animate-pulse rounded-2xl bg-surface-subtle" /><span className="hidden h-56 animate-pulse rounded-2xl bg-surface-subtle md:block" /><span className="hidden h-56 animate-pulse rounded-2xl bg-surface-subtle xl:block" /><span className="sr-only">Carregando serviços…</span></div> : <>
      {visibleItems.length ? tab === 'disponiveis' ? <div className="mt-2.5 space-y-5 sm:mt-5 sm:space-y-7">{groups.map(({ label, items }) => <section key={label} aria-label={label}><div className="mb-1.5 flex items-baseline gap-1.5 sm:mb-3 sm:gap-2"><h3 className="font-display text-sm font-extrabold text-content-primary sm:text-lg">{label}</h3><span className="text-[11px] font-semibold tabular-nums text-content-tertiary sm:text-xs">{items.length}</span></div><div className="grid min-w-0 gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-3 2xl:grid-cols-4">{items.map((item) => <ServiceCard key={`${item.tipo || 'ordem'}:${item.id}`} item={item} cover={reportCovers[item.tipo === 'solicitacao' ? item.id : item.report_id]} onSelect={() => openItem(item)} />)}</div></section>)}</div> : <div className="mt-5 grid min-w-0 gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-3 2xl:grid-cols-4">{visibleItems.map((item) => <ServiceCard key={`${item.tipo || 'ordem'}:${item.id}`} item={item} cover={reportCovers[item.report_id]} mine onSelect={() => openItem(item)} />)}</div> : <div className="mt-5 rounded-2xl border border-edge-subtle bg-surface-raised"><MunicipalEmptyState title={normalized ? 'Nenhum resultado para esta busca' : tab === 'minhas' ? 'Nenhuma ordem nesta etapa' : 'Nenhuma oportunidade nesta lista'} description={normalized ? 'Tente outro protocolo, endereço ou nome de serviço.' : tab === 'minhas' ? 'As ordens que você aceitar ou receber aparecerão aqui.' : deferred.length && !showDeferred ? 'Veja também os serviços deixados para depois.' : 'Novos serviços de iluminação aparecerão aqui.'} /></div>}
      {tab === 'disponiveis' && hasMore && <div className="mt-5 flex justify-center"><Button type="button" variant="outline" onClick={loadMore} disabled={moreLoading}>{moreLoading ? 'Carregando…' : 'Carregar mais serviços'}</Button></div>}
    </>}
    </>}
    {mapMode && <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden"><ElectricianLightingMap municipality={context.municipality} /></div>}
    </section>
    <Drawer open={Boolean(selectedKey)} onOpenChange={(open) => { if (!open && !accepting) closeOffer(); }} dismissible={!accepting}>
      <BottomSheetContent>
        <DrawerHeader className="shrink-0 flex-row items-start justify-between gap-3 border-b border-edge-subtle px-4 pb-3 text-left">
          <div className="min-w-0 text-left">
            <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.17em] text-brand">Oportunidade de serviço</p>
            <DrawerTitle className="break-words font-display text-lg font-extrabold">{preview?.tipo === 'ordem' ? electricianVisitTitle(preview.titulo) : compactPoleReference(preview?.titulo || 'Oportunidade de serviço')}</DrawerTitle>
            <DrawerDescription className="mt-1 break-words text-xs text-content-secondary">{preview?.protocolo || 'Confira os dados antes de aceitar.'}</DrawerDescription>
          </div>
          <DrawerClose asChild><button type="button" disabled={accepting} aria-label="Fechar oportunidade" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-content-secondary hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"><X className="h-5 w-5" /></button></DrawerClose>
        </DrawerHeader>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      {preview ? <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2"><span className="rounded-full bg-brand-subtleBg px-3 py-1.5 text-xs font-bold text-brand">{preview.tipo === 'ordem' ? 'Ordem de serviço' : 'Solicitação de iluminação'}</span><span className={'rounded-full px-3 py-1.5 text-xs font-bold ' + (preview.prioridade === 'urgente' ? 'bg-danger-subtleBg text-danger' : 'bg-surface-subtle text-content-secondary')}>Prioridade {priorityLabel(preview.prioridade).toLowerCase()}</span></div>
        <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4"><h3 className="text-xs font-bold uppercase tracking-widest text-content-tertiary">O que aconteceu</h3>{(preview.issue_type?.trim() || !preview.descricao?.trim()) && <p className="mt-2 font-semibold text-content-primary">{rotuloDoTipoDeProblemaIluminacao(preview.issue_type)}</p>}{preview.descricao?.trim() && <p className="mt-2 whitespace-pre-line break-words leading-6 text-content-secondary">{preview.descricao}</p>}</section>
        <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4"><h3 className="text-xs font-bold uppercase tracking-widest text-content-tertiary">Onde e quando</h3><p className="mt-3 flex items-start gap-2 font-medium"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" /><span>{[preview.endereco, preview.bairro].filter(Boolean).join(' · ') || 'Local a confirmar'}</span></p>{previewPoleCode && <p className="mt-2 break-words text-content-secondary">{previewPoleNearby ? 'Poste próximo' : 'Poste'} <strong className="text-content-primary">{previewPoleCode}</strong></p>}{preview.distancia_m != null && <p className="mt-2 text-content-secondary">Distância aproximada: {formatDistance(preview.distancia_m)}</p>}{preview.prazo_em && <p className="mt-2 flex items-center gap-2 text-content-secondary"><Clock3 className="h-4 w-4 text-brand" />Prazo: {dateLabel(preview.prazo_em)}</p>}</section>
        {preview.latitude != null && preview.longitude != null && <section aria-label="Local da oportunidade no mapa"><h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-content-tertiary">Local no mapa</h3><ElectricianServicesMap compact items={[{ ...preview, markerLabel: previewPoleNearby ? `Poste próximo: ${previewPoleCode}` : previewPoleCode }]} /><Button asChild variant="outline" size="sm" className="mt-3"><a href={`https://www.google.com/maps/dir/?api=1&destination=${preview.latitude},${preview.longitude}`} target="_blank" rel="noopener noreferrer"><Navigation className="mr-2 h-4 w-4" />Ver rota</a></Button></section>}
        <p className="rounded-xl bg-brand-subtleBg p-3 text-xs leading-5 text-brand">Ao aceitar, a ordem passa para suas ordens em execução e você já pode registrar o atendimento.</p>
        {actionError && <p role="alert" className="text-sm text-danger">{actionError}</p>}
      </div> : <p className="text-sm text-content-secondary">Esta oportunidade não está mais disponível. Atualize a lista.</p>}
        </div>
        {preview && <footer className="shrink-0 border-t border-edge-subtle bg-surface-raised px-4 pt-3 pb-[max(1rem,var(--safe-area-bottom,0px))]"><div className="grid w-full gap-2 sm:grid-cols-2"><Button type="button" variant="outline" onClick={deferOffer} disabled={accepting} className="min-h-12">Deixar para depois</Button><Button type="button" onClick={acceptOffer} disabled={accepting} className="min-h-12">{accepting ? 'Aceitando…' : 'Aceitar serviço'}</Button></div></footer>}
      </BottomSheetContent>
    </Drawer>
  </div>;
}
