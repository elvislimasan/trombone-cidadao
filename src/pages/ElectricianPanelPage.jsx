import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { ArrowRight, Clock3, MapPin, Navigation, RotateCcw, Search } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import { MunicipalEmptyState, MunicipalPageHeader } from '@/components/municipality/MunicipalPageUi';
import { supabase } from '@/lib/customSupabaseClient';
import { DEMAND_PRIORITIES, DEMAND_STATUSES } from '@/lib/municipalDemand';
import { rotuloDoTipoDeProblemaIluminacao } from '@/lib/reportCategoryFields';
import { formatDistance, offerGroup, offerKey, orderStage, sortElectricianOffers } from '@/lib/electricianPanel';

const OFFER_PAGE_SIZE = 60;
const orderFields = 'id,protocolo,titulo,descricao,endereco,bairro,issue_type,prioridade,status,prazo_em,previsto_em,created_at,latitude,longitude,pole_id,revisao_pendente';
const priorityLabel = (value) => DEMAND_PRIORITIES.find(([id]) => id === value)?.[1] || 'Normal';
const statusLabel = (value) => DEMAND_STATUSES.find(([id]) => id === value)?.[1] || value;
const dateLabel = (value) => value ? new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

function ServiceCard({ item, mine = false, onSelect }) {
  const urgent = item.prioridade === 'urgente';
  const group = mine ? null : offerGroup(item);
  return <button type="button" onClick={onSelect} className={'group w-full min-w-0 rounded-2xl border bg-surface-raised p-4 text-left shadow-sm transition hover:border-brand/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (urgent ? 'border-danger/50' : 'border-edge-subtle')}>
    <span className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
      <span className={urgent ? 'text-danger' : 'text-brand'}>{mine ? statusLabel(item.status) : group === 0 ? 'Urgente' : group === 1 ? 'Ordem de serviço' : 'Solicitação pendente'}</span>
      <span className="text-content-secondary">{item.protocolo || 'Sem protocolo'}</span>
    </span>
    <strong className="mt-2 block break-words text-base leading-snug">{item.titulo}</strong>
    <span className="mt-2 block text-sm text-content-secondary">{rotuloDoTipoDeProblemaIluminacao(item.issue_type)}</span>
    <span className="mt-3 flex items-start gap-1.5 text-sm text-content-primary"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" /><span className="break-words">{[item.endereco, item.bairro].filter(Boolean).join(' · ') || 'Local a confirmar'}</span></span>
    <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-secondary">
      {item.prazo_em && <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />Até {dateLabel(item.prazo_em)}</span>}
      {item.distancia_m != null && <span>{formatDistance(item.distancia_m)} de você</span>}
      {!mine && item.tipo === 'ordem' && <span>Prioridade {priorityLabel(item.prioridade).toLowerCase()}</span>}
      {mine && item.revisao_pendente && <span className="font-semibold text-danger">Precisa de revisão</span>}
    </span>
    <span className="mt-4 flex items-center justify-end gap-1 text-xs font-bold text-brand">{mine ? 'Abrir serviço' : 'Ver oportunidade'}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></span>
  </button>;
}

export default function ElectricianPanelPage() {
  const context = useOutletContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') === 'minhas' ? 'minhas' : 'disponiveis';
  const selectedKey = params.get('oferta');
  const [offers, setOffers] = useState([]);
  const [mine, setMine] = useState([]);
  const [preview, setPreview] = useState(null);
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('fazer');
  const [deferred, setDeferred] = useState([]);
  const [showDeferred, setShowDeferred] = useState(false);
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
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
    p_latitude: position?.latitude ?? null, p_longitude: position?.longitude ?? null,
  }), [municipalityId, position]);

  const refresh = useCallback(async () => {
    if (!municipalityId) return;
    setLoading(true); setError('');
    const [available, assigned] = await Promise.all([
      supabase.rpc('listar_ofertas_eletricista', offerArgs()),
      supabase.from('demandas_municipais').select(orderFields)
        .eq('prefeitura_id', municipalityId).eq('atribuido_a', context.userId)
        .eq('category_id', 'iluminacao').order('updated_at', { ascending: false }).limit(200),
    ]);
    if (available.error || assigned.error) setError((available.error || assigned.error).message);
    else {
      setOffers(available.data || []);
      setMine(assigned.data || []);
      setHasMore((available.data || []).length === OFFER_PAGE_SIZE);
    }
    setLoading(false);
  }, [municipalityId, context.userId, offerArgs]);

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
  };
  const enableNear = () => {
    if (position) { setPosition(null); return; }
    if (!navigator.geolocation) { setError('Localização indisponível neste aparelho.'); return; }
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setPosition({ latitude: coords.latitude, longitude: coords.longitude }); setLocating(false); },
      () => { setError('Não foi possível acessar sua localização. Confira a permissão do app.'); setLocating(false); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const visibleOffers = useMemo(() => sortElectricianOffers(offers, Boolean(position)).filter((item) =>
    (showDeferred || !deferred.includes(offerKey(item))) &&
    (!normalized || [item.titulo, item.protocolo, item.endereco, item.bairro].some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalized)))
  ), [offers, position, deferred, showDeferred, normalized]);
  const visibleMine = useMemo(() => mine.filter((item) => orderStage(item) === stage &&
    (!normalized || [item.titulo, item.protocolo, item.endereco, item.bairro].some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalized)))
  ), [mine, stage, normalized]);

  return <div className="page-shell-fluid min-w-0 py-5 pb-8 sm:py-8">
    <Helmet><title>Painel do eletricista | Trombone Cidadão</title><meta name="robots" content="noindex" /></Helmet>
    <MunicipalPageHeader eyebrow="Iluminação pública" title="Seu painel de serviços" description="Encontre oportunidades e acompanhe os atendimentos que você assumiu." action={<Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading}><RotateCcw className="mr-2 h-4 w-4" />Atualizar</Button>} />
    <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Serviços do eletricista">
      {[['disponiveis', 'Disponíveis'], ['minhas', 'Minhas ordens']].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams((current) => { const next = new URLSearchParams(current); if (key === 'minhas') next.set('aba', key); else next.delete('aba'); next.delete('oferta'); return next; })} className={'min-h-11 rounded-xl px-4 text-sm font-semibold ' + (tab === key ? 'bg-brand text-content-onBrand' : 'border border-edge-subtle bg-surface-raised text-content-secondary')}>{label}</button>)}
    </div>
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
      <label className="relative min-w-0 flex-1"><span className="sr-only">Buscar serviço</span><Search className="absolute left-3 top-3 h-4 w-4 text-content-secondary" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Protocolo, endereço ou serviço" className="pl-9" /></label>
      {tab === 'disponiveis' && <Button type="button" variant={position ? 'default' : 'outline'} onClick={enableNear} disabled={locating}><Navigation className="mr-2 h-4 w-4" />{locating ? 'Localizando…' : position ? 'Perto de mim ativo' : 'Perto de mim'}</Button>}
    </div>
    {tab === 'disponiveis' && deferred.length > 0 && <label className="mt-3 flex items-center gap-2 text-xs text-content-secondary"><input type="checkbox" checked={showDeferred} onChange={(event) => setShowDeferred(event.target.checked)} className="h-4 w-4 accent-brand" />Mostrar serviços deixados para depois ({deferred.length})</label>}
    {tab === 'minhas' && <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Etapa das minhas ordens">{[['fazer', 'Para fazer'], ['execucao', 'Em execução'], ['conferencia', 'Em conferência'], ['historico', 'Histórico']].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={stage === key} onClick={() => setStage(key)} className={'min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold ' + (stage === key ? 'bg-brand-subtleBg text-brand' : 'bg-surface-raised text-content-secondary')}>{label} <span className="ml-1 tabular-nums">{mine.filter((item) => orderStage(item) === key).length}</span></button>)}</div>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger-subtleBg p-3 text-sm text-danger">{error}</p>}
    {loading ? <p role="status" className="mt-8 text-sm text-content-secondary">Carregando serviços…</p> : <>
      {tab === 'disponiveis' ? visibleOffers.length ? <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visibleOffers.map((item) => <ServiceCard key={offerKey(item)} item={item} onSelect={() => openOffer(item)} />)}</div> : <div className="mt-5 rounded-2xl border border-edge-subtle bg-surface-raised"><MunicipalEmptyState title="Nenhuma oportunidade nesta lista" description={deferred.length && !showDeferred ? 'Veja também os serviços deixados para depois.' : 'Novos serviços de iluminação aparecerão aqui.'} /></div> : visibleMine.length ? <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visibleMine.map((item) => <ServiceCard key={item.id} item={item} mine onSelect={() => navigate('/prefeitura/eletricista/ordem/' + item.id)} />)}</div> : <div className="mt-5 rounded-2xl border border-edge-subtle bg-surface-raised"><MunicipalEmptyState title="Nenhuma ordem nesta etapa" description="As ordens que você aceitar ou receber aparecerão aqui." /></div>}
      {tab === 'disponiveis' && hasMore && <div className="mt-5 flex justify-center"><Button type="button" variant="outline" onClick={loadMore} disabled={moreLoading}>{moreLoading ? 'Carregando…' : 'Carregar mais serviços'}</Button></div>}
    </>}
    <MunicipalDrawer open={Boolean(selectedKey)} onClose={closeOffer} title={preview?.titulo || 'Oportunidade de serviço'} description={preview?.protocolo || 'Confira os dados antes de aceitar.'} variant="electrician" busy={accepting} footer={preview && <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={deferOffer} disabled={accepting}>Agora não</Button><Button type="button" onClick={acceptOffer} disabled={accepting}>{accepting ? 'Aceitando…' : 'Aceitar serviço'}</Button></div>}>
      {preview ? <div className="space-y-4 text-sm">
        <p className="font-semibold text-brand">{preview.tipo === 'ordem' ? 'Ordem de serviço' : 'Solicitação de iluminação'} · Prioridade {priorityLabel(preview.prioridade).toLowerCase()}</p>
        <p>{rotuloDoTipoDeProblemaIluminacao(preview.issue_type)}</p>
        {preview.descricao && <p className="whitespace-pre-line break-words text-content-secondary">{preview.descricao}</p>}
        <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{[preview.endereco, preview.bairro].filter(Boolean).join(' · ') || 'Local a confirmar'}</p>
        {preview.distancia_m != null && <p>Distância aproximada: {formatDistance(preview.distancia_m)}</p>}
        {preview.prazo_em && <p>Prazo: {dateLabel(preview.prazo_em)}</p>}
        <p className="rounded-xl bg-surface-subtle p-3 text-xs text-content-secondary">O serviço será atribuído a você somente após confirmar o aceite.</p>
        {actionError && <p role="alert" className="text-sm text-danger">{actionError}</p>}
      </div> : <p className="text-sm text-content-secondary">Esta oportunidade não está mais disponível. Atualize a lista.</p>}
    </MunicipalDrawer>
  </div>;
}
