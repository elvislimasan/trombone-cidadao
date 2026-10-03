import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, Clock3, MapPin, Navigation, RotateCcw, UploadCloud } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppNotice } from '@/lib/appError';
import { DEMAND_STATUSES, evidenceError } from '@/lib/municipalDemand';
import DemandAttachments from '@/components/municipality/DemandAttachments';
import MunicipalDemandHistory from '@/components/municipality/MunicipalDemandHistory';
import ElectricianServicesMap from '@/components/municipality/ElectricianServicesMap';
import ElectricianPoleFields from '@/components/municipality/ElectricianPoleFields';
import ElectricianCompletionCelebration from '@/components/municipality/ElectricianCompletionCelebration';
import { Input } from '@/components/ui/input';
import { compactPoleReference, electricianPoleForm, electricianPolePayload, fillElectricianPoleIdentifier, poleIdentifierFromTitle } from '@/lib/electricianPole';
import { clearElectricianDraft, loadElectricianDraft, saveElectricianDraft } from '@/lib/electricianDraft';
import { distanceBetweenPoints, formatDistance } from '@/lib/electricianPanel';

const panelPath = '/prefeitura/eletricista';
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

export default function ElectricianOrderPage() {
  const context = useOutletContext();
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [pole, setPole] = useState(null);
  const [poleForm, setPoleForm] = useState(null);
  const [poleSearch, setPoleSearch] = useState('');
  const [poleResults, setPoleResults] = useState([]);
  const [searchingPole, setSearchingPole] = useState(false);
  const [poleLookupError, setPoleLookupError] = useState('');
  const [events, setEvents] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [files, setFiles] = useState([]);
  const [serviceType, setServiceType] = useState('');
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
  const municipalityId = context.municipality?.id;
  const hasOrderPin = order?.latitude != null && order?.longitude != null
    && Number.isFinite(Number(order.latitude)) && Number.isFinite(Number(order.longitude))
    && Math.abs(Number(order.latitude)) <= 90 && Math.abs(Number(order.longitude)) <= 180;
  const draftScope = useMemo(() => ({ userId: context.userId, municipalityId, orderId: id }), [context.userId, municipalityId, id]);
  const scopeKey = `${context.userId}:${municipalityId}:${id}`;
  const scopeKeyRef = useRef(scopeKey);
  const draftGenerationRef = useRef(0);
  const committingRef = useRef(false);
  const draftReadyRef = useRef(false);
  const draftDirtyRef = useRef(false);
  const latestDraftRef = useRef(null);
  latestDraftRef.current = { result, serviceType, technicalNote, files, order, pole, poleForm };
  draftReadyRef.current = draftReady;
  draftDirtyRef.current = draftDirty;
  const markDraftChanged = () => { draftGenerationRef.current += 1; setDraftDirty(true); };

  const load = useCallback(async ({ preserveDraft = false, cachedOrder = null, cachedPole = null } = {}) => {
    if (!municipalityId || !id) return;
    setLoading(true); setError('');
    const detail = await supabase.from('demandas_municipais').select('*')
      .eq('id', id).eq('prefeitura_id', municipalityId)
      .eq('atribuido_a', context.userId).eq('category_id', 'iluminacao').maybeSingle();
    if (scopeKeyRef.current !== scopeKey) return;
    if (detail.error || !detail.data) {
      const networkFailure = detail.error && (navigator.onLine === false
        || /fetch|network|offline|timeout|load failed/i.test(detail.error.message || ''));
      const snapshot = cachedOrder || latestDraftRef.current?.order;
      if (networkFailure && snapshot?.id === id && snapshot?.atribuido_a === context.userId
        && snapshot?.prefeitura_id === municipalityId) {
        setOrder(snapshot); setPole(cachedPole || latestDraftRef.current?.pole || null);
        setOffline(true);
        setError('Sem conexão. Você pode continuar o rascunho neste aparelho; confira a ordem ao voltar à internet.');
        setLoading(false); return snapshot;
      }
      setError(detail.error?.message || 'Esta ordem não está mais atribuída a você.');
      setOrder(null); setOffline(false); setLoading(false); return;
    }
    const item = detail.data;
    const requests = [
      supabase.from('demanda_anexos').select('*').eq('demanda_id', id).order('created_at', { ascending: false }),
      supabase.from('demanda_eventos').select('*,autor:profiles!demanda_eventos_criado_por_fkey(name)').eq('demanda_id', id).order('created_at', { ascending: false }).limit(30),
      item.pole_id ? supabase.from('poles').select('id,identifier,plate,address,latitude,longitude,lamp_type,lamp_power_w,raw_properties,updated_at').eq('id', item.pole_id).maybeSingle() : Promise.resolve({ data: null }),
    ];
    const [filesResult, eventsResult, poleResult] = await Promise.all(requests);
    if (scopeKeyRef.current !== scopeKey) return;
    if (filesResult.error || eventsResult.error || poleResult.error) setError((filesResult.error || eventsResult.error || poleResult.error).message);
    setOrder(item);
    setOffline(false);
    if (!preserveDraft) {
      setResult(item.resultado || '');
      setServiceType(item.service_type || '');
      setTechnicalNote(item.registro_execucao || '');
    }
    setAttachments(filesResult.data || []);
    setEvents(eventsResult.data || []);
    if (!preserveDraft || item.pole_id) setPole(poleResult.data || null);
    if (!preserveDraft) setPoleForm(electricianPoleForm(poleResult.data, item.titulo));
    else setPoleForm((current) => {
      const fresh = electricianPoleForm(poleResult.data, item.titulo);
      if (!current || (item.pole_id && String(current.id) !== String(item.pole_id))) return fresh;
      return fillElectricianPoleIdentifier(current, item.pole_id ? item.titulo : '');
    });
    setLoading(false);
    return item;
  }, [municipalityId, id, context.userId, scopeKey]);

  useEffect(() => {
    let active = true;
    scopeKeyRef.current = scopeKey;
    setCelebrating(false);
    setOrder(null); setFiles([]); setResult(''); setServiceType(''); setTechnicalNote('');
    setPole(null); setPoleForm(null); setPoleSearch(''); setPoleResults([]); setPoleLookupError(''); setAttachments([]); setEvents([]); setFormError('');
    setDraftReady(false); setDraftStatus('loading'); setDraftSavedAt(null); setDraftDirty(false);
    (async () => {
      let draft = null;
      try {
        draft = await loadElectricianDraft(draftScope);
      } catch {
        if (active) setDraftStatus('error');
      }
      if (!active) return;
      if (draft) {
        setResult(draft.result); setServiceType(draft.serviceType); setTechnicalNote(draft.technicalNote);
        setPole(draft.pole); setPoleForm(draft.poleForm);
        setFiles(draft.files); setDraftSavedAt(draft.savedAt);
        setDraftStatus('saved');
      }
      const item = await load({ preserveDraft: Boolean(draft), cachedOrder: draft?.order, cachedPole: draft?.pole });
      if (active) {
        setDraftReady(true);
        if (!draft && item) setDraftDirty(true);
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
        const savedAt = await saveElectricianDraft(draftScope, { result, serviceType, technicalNote, files, order, pole, poleForm });
        if (scopeKeyRef.current === scopeKey && generation === draftGenerationRef.current) {
          setDraftStatus('saved'); setDraftSavedAt(savedAt); setDraftDirty(false);
        }
      } catch {
        if (scopeKeyRef.current === scopeKey) setDraftStatus('error');
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftReady, draftDirty, draftScope, files, order, pole, poleForm, result, serviceType, scopeKey, technicalNote]);

  useEffect(() => {
    const search = poleSearch.trim();
    if (!order || order.pole_id || poleForm?.id || offline || (search.length < 2 && (search || !hasOrderPin))) {
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
      if (failure) setPoleLookupError(failure.message);
    }, search ? 300 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [hasOrderPin, id, municipalityId, offline, order, poleForm?.id, poleSearch]);

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
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [load, offline]);

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
    if (!order || saving || committingRef.current) return;
    if (offline || navigator.onLine === false) {
      setFormError('Sem conexão. O rascunho continua neste aparelho; envie quando voltar à internet.');
      return;
    }
    let poleData;
    if (status === 'concluida') {
      if (!['lamp_replacement', 'arm_installation', 'other'].includes(serviceType)) {
        setFormError('Selecione o serviço executado antes de resolver.'); return;
      }
      try { poleData = electricianPolePayload(poleForm); }
      catch (cause) { setFormError(cause.message); return; }
    }
    setSaving(true); setFormError('');
    committingRef.current = true;
    const uploaded = [];
    let committed = false;
    let localCleanupFailed = false;
    try {
      for (const pending of status === 'concluida' ? files : []) {
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[pending.file.type];
        const path = `${municipalityId}/${context.userId}/${pending.id}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('municipal-demand-files')
          .upload(path, pending.file, { contentType: pending.file.type });
        if (uploadError) throw uploadError;
        uploaded.push({ storage_path: path, nome: pending.file.name, mime_type: pending.file.type,
          tamanho: pending.file.size, tipo: 'conclusao', visibilidade: 'interna' });
      }
      const { error: saveError } = status === 'concluida' ? await supabase.rpc('resolver_ordem_eletricista', {
        p_prefeitura: municipalityId, p_ordem: order.id, p_versao: order.versao,
        p_poste_id: poleForm.id, p_poste_atualizado_em: poleForm.updated_at,
        p_poste: { ...poleData, service_type: serviceType, resultado: result.trim() }, p_anexos: uploaded,
      }) : await supabase.rpc('salvar_demanda_municipal', {
        p_prefeitura: municipalityId, p_id: order.id, p_versao: order.versao,
        p_dados: { status }, p_reports: [], p_anexos: uploaded,
      });
      if (saveError) throw saveError;
      committed = true;
      if (status === 'concluida') {
        draftGenerationRef.current += 1;
        try {
          await clearElectricianDraft(draftScope);
          setDraftDirty(false); setDraftSavedAt(null); setDraftStatus('empty');
        } catch {
          setDraftStatus('error');
          localCleanupFailed = true;
        }
        setFiles([]);
      }
      if (status === 'concluida') setCelebrating(true);
      else showAppNotice({ title: 'Serviço iniciado' });
      await load({ preserveDraft: status === 'em_andamento' });
      if (localCleanupFailed) setError('Execução enviada, mas o rascunho local não pôde ser apagado.');
    } catch (cause) {
      if (!committed && uploaded.length) await supabase.storage.from('municipal-demand-files')
        .remove(uploaded.map((file) => file.storage_path)).catch(() => {});
      setFormError(cause.code === '40001' ? 'O cadastro mudou durante o atendimento. Atualize a ordem e confira os dados atuais do poste antes de resolver.' : cause.message);
    } finally { committingRef.current = false; setSaving(false); }
  };

  const canSubmit = order && ['aberta', 'triagem', 'programada', 'em_andamento'].includes(order.status);
  const route = order ? destinationUrl(order) : '';
  const poleCode = pole ? compactPoleReference(pole.identifier || (order?.pole_id && poleIdentifierFromTitle(order.titulo)) || pole.plate || pole.id) : '';
  const orderMapItems = useMemo(() => order ? [{ ...order, tipo: 'ordem' }] : [], [order]);

  return <div className="page-shell-fluid min-w-0 py-5 pb-8 sm:py-8">
    <Helmet><title>{order?.protocolo || 'Ordem de serviço'} | Painel do eletricista</title><meta name="robots" content="noindex" /></Helmet>
    <ElectricianCompletionCelebration open={celebrating} onClose={() => setCelebrating(false)} />
    <Link to={panelPath} className="inline-flex min-h-10 items-center gap-2 rounded-lg text-sm font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><ArrowLeft className="h-4 w-4" />Voltar às minhas ordens</Link>
    {loading ? <p role="status" className="mt-6 text-sm text-content-secondary">Carregando ordem…</p> : !order ? <div className="mt-5 rounded-xl border border-edge-subtle bg-surface-raised p-5"><p role="alert" className="text-sm text-danger">{error || 'Ordem indisponível.'}</p><Button type="button" variant="outline" className="mt-3" onClick={() => load()}>Tentar novamente</Button></div> : <>
      <h1 className="sr-only">Ordem {order.protocolo || 'sem protocolo'}: {compactPoleReference(order.titulo)}</h1>
      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
      <div className="mt-5 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,36rem)] xl:gap-5">
        <div className="grid min-w-0 gap-4 2xl:grid-cols-2 2xl:items-start">
          <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-brand">01 · Chegada</p><h2 className="mt-2 flex items-center gap-2 font-display text-lg font-extrabold"><MapPin className="h-5 w-5 text-brand" />Local do serviço</h2>
            <p className="mt-4 break-words text-base font-semibold leading-6">{order.endereco || pole?.address || 'Endereço não informado'}{order.bairro && ` · ${order.bairro}`}</p>
            {pole && <p className="mt-2 rounded-xl bg-surface-subtle px-3 py-2 text-sm text-content-secondary">Poste <strong className="text-content-primary">{poleCode}</strong>{pole.plate && compactPoleReference(pole.plate) !== poleCode && ` · Plaqueta ${pole.plate}`}</p>}
            {route ? <Button asChild className="mt-4 w-full sm:w-auto"><a href={route} target="_blank" rel="noopener noreferrer"><Navigation className="mr-2 h-4 w-4" />Abrir rota no mapa</a></Button> : <p className="mt-3 text-xs text-content-secondary">Sem coordenadas ou endereço para abrir uma rota.</p>}
            {order.latitude != null && order.longitude != null && <div className="mt-4"><ElectricianServicesMap compact showControls={false} items={orderMapItems} /></div>}
          </section>
          <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-brand">02 · Tarefa</p><h2 className="mt-2 font-display text-lg font-extrabold">O que precisa ser feito</h2>
            <p className="mt-4 whitespace-pre-line break-words text-sm leading-6 text-content-secondary">{order.descricao || 'Não há descrição adicional para esta ordem.'}</p>
            {order.previsto_em && <div className="mt-5 rounded-xl bg-surface-subtle px-3 py-2.5 text-xs text-content-secondary"><Clock3 className="mr-1.5 inline h-4 w-4 text-brand" />Programado para {dateTime(order.previsto_em)}</div>}
          </section>
          {attachments.length > 0 && <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5 2xl:col-span-2"><h2 className="mb-3 font-display text-lg font-extrabold">Anexos do atendimento</h2><DemandAttachments files={attachments} /></section>}
        </div>
        <section className="min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3"><h2 className="font-display text-xl font-extrabold">{canSubmit ? 'Poste após o serviço' : 'Serviço finalizado'}</h2><Button type="button" variant="ghost" size="icon" onClick={() => load({ preserveDraft: true })} disabled={saving} aria-label="Atualizar ordem sem apagar rascunho"><RotateCcw className="h-4 w-4" /></Button></div>
          {canSubmit && <p className="mt-2 text-sm leading-6 text-content-secondary">Confira a lâmpada e os dados que mudaram na reforma. Ao resolver, o cadastro da prefeitura e as solicitações vinculadas serão atualizados.</p>}
          <div className="mt-3 rounded-xl border border-edge-subtle bg-surface-subtle px-3 py-2.5 text-xs leading-5 text-content-secondary" role="status">
            {draftStatus === 'saving' ? 'Salvando rascunho neste aparelho…' : draftStatus === 'saved' && draftSavedAt
              ? `Rascunho salvo neste aparelho em ${dateTime(draftSavedAt)}.` : draftStatus === 'error'
                ? 'Não foi possível guardar o rascunho neste aparelho. Tente salvar novamente.'
                : 'As alterações do poste ficam guardadas neste aparelho enquanto você trabalha.'}
          </div>
          {canSubmit ? <div className="mt-4 space-y-4">
            {!order.pole_id && !poleForm && <div className="rounded-xl border border-edge-default p-3">
              <label className="block text-sm font-semibold">Qual poste foi atendido?<Input value={poleSearch} onChange={(event) => setPoleSearch(event.target.value)} disabled={saving} className="mt-2" placeholder="Busque número, plaqueta ou endereço" /></label>
              {!poleSearch.trim() && hasOrderPin && <p className="mt-2 text-xs text-content-secondary">Postes até 300 m do pin no mapa, do mais próximo ao mais distante.</p>}
              {!poleSearch.trim() && !hasOrderPin && <p className="mt-2 text-xs text-content-secondary">Esta ordem não tem pin no mapa. Busque pelo número, plaqueta ou endereço.</p>}
              {searchingPole && <p role="status" className="mt-2 text-xs text-content-secondary">Buscando postes…</p>}
              {offline && <p className="mt-2 text-xs text-content-secondary">Conecte-se para buscar postes.</p>}
              {poleLookupError && <p role="alert" className="mt-2 text-xs text-danger">{poleLookupError}</p>}
              <div className="mt-2 max-h-56 space-y-1 overflow-y-auto" aria-label={poleSearch.trim() ? 'Postes encontrados' : 'Postes próximos ao pin'}>{poleResults.map((item) => {
                const distance = distanceBetweenPoints(order, item);
                return <button type="button" disabled={saving} key={item.id} onClick={() => { setPole(item); setPoleForm(electricianPoleForm(item)); setPoleSearch(''); markDraftChanged(); }} className="block w-full rounded-lg p-3 text-left text-sm hover:bg-brand-subtleBg focus-visible:ring-2 focus-visible:ring-brand"><strong>Poste {compactPoleReference(item.identifier || item.plate || item.id)}</strong><span className="mt-1 block text-xs text-content-secondary">{item.address || 'Sem endereço'}{distance != null && ` · ${formatDistance(distance)} do pin`}</span></button>;
              })}</div>
              {!searchingPole && !poleSearch.trim() && hasOrderPin && !poleResults.length && !offline && !poleLookupError && <p className="mt-2 text-xs text-content-secondary">Nenhum poste cadastrado a até 300 m do pin. Tente buscar pelo número, plaqueta ou endereço.</p>}
              {!searchingPole && poleSearch.trim().length >= 2 && !poleResults.length && !offline && !poleLookupError && <p className="mt-2 text-xs text-content-secondary">Nenhum poste encontrado. Tente o número ou a plaqueta.</p>}
            </div>}
            {poleForm && <><div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-brand-subtleBg p-3 text-sm font-semibold text-brand"><span>Poste {compactPoleReference(poleForm.identifier || pole?.plate || poleForm.id)}<span className="mt-1 block text-xs font-normal">{pole?.address}</span></span>{!order.pole_id && <button type="button" onClick={() => { setPole(null); setPoleForm(null); markDraftChanged(); }} disabled={saving} className="rounded-lg px-2 py-1 text-xs font-bold underline focus-visible:ring-2 focus-visible:ring-brand">Trocar poste</button>}</div><ElectricianPoleFields value={poleForm} disabled={saving} onChange={(next) => { setPoleForm(next); markDraftChanged(); }} /></>}
            <div className="grid gap-4">
              <label className="text-sm font-semibold">Serviço executado <span className="text-danger">*</span><select required value={serviceType} onChange={(event) => { setServiceType(event.target.value); markDraftChanged(); setFormError(''); }} disabled={saving} className="mt-1.5 h-11 w-full rounded-xl border border-edge-default bg-surface-raised px-3 text-sm font-normal focus:ring-2 focus:ring-brand"><option value="">Selecione o serviço</option><option value="lamp_replacement">Troca de lâmpada</option><option value="arm_installation">Instalação de braço de luz</option><option value="other">Outro serviço</option></select></label>
              <label className="text-sm font-semibold">Resultado do serviço <span className="font-normal text-content-tertiary">(opcional)</span><textarea value={result} onChange={(event) => { setResult(event.target.value); markDraftChanged(); setFormError(''); }} disabled={saving} minLength={10} maxLength={4000} placeholder="Descreva o que foi realizado" className="mt-1.5 min-h-24 w-full rounded-xl border border-edge-default bg-surface-raised px-3 py-2 text-sm font-normal focus:ring-2 focus:ring-brand" /></label>
            </div>
            <details className="rounded-xl border border-edge-subtle p-3"><summary className="cursor-pointer text-sm font-semibold">Anexar foto (opcional){files.length > 0 && ` · ${files.length}`}</summary><div className="mt-3 space-y-3">
            <div><p className="mb-2 text-sm font-semibold">Fotos do atendimento <span className="font-normal text-content-tertiary">(opcional)</span></p><div className="grid gap-2 sm:grid-cols-2"><label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-edge-default bg-surface-raised px-3 text-sm font-semibold transition hover:border-brand/50 hover:bg-brand-subtleBg focus-within:ring-2 focus-within:ring-brand"><Camera className="h-4 w-4 text-brand" />Tirar foto<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={selectFiles} disabled={saving} /></label><label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-edge-default bg-surface-raised px-3 text-sm font-semibold transition hover:border-brand/50 hover:bg-brand-subtleBg focus-within:ring-2 focus-within:ring-brand"><UploadCloud className="h-4 w-4 text-brand" />Escolher da galeria<input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={selectFiles} disabled={saving} /></label></div></div>
            {files.length > 0 && <ul className="space-y-2">{files.map((entry) => <li key={entry.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-subtle p-2 text-xs"><span className="min-w-0 break-all">{entry.file.name}</span><button type="button" disabled={saving} className="shrink-0 font-semibold text-brand disabled:opacity-50" onClick={() => { setFiles((current) => current.filter((file) => file.id !== entry.id)); markDraftChanged(); }}>Remover</button></li>)}</ul>}
            <p className="text-xs leading-5 text-content-secondary">As fotos ficam visíveis apenas para a equipe municipal.</p>
            </div></details>
            {formError && <p role="alert" className="rounded-xl bg-danger-subtleBg p-3 text-sm text-danger">{formError}</p>}
            {formError && pole && <Button type="button" variant="outline" disabled={saving} className="w-full" onClick={async () => { await load(); markDraftChanged(); setFormError(''); }}>Recarregar dados atuais do poste</Button>}
            <div className="space-y-2 border-t border-edge-subtle pt-4"><Button type="button" className="min-h-12 w-full" onClick={() => save('concluida')} disabled={saving || offline || !draftReady || !poleForm}><CheckCircle2 className="mr-2 h-4 w-4" />{saving ? 'Salvando…' : 'Salvar poste e resolver serviço'}</Button><Button type="button" variant="ghost" className="w-full" onClick={saveDraftNow} disabled={saving || !draftReady}>Salvar para continuar depois</Button></div>
          </div> : <p className="mt-4 text-sm text-content-secondary">{statusLabel(order.status)}. Acompanhe as atualizações no histórico.</p>}
        </section>
      </div>
      <section className="mt-5 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5"><MunicipalDemandHistory events={events} context={context} variant="timeline" /></section>
    </>}
  </div>;
}
