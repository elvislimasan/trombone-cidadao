import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Clock3, ExternalLink, FileText, Info, Loader2, MapPin, MessageSquare, Paperclip, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import MediaViewer from '@/components/MediaViewer';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/customSupabaseClient';
import { agencyCasePoint } from '@/lib/agencyCaseFilters';
import { DEMAND_STATUSES } from '@/lib/municipalDemand';
import { rotuloDoTipoDeProblema } from '@/lib/reportCategoryFields';

const LocationMap = lazy(() => import('@/components/municipality/AgencyCasesMap').then((module) => ({ default: module.AgencyCaseLocationMap })));
const statusLabels = { pending: 'Pendente', 'in-progress': 'Em andamento', pending_resolution: 'Aguardando confirmação', resolved: 'Resolvida', duplicate: 'Duplicada' };
const statusTone = { pending: 'bg-status-pendingBg text-status-pendingFg', 'in-progress': 'bg-status-progressBg text-status-progressFg', pending_resolution: 'bg-status-progressBg text-status-progressFg', resolved: 'bg-success-bg text-success-fg', duplicate: 'bg-surface-subtle text-content-secondary' };
const stepLabels = { encaminhada: 'Encaminhada', recebida: 'Recebida', programada: 'Programada', executada: 'Execução informada', recusada: 'Recusada' };
const date = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function MunicipalReportDrawer({ open, reportId, context, onClose, onCreateDemand, onOpenDemand }) {
  const [report, setReport] = useState(null);
  const [linked, setLinked] = useState(null);
  const [steps, setSteps] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState(null);
  const [tab, setTab] = useState('informacoes');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !reportId || !context.municipality?.id) return;
    let active = true;
    setLoading(true);
    setReport(null);
    setLinked(null);
    setSteps([]);
    setUpdates([]);
    setError('');
    setViewingPhotoIndex(null);
    setTab('informacoes');
    (async () => {
      const [reportResult, linkedResult, stepsResult, updatesResult] = await Promise.all([
        supabase.from('reports')
          .select('id,title,description,address,neighborhood,created_at,status,protocol,location,category_id,issue_type,pole_number,category:categories(name),featured_image_url,report_media(url,type,created_at)')
          .eq('id', reportId).eq('city_id', context.municipality.city_id)
          .or('moderation_status.eq.approved,moderation_status.is.null')
          .or('is_petition.eq.false,is_petition.is.null').maybeSingle(),
        supabase.rpc('vinculos_broncas_prefeitura', { p_prefeitura: context.municipality.id, p_reports: [reportId] }),
        supabase.from('report_official_steps').select('id,etapa,orgao,protocolo,observacao,ocorreu_em')
          .eq('report_id', reportId).or('registrado_por_papel.is.null,registrado_por_papel.neq.sistema')
          .order('ocorreu_em', { ascending: false }).limit(20),
        supabase.from('report_updates').select('id,message,created_at,status')
          .eq('report_id', reportId).order('created_at', { ascending: false }).limit(20),
      ]);
      if (!active) return;
      setReport(reportResult.data);
      setLinked(linkedResult.data?.[0] || null);
      setSteps(stepsResult.data || []);
      setUpdates((updatesResult.data || []).filter((update) => !['rejected', 'pending_moderation'].includes(update.status)));
      setError(reportResult.error?.message || linkedResult.error?.message || (!reportResult.data ? 'Bronca não encontrada nesta cidade.' : ''));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [open, reportId, context.municipality?.id, context.municipality?.city_id]);

  const photos = report ? [...new Set([
    report.featured_image_url,
    ...(report.report_media || []).filter((media) => media.type === 'photo').map((media) => media.url),
  ].filter(Boolean))] : [];
  const otherFiles = [...new Map((report?.report_media || [])
    .filter((media) => media.url && media.type !== 'photo' && !photos.includes(media.url))
    .map((media) => [media.url, media])).values()];
  const timeline = report ? [
    { id: 'registro', title: 'Bronca registrada', timestamp: report.created_at, source: 'Relato público', icon: FileText, tone: 'text-content-secondary bg-surface-subtle' },
    ...steps.map((step) => ({ id: `etapa-${step.id}`, title: stepLabels[step.etapa] || step.etapa, timestamp: step.ocorreu_em, source: 'Andamento oficial', detail: [step.orgao, step.protocolo].filter(Boolean).join(' · '), message: step.observacao, icon: Clock3, tone: 'text-brand bg-brand-subtleBg' })),
    ...updates.map((update) => ({ id: `atualizacao-${update.id}`, title: 'Atualização da comunidade', timestamp: update.created_at, source: 'Comunidade', message: update.message || 'Atualização registrada', icon: MessageSquare, tone: 'text-status-progressFg bg-status-progressBg' })),
  ].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()) : [];
  const point = report ? agencyCasePoint({ report }) : null;
  const place = [context.municipality?.cidade?.name, context.municipality?.cidade?.states?.uf].filter(Boolean).join(' - ');
  const address = report?.address?.trim() || '';
  const neighborhood = report?.neighborhood?.trim() || '';
  const addressLower = address.toLocaleLowerCase('pt-BR');
  const cityName = context.municipality?.cidade?.name || '';
  const showNeighborhood = neighborhood && !addressLower.includes(neighborhood.toLocaleLowerCase('pt-BR'));
  const showCity = place && (!cityName || !addressLower.includes(cityName.toLocaleLowerCase('pt-BR')));
  const mapsHref = point ? `https://www.google.com/maps/search/?api=1&query=${point[0]},${point[1]}` : address || neighborhood ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([address || neighborhood, showCity ? place : ''].filter(Boolean).join(', '))}` : '';
  const linkedStatus = DEMAND_STATUSES.find(([key]) => key === linked?.status)?.[1];
  const tabs = [
    { value: 'informacoes', label: 'Resumo', detail: 'Relato e dados', icon: Info },
    { value: 'arquivos', label: 'Arquivos', detail: 'Fotos e mídias', icon: Paperclip, count: photos.length + otherFiles.length },
    { value: 'timeline', label: 'Atividade', detail: 'Histórico do caso', icon: Clock3, count: steps.length + updates.length },
    { value: 'localizacao', label: 'Localização', detail: 'Endereço e mapa', icon: MapPin },
  ];

  return <Tabs value={tab} onValueChange={setTab}>
    <MunicipalDrawer open={open} onClose={onClose} variant="report" activeSection={tab} externalPreviewOpen={viewingPhotoIndex !== null} title={report?.title || 'Consultar bronca'}
    description={report ? <span className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-brand-subtleBg px-2 py-0.5 text-xs font-bold text-brand-subtleFg">{report.category?.name || 'Sem categoria'}</span><span className={'rounded-md px-2 py-0.5 text-xs font-bold ' + (statusTone[report.status] || 'bg-surface-subtle text-content-secondary')}>{statusLabels[report.status] || report.status || 'Sem status'}</span><span className="text-xs">Registrada em {date(report.created_at)}</span></span> : 'Relato público da cidade'}
    navigation={report && !loading && !error && <nav aria-label="Seções da bronca" className="overflow-x-auto"><TabsList aria-label="Abas da bronca" className="grid h-auto min-w-[34rem] grid-cols-4 gap-1.5 border-0 bg-surface-subtle p-1.5 shadow-none sm:min-w-0">
      {tabs.map(({ value, label, detail, icon: Icon, count }) => <TabsTrigger key={value} value={value} className="group min-h-14 min-w-0 justify-start gap-2 rounded-lg border border-transparent px-2 text-left text-xs text-content-secondary shadow-none transition-colors hover:bg-surface-raised focus-visible:ring-brand data-[state=active]:border-edge-subtle data-[state=active]:bg-surface-raised data-[state=active]:text-brand-subtleFg data-[state=active]:shadow-sm sm:px-3">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate font-bold">{label}</span><span className="hidden truncate text-[11px] font-normal text-content-tertiary lg:block">{detail}</span></span>{count !== undefined && <span className="rounded-full bg-surface-subtle px-1.5 text-[10px] tabular-nums">{count}</span>}
      </TabsTrigger>)}
    </TabsList></nav>}
    headerAction={report && !error && (linked ? linked.demanda_id ? <Button size="sm" onClick={() => onOpenDemand(linked.demanda_id)}>Ver ordem {linked.protocolo}</Button> : <span className="max-w-52 text-xs leading-5 text-content-secondary">Atendida pela ordem {linked.protocolo}, de outra secretaria.</span> : context.canEdit && report.status === 'pending' && <Button size="sm" onClick={() => onCreateDemand(report.id)}><Plus className="mr-1.5 h-4 w-4" />Abrir ordem de serviço</Button>)}>
    {loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
      : error ? <p role="alert" className="text-sm text-red-700">{error}</p>
        : report && <>
        <TabsContent value="informacoes" className="mt-0 space-y-6">
          <section aria-labelledby="relato-da-bronca">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h2 id="relato-da-bronca" className="text-sm font-bold text-content-primary">Relato do cidadão</h2>
              <Link to={`/bronca/${report.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Ver página pública <ExternalLink className="h-3.5 w-3.5" /></Link>
            </div>
            <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-content-secondary">{report.description || 'Sem descrição adicional.'}</p>
          </section>

          <section className="border-t border-edge-subtle pt-5" aria-labelledby="atendimento-da-bronca">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 id="atendimento-da-bronca" className="text-sm font-bold">Atendimento municipal</h2>
              {linkedStatus && <span className="rounded-md bg-status-progressBg px-2 py-0.5 text-xs font-semibold text-status-progressFg">{linkedStatus}</span>}
            </div>
            <p className="mt-2 text-sm text-content-secondary">{linked ? linked.demanda_id ? `Ordem ${linked.protocolo || 'vinculada'} · em atendimento pela sua equipe` : `Ordem ${linked.protocolo || 'vinculada'} · atendimento de outra secretaria` : 'Aguardando ordem de serviço'}</p>
            {steps[0] && <p className="mt-1 text-xs text-content-tertiary">Última etapa oficial: {stepLabels[steps[0].etapa] || steps[0].etapa} · {date(steps[0].ocorreu_em)}</p>}
          </section>

          <section className="border-t border-edge-subtle pt-5" aria-labelledby="dados-da-bronca">
            <h2 id="dados-da-bronca" className="text-sm font-bold">Dados da bronca</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <div className="min-w-0"><dt className="text-xs text-content-tertiary">Localidade</dt><dd className="mt-1 break-words text-sm font-medium">{neighborhood || place || 'Não informada'}</dd><button type="button" onClick={() => setTab('localizacao')} className="mt-1 text-xs font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Ver endereço e mapa</button></div>
              <div className="min-w-0"><dt className="text-xs text-content-tertiary">Protocolo público</dt><dd className="mt-1 break-all text-sm font-medium tabular-nums">{report.protocol || '—'}</dd></div>
              {(report.pole_number || report.issue_type) && <div className="min-w-0 sm:col-span-2"><dt className="text-xs text-content-tertiary">Detalhes do problema</dt><dd className="mt-1 break-words text-sm font-medium">{[report.issue_type && rotuloDoTipoDeProblema(report.category_id, report.issue_type), report.pole_number && `Poste ${report.pole_number}`].filter(Boolean).join(' · ')}</dd></div>}
            </dl>
          </section>
        </TabsContent>
        <TabsContent value="arquivos" className="mt-0 space-y-5">
          {!photos.length && !otherFiles.length && <p className="rounded-xl border border-dashed border-edge-default bg-surface-raised p-8 text-center text-sm text-content-tertiary">Nenhum arquivo disponível nesta bronca.</p>}
          {photos.length > 0 && <section><h3 className="mb-3 text-sm font-semibold">Fotos ({photos.length})</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{photos.map((url, index) => <button key={url} type="button" onClick={() => setViewingPhotoIndex(index)} aria-label={`Ampliar foto ${index + 1}`} className="overflow-hidden rounded-xl border border-edge-subtle focus-visible:ring-2 focus-visible:ring-brand"><img src={url} alt={`Foto ${index + 1} da bronca`} loading="lazy" className="aspect-[4/3] w-full object-cover" /></button>)}</div></section>}
          {otherFiles.length > 0 && <section><h3 className="mb-3 text-sm font-semibold">Outras mídias ({otherFiles.length})</h3><div className="grid gap-3 sm:grid-cols-2">{otherFiles.map((media, index) => <div key={media.url} className="min-w-0 overflow-hidden rounded-xl border border-edge-subtle bg-surface-subtle">{media.type === 'video' && <video src={media.url} controls preload="metadata" aria-label={`Vídeo ${index + 1} da bronca`} className="aspect-video w-full bg-black" />}<a href={media.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 text-sm font-semibold text-brand hover:underline"><FileText className="h-4 w-4 shrink-0" />{media.type === 'video' ? 'Abrir vídeo' : 'Abrir arquivo'} {index + 1}<ExternalLink className="ml-auto h-4 w-4 shrink-0" /></a></div>)}</div></section>}
        </TabsContent>
        <TabsContent value="timeline" className="mt-0 space-y-5">
          <h2 className="text-sm font-bold">Atividade da bronca</h2>
          {!steps.length && !updates.length && <p className="rounded-xl bg-surface-subtle p-3 text-sm text-content-secondary">Ainda não há etapas oficiais ou atualizações da comunidade.</p>}
          <ol>{timeline.map(({ id, title, timestamp, source, detail, message, icon: Icon, tone }, index) => <li key={id} className="relative flex min-w-0 gap-3 pb-5 last:pb-0 sm:gap-4">
            {index < timeline.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[15px] top-8 w-px bg-edge-subtle" />}
            <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
            <div className={'min-w-0 flex-1 pb-4 text-sm ' + (index < timeline.length - 1 ? 'border-b border-edge-subtle' : '')}><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="break-words font-semibold">{title}</h3><time dateTime={timestamp || undefined} className="text-xs text-content-tertiary">{date(timestamp)}</time></div><p className="mt-0.5 text-xs text-content-tertiary">{source}{detail ? ` · ${detail}` : ''}</p>{message && <p className="mt-2 whitespace-pre-line break-words leading-6 text-content-secondary">{message}</p>}</div>
          </li>)}</ol>
        </TabsContent>
        <TabsContent value="localizacao" className="mt-0 space-y-4">
          <h2 className="text-sm font-bold">Localização da bronca</h2>
          {point ? <Suspense fallback={<div role="status" className="flex h-80 items-center justify-center rounded-xl bg-surface-subtle text-sm text-content-secondary">Carregando mapa…</div>}><LocationMap item={{ report }} /></Suspense> : <p className="rounded-xl border border-dashed border-edge-subtle bg-surface-raised p-4 text-sm text-content-tertiary">Sem coordenadas válidas para exibir o mapa.</p>}
          <section className="border-t border-edge-subtle pt-4" aria-label="Detalhes da localização"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">Endereço e referência</h3>{mapsHref && <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline">Abrir no Google Maps <ExternalLink className="h-3.5 w-3.5" /></a>}</div><dl className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2"><div className="min-w-0"><dt className="text-xs text-content-tertiary">Endereço informado</dt><dd className="mt-1 break-words text-sm font-medium">{address || neighborhood || 'Não informado'}</dd></div>{showNeighborhood && <div className="min-w-0"><dt className="text-xs text-content-tertiary">Bairro</dt><dd className="mt-1 break-words text-sm font-medium">{neighborhood}</dd></div>}{showCity && <div className="min-w-0"><dt className="text-xs text-content-tertiary">Município</dt><dd className="mt-1 break-words text-sm font-medium">{place}</dd></div>}<div className="min-w-0"><dt className="text-xs text-content-tertiary">Coordenadas do registro</dt><dd className="mt-1 text-sm font-medium tabular-nums">{point ? `${point[0].toFixed(5)}, ${point[1].toFixed(5)}` : 'Não informadas'}</dd></div></dl></section>
        </TabsContent>
        </>}
    </MunicipalDrawer>
    {viewingPhotoIndex !== null && photos.length > 0 && <MediaViewer media={photos.map((url, index) => ({ type: 'photo', url, name: `Foto ${index + 1} da bronca` }))} startIndex={viewingPhotoIndex} onClose={() => setViewingPhotoIndex(null)} />}
  </Tabs>;
}
