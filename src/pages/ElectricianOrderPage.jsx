import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, Circle, Clock3, MapPin, Navigation, RotateCcw, UploadCloud, X } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppNotice } from '@/lib/appError';
import { confirmApp } from '@/lib/appConfirm';
import { DEMAND_STATUSES, evidenceError } from '@/lib/municipalDemand';
import DemandAttachments from '@/components/municipality/DemandAttachments';
import MunicipalDemandHistory from '@/components/municipality/MunicipalDemandHistory';
import ElectricianServicesMap from '@/components/municipality/ElectricianServicesMap';
import ElectricianPoleFields from '@/components/municipality/ElectricianPoleFields';
import ElectricianCompletionCelebration from '@/components/municipality/ElectricianCompletionCelebration';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useIsDesktopViewport } from '@/hooks/useIsDesktopViewport';
import { compactPoleReference, electricianPoleForm, electricianPolePayload, electricianVisitTitle, poleIdentifierFromTitle } from '@/lib/electricianPole';
import { clearElectricianDraft, electricianDraftHasWork, loadElectricianDraft, saveElectricianDraft } from '@/lib/electricianDraft';
import { canResumeElectricianOrder, distanceBetweenPoints, formatDistance } from '@/lib/electricianPanel';
import { ELECTRICIAN_SYNC_EVENT, loadElectricianOrderSnapshot, queueElectricianJob } from '@/lib/electricianOffline';
import { useElectricianOffline } from '@/contexts/ElectricianOfflineContext';

const panelPath = '/prefeitura/eletricista';
const serviceOptions = [['lamp_replacement', 'Troca de lâmpada'], ['arm_installation', 'Instalação de braço de luz'], ['relay_replacement', 'Troca de relé'], ['other', 'Outro serviço']];
const dateTime = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Não informado';
const statusLabel = (value) => DEMAND_STATUSES.find(([id]) => id === value)?.[1] || value;
const destinationUrl = (order) => {
  const lat = Number(order.latitude);
  const lng = Number(order.longitude);
  if (order.latitude != null && order.longitude != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  return order.endereco ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.endereco)}` : '';
};

function ResponsiveOrderEditor({ isDesktop, open, onOpenChange, busy, draftStatus, draftMessage, onRefresh, footer, children }) {
  const notice = <p className={'rounded-lg px-3 py-2 text-xs leading-5 ' + (draftStatus === 'error' ? 'bg-danger-subtleBg text-danger' : 'bg-surface-subtle text-content-secondary')} role="status">{draftMessage}</p>;
  const refresh = <Button type="button" variant="ghost" size="icon" onClick={onRefresh} disabled={busy} aria-label="Atualizar ordem sem apagar rascunho"><RotateCcw className="h-4 w-4" /></Button>;

  if (isDesktop) return <section className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
    <div className="flex items-center justify-between gap-3"><h2 className="font-display text-xl font-extrabold">Registrar atendimento</h2>{refresh}</div>
    <p className="mt-1 text-sm leading-6 text-content-secondary">Confira o poste e registre o serviço antes de resolver.</p>
    <div className="mt-3">{notice}</div>
    <div className="mt-5">{children}</div>
    <div className="mt-5 border-t border-edge-subtle pt-4">{footer}</div>
  </section>;

  return <div className="order-first min-w-0 lg:order-none">
    <section className="rounded-2xl border border-brand/20 bg-surface-raised p-4 shadow-sm" aria-label="Registro do atendimento">
      <div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-extrabold">Registrar atendimento</h2>{refresh}</div>
      <p className="mt-1 text-sm text-content-secondary">Dados do poste, serviços e fotos em uma etapa.</p>
      <Button type="button" className="mt-4 min-h-12 w-full" onClick={() => onOpenChange(true)}>Abrir registro</Button>
      <div className="mt-3">{notice}</div>
    </section>
    <Drawer open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value); }} direction="bottom" dismissible={!busy}>
      <DrawerContent className="!h-[94dvh] !max-h-[94dvh] rounded-t-3xl border-edge-subtle bg-surface-raised text-content-primary">
        <DrawerHeader className="flex-row items-start justify-between gap-3 border-b border-edge-subtle px-4 pb-3 pt-5 text-left">
          <div className="min-w-0"><DrawerTitle className="font-display text-lg font-extrabold">Registrar atendimento</DrawerTitle><DrawerDescription className="mt-1 text-xs">Confira o poste e registre o serviço antes de resolver.</DrawerDescription></div>
          <DrawerClose asChild><button type="button" disabled={busy} aria-label="Fechar registro" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-content-secondary hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"><X className="h-5 w-5" /></button></DrawerClose>
        </DrawerHeader>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-8"><div className="mb-5">{notice}</div>{children}</div>
        <div className="shrink-0 border-t border-edge-subtle bg-surface-raised px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(0_0_0_/_0.04)]">{footer}</div>
      </DrawerContent>
    </Drawer>
  </div>;
}

export default function ElectricianOrderPage() {
  const context = useOutletContext();
  const { sync } = useElectricianOffline();
  const [snapshotState, setSnapshotState] = useState({});
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [pole, setPole] = useState(null);
  const [poleForm, setPoleForm] = useState(null);
  const [poleSearch, setPoleSearch] = useState('');
  const [changingPole, setChangingPole] = useState(false);
  const [poleResults, setPoleResults] = useState([]);
  const [searchingPole, setSearchingPole] = useState(false);
  const [poleLookupError, setPoleLookupError] = useState('');
  const [events, setEvents] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [linkedReports, setLinkedReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [files, setFiles] = useState([]);
  const [serviceType, setServiceType] = useState('');
  const [serviceTypes, setServiceTypes] = useState([]);
  const [result, setResult] = useState('');
  const [technicalNote, setTechnicalNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [offline, setOffline] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState('loading');
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const isDesktop = useIsDesktopViewport();
  useEffect(() => { if (isDesktop) setEditorOpen(false); }, [isDesktop]);
  const municipalityId = context.municipality?.id;
  const activeReport = linkedReports.find((report) => report.report_id === selectedReportId && report.status !== 'resolved')
    || linkedReports.find((report) => report.status !== 'resolved') || null;
  const workLocation = useMemo(() => activeReport ? {
    ...order, latitude: activeReport.latitude ?? order?.latitude,
    longitude: activeReport.longitude ?? order?.longitude,
    endereco: activeReport.address || order?.endereco,
    bairro: activeReport.neighborhood || order?.bairro,
  } : order, [activeReport, order]);
  const hasOrderPin = workLocation?.latitude != null && workLocation?.longitude != null
    && Number.isFinite(Number(workLocation.latitude)) && Number.isFinite(Number(workLocation.longitude))
    && Math.abs(Number(workLocation.latitude)) <= 90 && Math.abs(Number(workLocation.longitude)) <= 180;
  const draftScope = useMemo(() => ({ userId: context.userId, municipalityId, orderId: id }), [context.userId, municipalityId, id]);
  const scopeKey = `${context.userId}:${municipalityId}:${id}`;
  const scopeKeyRef = useRef(scopeKey);
  const draftGenerationRef = useRef(0);
  const committingRef = useRef(false);
  const draftReadyRef = useRef(false);
  const draftDirtyRef = useRef(false);
  const draftReportIdRef = useRef(null);
  const latestDraftRef = useRef(null);
  latestDraftRef.current = { result, serviceType, serviceTypes, technicalNote, files, order, pole, poleForm, activeReportId: activeReport?.report_id || null };
  draftReadyRef.current = draftReady;
  draftDirtyRef.current = draftDirty;
  const markDraftChanged = () => { draftGenerationRef.current += 1; setDraftDirty(true); };

  const load = useCallback(async ({ preserveDraft = false, preferredReportId = null } = {}) => {
    if (!municipalityId || !id) return;
    setLoading(true); setError('');
    try {
      const snapshot = await loadElectricianOrderSnapshot(supabase, context.userId, municipalityId, id);
      if (scopeKeyRef.current !== scopeKey) return;
      const { order: item, linkedReports: linked, poles } = snapshot;
      const preferred = preferredReportId || draftReportIdRef.current;
      const nextReport = linked.find(report => report.report_id === preferred && report.status !== 'resolved')
        || linked.find(report => report.status !== 'resolved');
      const keepDraft = preserveDraft && (nextReport?.report_id || null) === draftReportIdRef.current;
      draftReportIdRef.current = nextReport?.report_id || null;
      const targetPole = poles.find(row => String(row.id) === String(nextReport?.pole_id || item.pole_id)) || null;
      setSnapshotState(snapshot); setOrder(item); setLinkedReports(linked);
      setSelectedReportId(nextReport?.report_id || null); setOffline(snapshot.offline);
      if (snapshot.offline) setError('Sem conexão. Registre o trabalho normalmente; o envio será automático quando a conexão voltar.');
      if (snapshot.blocked) setError('Há um registro aguardando revisão. Seus dados e fotos continuam guardados na fila acima.');
      if (!keepDraft) {
        setFiles([]); setResult(''); setServiceType(''); setServiceTypes([]); setTechnicalNote('');
        setPole(targetPole); setPoleForm(electricianPoleForm(targetPole, nextReport?.title || item.titulo));
      } else {
        setPole(current => current || targetPole);
        setPoleForm(current => current || electricianPoleForm(targetPole, nextReport?.title || item.titulo));
      }
      if (!snapshot.offline) {
        const [filesResult, eventsResult] = await Promise.all([
          supabase.from('demanda_anexos').select('*').eq('demanda_id', id).order('created_at', { ascending: false }),
          supabase.from('demanda_eventos').select('*,autor:profiles!demanda_eventos_criado_por_fkey(name)').eq('demanda_id', id).order('created_at', { ascending: false }).limit(30),
        ]);
        if (scopeKeyRef.current !== scopeKey) return;
        setAttachments(filesResult.data || []); setEvents(eventsResult.data || []);
      }
      return item;
    } catch (cause) {
      if (scopeKeyRef.current === scopeKey) { setError(cause.message || 'Conecte-se e prepare esta ordem antes de trabalhar sem internet.'); setOrder(null); }
    } finally { if (scopeKeyRef.current === scopeKey) setLoading(false); }
  }, [municipalityId, id, context.userId, scopeKey]);

  useEffect(() => {
    let active = true;
    scopeKeyRef.current = scopeKey;
    setCelebrating(false);
    setEditorOpen(false);
    setOrder(null); setFiles([]); setResult(''); setServiceType(''); setServiceTypes([]); setTechnicalNote('');
    setPole(null); setPoleForm(null); setPoleSearch(''); setChangingPole(false); setPoleResults([]); setPoleLookupError(''); setAttachments([]); setEvents([]); setLinkedReports([]); setSelectedReportId(null); setFormError('');
    setDraftReady(false); setDraftStatus('loading'); setDraftSavedAt(null); setDraftDirty(false); draftReportIdRef.current = null;
    (async () => {
      let draft = null;
      try {
        draft = await loadElectricianDraft(draftScope);
      } catch {
        if (active) setDraftStatus('error');
      }
      if (!active) return;
      if (draft) {
        draftReportIdRef.current = draft.activeReportId;
        setResult(draft.result); setServiceType(draft.serviceType); setServiceTypes(draft.serviceTypes?.length ? draft.serviceTypes : draft.serviceType ? [draft.serviceType] : []); setTechnicalNote(draft.technicalNote);
        setPole(draft.pole); setPoleForm(draft.poleForm);
        setFiles(draft.files); setDraftSavedAt(draft.savedAt);
        setDraftStatus('saved');
      }
      const item = await load({ preserveDraft: Boolean(draft), cachedOrder: draft?.order, cachedPole: draft?.pole });
      if (active) {
        setDraftReady(true);
        if (item && (!draft || draft.activeReportId !== draftReportIdRef.current)) setDraftDirty(true);
      }
    })();
    return () => { active = false; draftGenerationRef.current += 1; };
  }, [draftScope, load, scopeKey]);

  useEffect(() => {
    if (!draftReady || !draftDirty || !order || committingRef.current) return undefined;
    const generation = draftGenerationRef.current;
    setDraftStatus('saving');
    const timer = window.setTimeout(async () => {
      if (generation !== draftGenerationRef.current || scopeKeyRef.current !== scopeKey || committingRef.current) return;
      try {
        const savedAt = await saveElectricianDraft(draftScope, { result, serviceType, serviceTypes, technicalNote, files, order, pole, poleForm, activeReportId: activeReport?.report_id || null });
        if (scopeKeyRef.current === scopeKey && generation === draftGenerationRef.current) {
          setDraftStatus('saved'); setDraftSavedAt(savedAt); setDraftDirty(false);
        }
      } catch {
        if (scopeKeyRef.current === scopeKey) setDraftStatus('error');
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [activeReport?.report_id, draftReady, draftDirty, draftScope, files, order, pole, poleForm, result, serviceType, serviceTypes, scopeKey, technicalNote]);

  useEffect(() => {
    const search = poleSearch.trim();
    if (offline && order) {
      const candidates = (snapshotState.poles || []).filter(row => search ? `${row.identifier || ''} ${row.address || ''}`.toLowerCase().includes(search.toLowerCase()) : (distanceBetweenPoints(workLocation, row) ?? Infinity) <= 300);
      setPoleResults(candidates); setSearchingPole(false); setPoleLookupError(''); return undefined;
    }
    if (!order || (poleForm?.id && !changingPole) || (search.length < 2 && (search || !hasOrderPin))) {
      setPoleResults([]); setSearchingPole(false); setPoleLookupError(''); return undefined;
    }
    let active = true;
    setSearchingPole(true);
    setPoleResults([]);
    setPoleLookupError('');
    const timer = setTimeout(async () => {
      const { data, error: failure } = await supabase.rpc('buscar_postes_ordem_eletricista', { p_prefeitura: municipalityId, p_ordem: id, p_busca: search });
      if (!active) return;
      setSearchingPole(false); setPoleResults(data || []);
      if (!search && !order.pole_id && !poleForm?.id && data?.length) {
        setPole(data[0]); setPoleForm(electricianPoleForm(data[0])); markDraftChanged();
      }
      if (failure) setPoleLookupError(failure.message);
    }, search ? 300 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [changingPole, hasOrderPin, id, municipalityId, offline, order, poleForm?.id, poleSearch, snapshotState.poles, workLocation]);

  useEffect(() => {
    const flush = () => {
      if (scopeKeyRef.current === scopeKey && draftReady && draftDirty && !committingRef.current && latestDraftRef.current?.order) {
        saveElectricianDraft(draftScope, latestDraftRef.current).catch(() => {});
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onVisibility); };
  }, [draftReady, draftDirty, draftScope, scopeKey]);

  useEffect(() => {
    const onOnline = () => { if (offline) load({ preserveDraft: true }); };
    const synced = event => { if (event.detail?.userId === context.userId && event.detail?.resource === `order:${id}`) load({ preserveDraft: true }); };
    window.addEventListener('online', onOnline);
    window.addEventListener(ELECTRICIAN_SYNC_EVENT, synced);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener(ELECTRICIAN_SYNC_EVENT, synced); };
  }, [load, offline, context.userId, id]);

  useEffect(() => () => {
    if (scopeKeyRef.current === scopeKey && draftReadyRef.current && draftDirtyRef.current
      && !committingRef.current && latestDraftRef.current?.order?.id === id) {
      saveElectricianDraft(draftScope, latestDraftRef.current).catch(() => {});
    }
  }, [draftScope, id, scopeKey]);

  const selectFiles = (event) => {
    const chosen = [...(event.target.files || [])];
    event.target.value = '';
    if (files.length + chosen.length > 10) { setFormError('Envie no máximo 10 fotos por atualização.'); return; }
    const failure = chosen.map(evidenceError).find(Boolean);
    if (failure) { setFormError(failure); return; }
    setFiles((current) => [...current, ...chosen.map((file) => ({ id: crypto.randomUUID(), file }))]);
    markDraftChanged();
    setFormError('');
  };

  const saveDraftNow = async () => {
    if (!order || !draftReady) return;
    const generation = draftGenerationRef.current;
    setDraftStatus('saving');
    try {
      const savedAt = await saveElectricianDraft(draftScope, latestDraftRef.current);
      if (scopeKeyRef.current === scopeKey && generation === draftGenerationRef.current) {
        setDraftSavedAt(savedAt); setDraftStatus('saved'); setDraftDirty(false);
      }
    } catch {
      if (scopeKeyRef.current === scopeKey) setDraftStatus('error');
    }
  };

  const save = async (status) => {
    if (!order || saving || committingRef.current || snapshotState.blocked) return;
    let poleData;
    const closeResolvedOrder = status === 'concluida' && linkedReports.length > 0 && !activeReport;
    if (status === 'concluida' && !closeResolvedOrder) {
      if (!serviceTypes.length || serviceTypes.some(type => !serviceOptions.some(([key]) => key === type))) {
        setFormError('Selecione o serviço executado antes de resolver.'); return;
      }
      try { poleData = electricianPolePayload(poleForm); }
      catch (cause) { setFormError(cause.message); return; }
    }
    setSaving(true); setFormError(''); committingRef.current = true;
    const savedScope = scopeKey;
    try {
      const rpc = closeResolvedOrder ? 'concluir_ordem_eletricista'
        : status !== 'concluida' ? 'salvar_demanda_municipal'
        : activeReport ? 'atender_solicitacao_ordem_eletricista' : 'resolver_ordem_eletricista';
      const args = { p_prefeitura: municipalityId, p_versao: order.versao,
        ...(status !== 'concluida' ? { p_id: order.id, p_dados: { status } } : { p_ordem: order.id }),
        ...(status === 'concluida' && !closeResolvedOrder ? {
          p_poste_id: poleForm.id, p_poste_atualizado_em: poleForm.updated_at,
          p_poste: { ...poleData, service_type: serviceTypes[0], service_types: serviceTypes, resultado: result.trim() },
          ...(activeReport ? { p_report: activeReport.report_id } : {}),
        } : {}),
      };
      await queueElectricianJob({ userId: context.userId, municipalityId, rpc, args,
        resource: `order:${order.id}`, previousId: snapshotState.previousId || null,
        label: `${order.protocolo || 'Ordem'} · ${status === 'concluida' ? 'Atendimento' : 'Início da execução'}`,
        files: status === 'concluida' && !closeResolvedOrder ? files : [],
      });
      if (scopeKeyRef.current !== savedScope) return;
      // Clear only after the queue transaction (including every photo) commits.
      if (status === 'concluida') {
        draftGenerationRef.current += 1;
        await clearElectricianDraft(draftScope).catch(() => {});
        setDraftDirty(false); setDraftSavedAt(null); setDraftStatus('empty');
        setFiles([]); setEditorOpen(false);
      }
      showAppNotice({ title: 'Registro guardado no aparelho', description: 'O envio será automático quando houver conexão. Acompanhe a confirmação na fila.' });
      await load({ preserveDraft: status === 'em_andamento' });
      void sync();
    } catch (cause) {
      if (scopeKeyRef.current === savedScope) setFormError(cause.message || 'Não foi possível guardar. Mantenha a tela aberta e tente novamente.');
    } finally { committingRef.current = false; if (scopeKeyRef.current === savedScope) setSaving(false); }
  };

  const canStart = canResumeElectricianOrder(order);
  const resuming = ['aguardando_informacao', 'aguardando_recurso'].includes(order?.status);
  const canCloseResolvedOrder = order?.status === 'em_andamento' && linkedReports.length > 0 && !activeReport;
  const canSubmit = order?.status === 'em_andamento' && (!linkedReports.length || activeReport);
  const route = workLocation ? destinationUrl(workLocation) : '';
  const poleCode = pole ? compactPoleReference(pole.identifier || (order?.pole_id && poleIdentifierFromTitle(order.titulo)) || pole.plate || pole.id) : '';
  const orderMapItems = useMemo(() => workLocation ? [{ ...workLocation, tipo: 'ordem', markerLabel: poleCode }] : [], [workLocation, poleCode]);
  const resolvedReports = linkedReports.filter((report) => report.status === 'resolved').length;
  const activeReportNumber = linkedReports.findIndex((report) => report.report_id === activeReport?.report_id) + 1;
  const otherReports = linkedReports.filter((report) => report.report_id !== activeReport?.report_id);
  const currentDraftHasWork = electricianDraftHasWork({ result, serviceTypes, technicalNote, photos: files, pole, poleForm,
    order: { ...order, titulo: activeReport?.title || order?.titulo } });
  const address = workLocation?.endereco || pole?.address || '';
  const neighborhood = workLocation?.bairro && !address.toLocaleLowerCase('pt-BR').includes(workLocation.bairro.toLocaleLowerCase('pt-BR')) ? workLocation.bairro : '';

  return <div className="page-shell-fluid min-w-0 py-5 pb-8 sm:py-8">
    <Helmet><title>{order?.protocolo || 'Ordem de serviço'} | Painel do eletricista</title><meta name="robots" content="noindex" /></Helmet>
    <ElectricianCompletionCelebration open={celebrating} onClose={() => setCelebrating(false)} />
    <Link to={panelPath} className="inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><ArrowLeft className="h-4 w-4" />Voltar às minhas ordens</Link>
    {loading ? <p role="status" className="mt-6 text-sm text-content-secondary">Carregando ordem…</p> : !order ? <div className="mt-5 rounded-xl border border-edge-subtle bg-surface-raised p-5"><p role="alert" className="text-sm text-danger">{error || 'Ordem indisponível.'}</p><Button type="button" variant="outline" className="mt-3" onClick={() => load()}>Tentar novamente</Button></div> : <>
      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
      <header className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/20 bg-brand-subtleBg px-4 py-4 sm:px-6">
        <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-brand">Ordem de serviço</p><h1 className="mt-1 break-words font-display text-2xl font-extrabold leading-tight sm:text-3xl">{order.protocolo || 'Sem protocolo'}</h1></div>
        <span className="rounded-full border border-brand/20 bg-surface-raised px-3 py-1.5 text-xs font-bold text-brand">{snapshotState.pending ? 'Salvo no aparelho · envio pendente' : statusLabel(order.status)}</span>
      </header>
      <div className="mt-4 grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,1fr)] xl:gap-6">
        <div className="min-w-0 space-y-4">
          <section className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5" aria-labelledby="current-service-heading">
            <p className="text-xs font-bold uppercase tracking-wider text-brand">{activeReport ? `Solicitação ${activeReportNumber} de ${linkedReports.length}` : 'Serviço da ordem'}</p>
            <h2 id="current-service-heading" className="mt-2 break-words font-display text-xl font-extrabold leading-snug">{activeReport ? compactPoleReference(activeReport.title || 'Solicitação de iluminação') : electricianVisitTitle(order.titulo || 'Atendimento de iluminação')}</h2>
            {order.descricao && order.descricao.trim() !== (activeReport?.title || order.titulo || '').trim() && <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-content-secondary">{order.descricao}</p>}
            {order.previsto_em && <p className="mt-3 flex items-center gap-2 text-sm text-content-secondary"><Clock3 className="h-4 w-4 shrink-0 text-brand" />Programado para {dateTime(order.previsto_em)}</p>}
            <div className="mt-5 border-t border-edge-subtle pt-4">
              <h3 className="flex items-center gap-2 text-sm font-bold"><MapPin className="h-4 w-4 text-brand" />Local do serviço</h3>
              <p className="mt-2 break-words text-sm font-medium leading-6">{address || 'Endereço não informado'}{neighborhood && <span className="block text-content-secondary">{neighborhood}</span>}</p>
              {pole && <p className="mt-2 text-sm text-content-secondary">Poste <strong className="text-content-primary">{poleCode}</strong></p>}
              {route && <Button asChild variant="outline" className="mt-4 min-h-11"><a href={route} target="_blank" rel="noopener noreferrer"><Navigation className="mr-2 h-4 w-4" />Abrir rota</a></Button>}
              {hasOrderPin && <details open className="mt-2 min-w-0"><summary className="min-h-11 cursor-pointer rounded-lg px-3 py-2.5 text-sm font-semibold text-brand hover:bg-brand-subtleBg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Ver localização no mapa</summary><div className="mt-2 min-w-0"><ElectricianServicesMap compact showControls={false} items={orderMapItems} /></div></details>}
            </div>
          </section>
          {linkedReports.length > 0 && <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5" aria-label="Andamento das solicitações">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-lg font-extrabold">Andamento da ordem</h2><span className="text-xs font-bold text-brand">{resolvedReports} de {linkedReports.length} resolvidas</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-subtle" role="progressbar" aria-label="Solicitações resolvidas" aria-valuenow={resolvedReports} aria-valuemin={0} aria-valuemax={linkedReports.length}><div className="h-full rounded-full bg-brand" style={{ width: `${resolvedReports / linkedReports.length * 100}%` }} /></div>
            {otherReports.length > 0 && <ul className="mt-4 divide-y divide-edge-subtle">{otherReports.map((report) => <li key={report.report_id} className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">{report.status === 'resolved' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-content-tertiary" />}<div className="min-w-0"><p className="break-words text-sm font-semibold">{compactPoleReference(report.title || 'Solicitação de iluminação')}</p><p className="mt-0.5 text-xs text-content-secondary">{report.status === 'resolved' ? 'Resolvida' : 'Pendente'}</p>{report.status !== 'resolved' && <Button type="button" variant="outline" size="sm" className="mt-2" disabled={saving || snapshotState.blocked} onClick={async () => { if (currentDraftHasWork && !await confirmApp({ title: 'Trocar a solicitação em atendimento?', description: 'As alterações deste registro serão descartadas ao abrir outra solicitação. Salve o atendimento antes de trocar para mantê-las.', confirmLabel: 'Trocar solicitação' })) return; await load({ preferredReportId: report.report_id }); markDraftChanged(); }}>Atender esta solicitação</Button>}</div></li>)}</ul>}
            {canSubmit && <p className="mt-3 text-xs leading-5 text-content-secondary">Cada serviço salvo resolve uma solicitação. A ordem termina após a última.</p>}
          </section>}
          {attachments.length > 0 && <details className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5"><summary className="cursor-pointer font-display text-base font-extrabold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Anexos recebidos · {attachments.length}</summary><div className="mt-4"><DemandAttachments files={attachments} /></div></details>}
        </div>
        {canCloseResolvedOrder ? <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm"><h2 className="font-display text-xl font-extrabold">Concluir ordem</h2><p className="mt-2 text-sm text-content-secondary">Todas as solicitações vinculadas já estão resolvidas. Confirme o encerramento desta ordem.</p>{formError && <p role="alert" className="mt-3 text-sm text-danger">{formError}</p>}<Button type="button" className="mt-4 w-full" disabled={saving || snapshotState.blocked} onClick={() => save('concluida')}>{saving ? 'Concluindo…' : 'Concluir ordem'}</Button></section> : canSubmit ? <ResponsiveOrderEditor isDesktop={isDesktop} open={editorOpen} onOpenChange={setEditorOpen} busy={saving} draftStatus={draftStatus}
          draftMessage={draftStatus === 'saving' ? 'Salvando rascunho neste aparelho…' : draftStatus === 'saved' && draftSavedAt
            ? `Rascunho salvo neste aparelho · ${dateTime(draftSavedAt)}` : draftStatus === 'error'
              ? 'Falha ao guardar o rascunho. Tente salvar novamente.' : 'O rascunho é salvo automaticamente neste aparelho.'}
          onRefresh={() => load({ preserveDraft: true })}
          footer={<div className="space-y-2">
            {formError && <p role="alert" className="rounded-xl bg-danger-subtleBg p-3 text-sm text-danger">{formError}</p>}
            {formError?.includes('cadastro mudou') && pole && <Button type="button" variant="outline" disabled={saving} className="w-full" onClick={async () => { await load(); markDraftChanged(); setFormError(''); }}>Recarregar dados atuais do poste</Button>}
            <Button type="button" className="min-h-12 w-full" onClick={() => save('concluida')} disabled={saving || snapshotState.blocked || !draftReady || !poleForm}><CheckCircle2 className="mr-2 h-4 w-4" />{saving ? 'Salvando…' : activeReport ? 'Resolver esta solicitação' : 'Salvar poste e resolver serviço'}</Button>
            {draftStatus === 'error' && <Button type="button" variant="ghost" className="w-full" onClick={saveDraftNow} disabled={saving || !draftReady}>Tentar salvar rascunho</Button>}
          </div>}>
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-content-primary">1. Poste atendido</h3>{poleForm && <button type="button" onClick={() => { setChangingPole((value) => !value); setPoleSearch(''); }} disabled={saving} className="rounded-lg px-2 py-1 text-xs font-bold text-brand underline focus-visible:ring-2 focus-visible:ring-brand">{changingPole ? 'Cancelar troca' : 'Trocar poste'}</button>}</div>
            {(!poleForm || changingPole) && <div className="rounded-xl border border-edge-default p-3">
              <label className="block text-sm font-semibold">Buscar poste<Input value={poleSearch} onChange={(event) => setPoleSearch(event.target.value)} disabled={saving} className="mt-2" placeholder="Número ou endereço" /></label>
              {!poleSearch.trim() && hasOrderPin && <p className="mt-2 text-xs text-content-secondary">Postes até 300 m do pin no mapa, do mais próximo ao mais distante.</p>}
              {!poleSearch.trim() && !hasOrderPin && <p className="mt-2 text-xs text-content-secondary">Esta ordem não tem pin no mapa. Busque pelo número ou endereço.</p>}
              {searchingPole && <p role="status" className="mt-2 text-xs text-content-secondary">Buscando postes…</p>}
              {offline && <p className="mt-2 text-xs text-content-secondary">Busca nos postes guardados neste aparelho.</p>}
              {poleLookupError && <p role="alert" className="mt-2 text-xs text-danger">{poleLookupError}</p>}
              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto" aria-label={poleSearch.trim() ? 'Postes encontrados' : 'Postes próximos ao pin'}>{poleResults.map((item) => {
                const distance = distanceBetweenPoints(workLocation, item);
                return <button type="button" disabled={saving} key={item.id} onClick={() => { setPole(item); setPoleForm(electricianPoleForm(item)); setPoleSearch(''); setChangingPole(false); markDraftChanged(); }} className="block w-full rounded-lg p-3 text-left text-sm hover:bg-brand-subtleBg focus-visible:ring-2 focus-visible:ring-brand"><strong>Poste {compactPoleReference(item.identifier || item.id)}</strong><span className="mt-1 block text-xs text-content-secondary">{item.address || 'Sem endereço'}{distance != null && ` · ${formatDistance(distance)} do pin`}</span></button>;
              })}</div>
              {!searchingPole && !poleSearch.trim() && hasOrderPin && !poleResults.length && !offline && !poleLookupError && <p className="mt-2 text-xs text-content-secondary">Nenhum poste cadastrado a até 300 m do pin. Tente buscar pelo número ou endereço.</p>}
              {!searchingPole && poleSearch.trim().length >= 2 && !poleResults.length && !offline && !poleLookupError && <p className="mt-2 text-xs text-content-secondary">Nenhum poste encontrado. Tente outro número.</p>}
            </div>}
            {poleForm && <ElectricianPoleFields value={poleForm} disabled={saving} onChange={(next) => { setPoleForm(next); markDraftChanged(); }} />}
            <div className="grid gap-4 border-t border-edge-subtle pt-5">
              <fieldset disabled={saving} className="space-y-2"><legend className="mb-2 text-sm font-bold">2. Serviços executados <span className="text-danger">*</span></legend><div className="grid gap-2 sm:grid-cols-2">{serviceOptions.map(([key, label]) => <label key={key} className={'flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm transition-colors ' + (serviceTypes.includes(key) ? 'border-brand bg-brand-subtleBg font-semibold text-brand' : 'border-edge-subtle hover:border-brand/50')}><input type="checkbox" checked={serviceTypes.includes(key)} onChange={(event) => { const next = event.target.checked ? [...serviceTypes, key] : serviceTypes.filter((type) => type !== key); setServiceTypes(next); setServiceType(next[0] || ''); markDraftChanged(); setFormError(''); }} className="h-4 w-4 shrink-0 accent-brand" />{label}</label>)}</div></fieldset>
              <h3 className="text-sm font-bold">3. Detalhes do serviço</h3>
              <label className="text-sm font-semibold">Resultado do serviço <span className="font-normal text-content-tertiary">(opcional)</span><textarea value={result} onChange={(event) => { setResult(event.target.value); markDraftChanged(); setFormError(''); }} disabled={saving} minLength={10} maxLength={4000} placeholder="Descreva o que foi realizado" className="mt-1.5 min-h-24 w-full rounded-xl border border-edge-default bg-surface-raised px-3 py-2 text-sm font-normal focus:ring-2 focus:ring-brand" /></label>
            </div>
            <details className="rounded-xl border border-edge-subtle p-3"><summary className="cursor-pointer text-sm font-semibold">Fotos (opcional){files.length > 0 && ` · ${files.length}`}</summary><div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2"><label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-edge-default bg-surface-raised px-3 text-sm font-semibold transition hover:border-brand/50 hover:bg-brand-subtleBg focus-within:ring-2 focus-within:ring-brand"><Camera className="h-4 w-4 text-brand" />Tirar foto<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={selectFiles} disabled={saving} /></label><label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-edge-default bg-surface-raised px-3 text-sm font-semibold transition hover:border-brand/50 hover:bg-brand-subtleBg focus-within:ring-2 focus-within:ring-brand"><UploadCloud className="h-4 w-4 text-brand" />Escolher da galeria<input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={selectFiles} disabled={saving} /></label></div>
            {files.length > 0 && <ul className="space-y-2">{files.map((entry) => <li key={entry.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-subtle p-2 text-xs"><span className="min-w-0 break-all">{entry.file.name}</span><button type="button" disabled={saving} className="shrink-0 font-semibold text-brand disabled:opacity-50" onClick={() => { setFiles((current) => current.filter((file) => file.id !== entry.id)); markDraftChanged(); }}>Remover</button></li>)}</ul>}
            <p className="text-xs leading-5 text-content-secondary">As fotos ficam visíveis apenas para a equipe municipal.</p>
            </div></details>
          </div>
        </ResponsiveOrderEditor> : <section className={'min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5 ' + (!isDesktop ? 'order-first' : '')}>
          <div className="flex items-center justify-between gap-3"><h2 className="font-display text-xl font-extrabold">{canStart ? resuming ? 'Retomar execução' : 'Iniciar execução' : 'Acompanhar ordem'}</h2><Button type="button" variant="ghost" size="icon" onClick={() => load({ preserveDraft: true })} disabled={saving} aria-label="Atualizar ordem sem apagar rascunho"><RotateCcw className="h-4 w-4" /></Button></div>
          {canStart ? <div className="mt-4 rounded-xl bg-brand-subtleBg p-4"><p className="text-sm text-content-primary">{resuming ? `Pendência: ${order.motivo_pendencia || statusLabel(order.status)}. Retome quando ela estiver resolvida.` : 'Inicie a ordem para registrar o serviço.'}</p><Button type="button" className="mt-3 w-full" disabled={saving || snapshotState.blocked} onClick={() => save('em_andamento')}>{saving ? 'Salvando…' : resuming ? 'Retomar execução' : 'Iniciar execução'}</Button></div> : <p className="mt-4 text-sm text-content-secondary">{order.revisao_pendente || order.status === 'aguardando_confirmacao' ? 'A gestão precisa revisar e reabrir esta ordem para permitir um novo atendimento.' : `${statusLabel(order.status)}. Acompanhe as atualizações no histórico.`}</p>}
        </section>}
      </div>
      <section className="mt-5 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5"><MunicipalDemandHistory events={events} context={context} variant="timeline" /></section>
    </>}
  </div>;
}
