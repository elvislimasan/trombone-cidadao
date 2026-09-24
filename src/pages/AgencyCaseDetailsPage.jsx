import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Inbox,
  Loader2,
  MapPin,
  MessageSquare,
  ArrowUpRight,
  RefreshCw,
  Save,
  ShieldCheck,
  User,
} from 'lucide-react';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import { Button } from '@/components/ui/button';
import AgencyCaseActivity from '@/components/municipality/AgencyCaseActivity';
import AgencyCaseWorkflow from '@/components/municipality/AgencyCaseWorkflow';
import AgencyReportImage from '@/components/municipality/AgencyReportImage';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError, showAppNotice } from '@/lib/appError';
import { agencyCasePoint } from '@/lib/agencyCaseFilters';
import {
  agencyReportImages,
  agencyStatus,
  agencyCaseStatus,
  canOperateAgency,
} from '@/lib/agencyPanel';

const AgencyCaseLocationMap = lazy(() => import('@/components/municipality/AgencyCasesMap').then((module) => ({ default: module.AgencyCaseLocationMap })));

const CASE_SELECT = `
  report_id, canal_id, status, prioridade, protocolo, atribuido_a, prazo_em,
  recebido_em, ultima_resposta_publica_em, created_at, updated_at,
  canal:orgao_canais!orgao_casos_canal_id_fkey(
    id, nome, city_id, canal_triagem, cidade:cities(name, states(uf))
  ),
  responsavel:profiles!orgao_casos_atribuido_a_fkey(id, name),
  report:reports!orgao_casos_report_id_fkey(
    id, title, address, neighborhood, location, description, created_at, status,
    category_id, featured_image_url, report_media(url, type, created_at), category:categories(name, icon)
  )
`;

const fmtDate = (value, withTime = false) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', withTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'short' });
};

const toLocalInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const StatusBadge = ({ item }) => {
  const status = agencyCaseStatus(item);
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${status.tone}`}>{status.label}</span>;
};

export default function AgencyCaseDetailsPage() {
  const { reportId } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [caseItem, setCaseItem] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [communicationOpen, setCommunicationOpen] = useState(false);
  useEffect(() => setCommunicationOpen(false), [reportId]);
  useEffect(() => setDetailsOpen(false), [reportId]);
  const [municipalityMemberships, setMunicipalityMemberships] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [channels, setChannels] = useState([]);
  const [events, setEvents] = useState([]);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [routing, setRouting] = useState(false);
  const [destinationId, setDestinationId] = useState('');
  const [form, setForm] = useState({
    status: 'nova',
    priority: 'normal',
    assignedTo: '',
    protocol: '',
    deadline: '',
    publicResponse: '',
    internalNote: '',
  });

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);

    const [caseResult, municipalityResult, membershipResult, channelResult, eventResult, responseResult] = await Promise.all([
      supabase.from('orgao_casos').select(CASE_SELECT).eq('report_id', reportId).maybeSingle(),
      supabase
        .from('prefeitura_membros')
        .select('id, prefeitura_id, user_id, papel, ativo, prefeitura:prefeituras!prefeitura_membros_prefeitura_id_fkey(id, city_id, nome, status)')
        .eq('user_id', user?.id)
        .eq('ativo', true),
      supabase
        .from('orgao_membros')
        .select('id, canal_id, user_id, papel, ativo, perfil:profiles!orgao_membros_user_id_fkey(id, name)')
        .order('created_at'),
      supabase
        .from('orgao_canais')
        .select('id, nome, city_id, ativo, canal_triagem')
        .eq('ativo', true)
        .eq('canal_triagem', false)
        .order('nome'),
      supabase
        .from('orgao_caso_eventos')
        .select('id, tipo, de_status, para_status, detalhes, canal_id, created_at, autor:profiles!orgao_caso_eventos_criado_por_fkey(name)')
        .eq('report_id', reportId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('orgao_respostas')
        .select('id, orgao_nome, visibilidade, mensagem, created_at, autor:profiles!orgao_respostas_autor_id_fkey(name)')
        .eq('report_id', reportId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (caseResult.error) {
      showAppError({
        title: 'Não foi possível abrir a bronca',
        description: caseResult.error.message,
        variant: 'destructive',
      });
    }

    setCaseItem(caseResult.data || null);
    setMunicipalityMemberships(municipalityResult.data || []);
    setMemberships(membershipResult.data || []);
    setChannels(channelResult.data || []);
    setEvents(eventResult.data || []);
    setResponses(responseResult.data || []);
    setDestinationId(caseResult.data?.canal?.canal_triagem ? '' : (caseResult.data?.canal_id || ''));
    setLoading(false);
    setRefreshing(false);
  }, [reportId, user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!caseItem) return;
    setForm({
      status: caseItem.status,
      priority: caseItem.prioridade,
      assignedTo: caseItem.atribuido_a || '',
      protocol: caseItem.protocolo || '',
      deadline: toLocalInput(caseItem.prazo_em),
      publicResponse: '',
      internalNote: '',
    });
  }, [caseItem]);

  const selectedChannel = caseItem?.canal;
  const caseMembership = memberships.find((member) => (
    member.canal_id === caseItem?.canal_id && member.user_id === user?.id && member.ativo
  ));
  const cityAdministrator = municipalityMemberships.some((member) => (
    member.papel === 'administrador'
    && member.prefeitura?.status === 'ativa'
    && String(member.prefeitura?.city_id) === String(selectedChannel?.city_id)
  ));
  const canOperate = canOperateAgency(caseMembership?.papel, cityAdministrator);
  const channelMembers = memberships.filter((member) => member.canal_id === caseItem?.canal_id && member.ativo);
  const cityChannels = channels.filter((channel) => String(channel.city_id) === String(selectedChannel?.city_id));
  const dirty = Boolean(caseItem && (
    form.status !== caseItem.status || form.priority !== caseItem.prioridade
    || form.assignedTo !== (caseItem.atribuido_a || '') || form.protocol !== (caseItem.protocolo || '')
    || form.deadline !== toLocalInput(caseItem.prazo_em)
    || form.publicResponse.trim() || form.internalNote.trim()
  ));

  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const queuePath = `/prefeitura/${searchParams.get('origem') === 'mapa' ? 'mapa' : 'broncas'}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  const saveCase = async () => {
    if (!caseItem || !canOperate || saving || routing || refreshing || !dirty) return;
    if (form.status === 'recusada' && !form.publicResponse.trim()) {
      showAppError({
        title: 'Explique o motivo da recusa',
        description: 'A justificativa será publicada para o cidadão e é obrigatória nesta etapa.',
        variant: 'destructive',
      });
      return;
    }

    if (form.status === 'atribuida' && !form.assignedTo) {
      showAppError({ title: 'Selecione a pessoa responsável', description: 'Defina um membro da secretaria antes de marcar como atribuída.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('atualizar_caso_do_orgao', {
        p_report_id: caseItem.report_id,
        p_status: form.status,
        p_prioridade: form.priority,
        p_atribuido_a: form.assignedTo || null,
        p_protocolo: form.protocol || null,
        p_prazo_em: form.deadline ? new Date(form.deadline).toISOString() : null,
        p_resposta_publica: form.publicResponse.trim() || null,
        p_nota_interna: form.internalNote.trim() || null,
      });

      if (error) {
        showAppError({ title: 'Não foi possível atualizar a demanda', description: error.message, variant: 'destructive' });
        return;
      }

      showAppNotice({
        title: 'Atendimento atualizado',
        description: form.publicResponse.trim()
          ? 'A resposta oficial já está visível para o cidadão.'
          : 'As alterações foram registradas no histórico.',
      });
      await load({ quiet: true });
      return true;
    } catch (error) {
      showAppError({ title: 'Não foi possível atualizar a demanda', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const routeCase = async () => {
    if (!caseItem || !cityAdministrator || !destinationId || destinationId === caseItem.canal_id || dirty || saving || routing || refreshing) return;
    setRouting(true);
    try {
      const { error } = await supabase.rpc('encaminhar_caso_do_orgao', {
        p_report_id: caseItem.report_id,
        p_canal: destinationId,
      });

      if (error) {
        showAppError({ title: 'Não foi possível encaminhar a demanda', description: error.message, variant: 'destructive' });
        return;
      }

      showAppNotice({ title: 'Demanda encaminhada', description: 'A secretaria responsável já pode acompanhar e atender esta bronca.' });
      await load({ quiet: true });
    } catch (error) {
      showAppError({ title: 'Não foi possível encaminhar a demanda', description: error.message, variant: 'destructive' });
    } finally {
      setRouting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;
  }

  const platformUser = user?.is_admin || user?.is_master;
  if (platformUser || municipalityMemberships.length === 0) {
    return (
      <div className="page-shell-fluid py-12">
        <div className="mx-auto max-w-xl rounded-3xl border border-edge-subtle bg-surface-raised p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto h-10 w-10 text-content-tertiary" />
          <h1 className="mt-4 text-2xl font-black">Acesso institucional necessário</h1>
          <p className="mt-2 text-sm leading-6 text-content-secondary">Esta área é exclusiva da equipe municipal responsável.</p>
          <Button asChild className="mt-5"><Link to={queuePath}>Voltar à caixa de entrada</Link></Button>
        </div>
      </div>
    );
  }

  if (!caseItem) {
    return (
      <div className="page-shell-fluid py-12">
        <div className="rounded-3xl border border-edge-subtle bg-surface-raised p-10 text-center shadow-sm">
          <Inbox className="mx-auto h-10 w-10 text-content-tertiary" />
          <h1 className="mt-4 text-xl font-black">Bronca não encontrada</h1>
          <p className="mt-2 text-sm text-content-secondary">Ela pode ter sido removida ou encaminhada para uma secretaria à qual sua conta não tem acesso.</p>
          <Button asChild variant="outline" className="mt-5"><Link to={queuePath}><ArrowLeft className="mr-2 h-4 w-4" />Voltar à caixa de entrada</Link></Button>
        </div>
      </div>
    );
  }

  const refused = caseItem.status === 'recusada';

  return (
    <>
      <Helmet>
        <title>{caseItem.report?.title || 'Detalhes da bronca'} | Painel da Prefeitura</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="page-shell-fluid py-6 sm:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-3 min-w-0 gap-2 text-content-secondary">
            <Link to={queuePath}><ArrowLeft className="h-4 w-4 shrink-0" />Voltar à caixa de entrada</Link>
          </Button>
          <div className="flex items-center gap-2">
          {canOperate && <Button type="button" variant="outline" className="gap-2 text-xs sm:text-sm" disabled={saving || routing || refreshing} onClick={() => setCommunicationOpen(true)}>
            <MessageSquare className="h-4 w-4 shrink-0" />Comunicar atualização
            {(form.publicResponse.trim() || form.internalNote.trim()) && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" role="img" aria-label="Rascunho pendente" />}
          </Button>}
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => load({ quiet: true })} disabled={refreshing || saving || routing || dirty} title={dirty ? 'Salve as alterações antes de atualizar' : 'Atualizar'} aria-label="Atualizar atendimento">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          </div>
        </header>

        <section className="relative mt-3 min-w-0 overflow-hidden rounded-2xl border border-edge-subtle bg-gradient-to-br from-surface-raised via-surface-raised to-brand-subtleBg p-4 shadow-sm sm:p-6" aria-label="Dados da bronca">
          <div className="flex items-start gap-4 sm:items-center sm:gap-6">
            <button type="button" className="aspect-square w-24 shrink-0 overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:w-36 [&>*]:!h-full [&>*]:!w-full [&>*]:!rounded-none" aria-label="Ver fotos e detalhes da bronca" aria-expanded={detailsOpen} aria-controls="case-report-details" onClick={() => setDetailsOpen((open) => !open)}>
              <AgencyReportImage key={caseItem.report_id} report={caseItem.report} compact />
            </button>
            <div className="min-w-0 flex-1">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-brand">Atendimento municipal</p>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge item={caseItem} />
                {caseItem.prioridade === 'urgente' && <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700">Urgente</span>}
              </div>
              <h1 className="mt-2 break-words text-lg font-extrabold leading-snug tracking-tight sm:text-2xl 2xl:text-3xl">{caseItem.report?.title || 'Bronca sem título'}</h1>
              <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-content-secondary sm:text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">{[caseItem.report?.address, caseItem.report?.neighborhood].filter(Boolean).join(' · ') || 'Local não informado'}</span>
              </p>
            </div>
          </div>
          <div className="mt-4 flex min-w-0 flex-col gap-4 border-t border-edge-subtle pt-4 2xl:flex-row 2xl:items-center">
            <dl className="grid min-w-0 flex-1 grid-cols-1 gap-4 text-xs sm:grid-cols-3">
              <div className="flex min-w-0 items-start gap-2"><Inbox className="mt-0.5 h-4 w-4 shrink-0 text-content-tertiary" /><div className="min-w-0"><dt className="text-content-tertiary">Secretaria</dt><dd className="mt-1 break-words font-semibold">{caseItem.canal?.canal_triagem ? 'Triagem municipal' : caseItem.canal?.nome}</dd></div></div>
              <div className="flex min-w-0 items-start gap-2"><User className="mt-0.5 h-4 w-4 shrink-0 text-content-tertiary" /><div className="min-w-0"><dt className="text-content-tertiary">Responsável</dt><dd className="mt-1 break-words font-semibold">{caseItem.responsavel?.name || 'Não definido'}</dd></div></div>
              <div className="flex min-w-0 items-start gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-content-tertiary" /><div className="min-w-0"><dt className="text-content-tertiary">Previsão de atendimento</dt><dd className="mt-1 break-words font-semibold">{caseItem.prazo_em ? fmtDate(caseItem.prazo_em, true) : 'Não definida'}</dd></div></div>
            </dl>
            <Button type="button" onClick={() => setDetailsOpen(true)} variant="ghost" size="sm" className="shrink-0 self-start gap-1.5 text-xs text-content-secondary 2xl:self-center">
              Ver detalhes, fotos e mapa<ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
          <MunicipalDrawer open={detailsOpen} onClose={() => setDetailsOpen(false)} title={caseItem.report?.title || 'Detalhes da bronca'} description={[caseItem.report?.address, caseItem.report?.neighborhood].filter(Boolean).join(' · ') || 'Informações da solicitação'}>
            <div id="case-report-details" className="min-w-0 space-y-6">
              <section aria-label="Descrição da bronca">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full bg-brand-subtleBg px-2.5 py-1 font-semibold text-brand">{caseItem.report?.category?.name || 'Categoria não informada'}</span>
                  <span className="text-content-tertiary">{fmtDate(caseItem.report?.created_at, true)}</span>
                </div>
                <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-content-secondary">{caseItem.report?.description || 'Sem descrição adicional.'}</p>
              </section>

              <section aria-labelledby="case-location-title" className="min-w-0">
                <h2 id="case-location-title" className="mb-3 flex items-center gap-2 text-sm font-bold"><MapPin className="h-4 w-4 text-brand" />Localização</h2>
                {agencyCasePoint(caseItem) ? <div id="case-location-map">
                  <Suspense fallback={<div role="status" className="flex h-80 items-center justify-center gap-2 rounded-xl border border-edge-subtle bg-surface-subtle text-xs text-content-secondary"><Loader2 className="h-4 w-4 animate-spin" />Carregando localização...</div>}>
                    <AgencyCaseLocationMap item={caseItem} />
                  </Suspense>
                </div> : <p className="rounded-xl border border-dashed border-edge-subtle bg-surface-subtle p-4 text-xs text-content-secondary">Localização no mapa não informada.</p>}
              </section>

              <section aria-labelledby="case-photos-title" className="min-w-0">
                <h2 id="case-photos-title" className="mb-3 flex items-center justify-between text-sm font-bold">Fotos<span className="text-xs font-normal text-content-tertiary">{agencyReportImages(caseItem.report).length} anexadas</span></h2>
                <div className="grid min-w-0 grid-cols-2 gap-3">
                  {agencyReportImages(caseItem.report).map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="group relative min-w-0 overflow-hidden rounded-xl border border-edge-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label={`Abrir foto ${index + 1} em nova aba`}>
                    <img src={url} alt={`Foto ${index + 1} da bronca`} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-105 motion-reduce:transform-none" />
                    <span className="absolute bottom-2 right-2 rounded-lg bg-black/60 p-1.5 text-white"><ArrowUpRight className="h-3.5 w-3.5" /></span>
                  </a>)}
                  {!agencyReportImages(caseItem.report).length && <p className="col-span-2 rounded-xl border border-dashed border-edge-subtle p-4 text-xs text-content-tertiary">Nenhuma foto disponível.</p>}
                </div>
              </section>

              <dl className="grid grid-cols-1 gap-4 rounded-xl bg-surface-subtle p-4 text-xs sm:grid-cols-2">
                <div><dt className="text-content-tertiary">Recebimento</dt><dd className="mt-1 font-medium">{caseItem.recebido_em ? fmtDate(caseItem.recebido_em, true) : 'Aguardando recebimento'}</dd></div>
                <div><dt className="text-content-tertiary">Última resposta pública</dt><dd className="mt-1 font-medium">{caseItem.ultima_resposta_publica_em ? fmtDate(caseItem.ultima_resposta_publica_em, true) : 'Ainda não enviada'}</dd></div>
                {caseItem.protocolo && <div className="sm:col-span-2"><dt className="text-content-tertiary">Protocolo</dt><dd className="mt-1 break-all font-medium">{caseItem.protocolo}</dd></div>}
              </dl>
            </div>
          </MunicipalDrawer>

        <div className="mt-5 grid min-w-0 gap-5 items-start xl:grid-cols-[minmax(0,1fr)_minmax(18rem,28%)]" aria-label="Fluxo do atendimento">
          <div className="min-w-0">
          <AgencyCaseWorkflow
            communicationOpen={communicationOpen} setCommunicationOpen={setCommunicationOpen}
            item={caseItem} form={form} setForm={setForm} canOperate={canOperate}
            cityAdministrator={cityAdministrator} channelMembers={channelMembers} cityChannels={cityChannels}
            destinationId={destinationId} setDestinationId={setDestinationId} routeCase={routeCase}
            busy={saving || routing || refreshing} routing={routing} dirty={dirty} onSave={saveCase}
          />

          </div>
          <aside className="min-w-0 space-y-3">
            <AgencyCaseActivity events={events} responses={responses} />
            {refused && (
              <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
                <p className="flex items-center gap-2 text-xs font-bold"><AlertTriangle className="h-4 w-4" />Atendimento recusado</p>
                <p className="mt-2 text-xs leading-5">A justificativa oficial permanece na atividade do atendimento.</p>
              </section>
            )}
          </aside>
        </div>
        {canOperate && dirty && <div className="sticky bottom-0 z-20 mt-5 flex flex-col gap-3 rounded-t-xl border border-edge-subtle bg-surface-raised p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg sm:flex-row sm:items-center sm:justify-between sm:rounded-xl sm:p-4" aria-label="Salvar atendimento">
          <div className="min-w-0 text-xs" aria-live="polite">
            <p className="font-bold">{dirty ? 'Alterações ainda não salvas' : 'Atendimento atualizado'}</p>
            <p className="mt-1 text-content-secondary">{form.publicResponse.trim() ? `Ao salvar: publicar resposta${form.internalNote.trim() ? ', registrar nota interna' : ''} e atualizar atendimento.` : form.internalNote.trim() ? 'Ao salvar: registrar nota interna e atualizar atendimento.' : form.status !== caseItem.status ? `Ao salvar: ${agencyStatus(form.status).label}.` : 'Salve para registrar as alterações no histórico.'}</p>
          </div>
          <Button onClick={saveCase} disabled={saving || routing || refreshing || !dirty} className="h-auto min-h-11 w-full gap-2 whitespace-normal sm:w-auto sm:shrink-0">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Salvando...' : form.publicResponse.trim() ? 'Salvar e publicar resposta' : 'Salvar alterações'}
          </Button>
        </div>}
      </div>
    </>
  );
}
