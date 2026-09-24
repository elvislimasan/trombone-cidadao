import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Clock,
  Inbox,
  Loader2,
  MapPin,
  MessageSquare,
  RefreshCw,
  Save,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import AgencyCaseWorkflow from '@/components/municipality/AgencyCaseWorkflow';
import AgencyReportImage from '@/components/municipality/AgencyReportImage';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError, showAppNotice } from '@/lib/appError';
import { agencyCasePoint } from '@/lib/agencyCaseFilters';
import {
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

const eventLabel = (type) => {
  if (type === 'encaminhada') return 'Encaminhamento registrado';
  if (type === 'resposta_publica') return 'Resposta pública enviada';
  if (type === 'nota_interna') return 'Nota interna adicionada';
  if (type === 'atribuida') return 'Responsável alterado';
  return 'Demanda atualizada';
};

export default function AgencyCaseDetailsPage() {
  const { reportId } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [caseItem, setCaseItem] = useState(null);
  const [showMap, setShowMap] = useState(false);
  useEffect(() => setShowMap(false), [reportId]);
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
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Button asChild variant="ghost" size="sm" className="-ml-3 gap-2 text-content-secondary">
              <Link to={queuePath}><ArrowLeft className="h-4 w-4" />Voltar à caixa de entrada</Link>
            </Button>
            <p className="mt-3 text-xs font-extrabold uppercase tracking-[0.16em] text-brand">Atendimento municipal</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Detalhes da bronca</h1>
          </div>
          <Button variant="outline" size="icon" onClick={() => load({ quiet: true })} disabled={refreshing || saving || routing || dirty} title={dirty ? 'Salve as alterações antes de atualizar' : 'Atualizar'} aria-label="Atualizar atendimento">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </header>

        <section className="mt-5 overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm">
          <div className="grid min-w-0 md:grid-cols-[15rem_minmax(0,1fr)]">
            <AgencyReportImage key={caseItem.report_id} report={caseItem.report} />
            <div className="min-w-0 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge item={caseItem} />
                <span className="rounded-full bg-surface-subtle px-2.5 py-1 text-[11px] font-bold text-content-secondary">
                  {caseItem.canal?.canal_triagem ? 'Triagem municipal' : caseItem.canal?.nome}
                </span>
                {caseItem.prioridade === 'urgente' && <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase text-red-700">Urgente</span>}
              </div>
              <h2 className="mt-4 text-xl font-black leading-tight sm:text-2xl">{caseItem.report?.title || 'Bronca sem título'}</h2>
              <p className="mt-3 flex items-start gap-2 text-sm text-content-secondary">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                {[caseItem.report?.address, caseItem.report?.neighborhood].filter(Boolean).join(' · ') || 'Local não informado'}
              </p>
              {agencyCasePoint(caseItem) ? <div className="mt-3">
                <Button type="button" variant="outline" size="sm" aria-expanded={showMap} aria-controls="case-location-map" onClick={() => setShowMap((visible) => !visible)}>
                  <MapPin className="mr-2 h-4 w-4" />{showMap ? 'Fechar mapa' : 'Ver no mapa'}
                </Button>
                {showMap && <div id="case-location-map" className="mt-3">
                  <Suspense fallback={<p role="status" className="py-4 text-sm text-content-secondary">Carregando mapa...</p>}>
                    <AgencyCaseLocationMap item={caseItem} />
                  </Suspense>
                </div>}
              </div> : <p className="mt-2 text-xs text-content-tertiary">Localização no mapa não informada.</p>}
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-content-tertiary">
                <span>{caseItem.report?.category?.name || 'Categoria não informada'}</span>
                <span>Publicada em {fmtDate(caseItem.report?.created_at, true)}</span>
                {caseItem.protocolo && <span>Protocolo {caseItem.protocolo}</span>}
              </div>
              {caseItem.report?.description && <p className="mt-4 max-w-4xl whitespace-pre-line text-sm leading-6 text-content-secondary">{caseItem.report.description}</p>}
            </div>
          </div>
        </section>

        <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]" aria-label="Fluxo do atendimento">
          <AgencyCaseWorkflow
            item={caseItem} form={form} setForm={setForm} canOperate={canOperate}
            cityAdministrator={cityAdministrator} channelMembers={channelMembers} cityChannels={cityChannels}
            destinationId={destinationId} setDestinationId={setDestinationId} routeCase={routeCase}
            busy={saving || routing || refreshing} routing={routing} dirty={dirty}
          />

          <aside className="min-w-0 space-y-5">
            <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm">
              <h2 className="text-sm font-black">Resumo operacional</h2>
              <dl className="mt-4 space-y-4 text-xs">
                <div className="flex items-start gap-3"><Inbox className="mt-0.5 h-4 w-4 text-content-tertiary" /><div><dt className="text-content-tertiary">Secretaria atual</dt><dd className="mt-0.5 font-bold">{caseItem.canal?.canal_triagem ? 'Triagem municipal' : caseItem.canal?.nome}</dd></div></div>
                <div className="flex items-start gap-3"><CalendarDays className="mt-0.5 h-4 w-4 text-content-tertiary" /><div><dt className="text-content-tertiary">Recebida</dt><dd className="mt-0.5 font-bold">{caseItem.recebido_em ? fmtDate(caseItem.recebido_em, true) : 'Aguardando recebimento'}</dd></div></div>
                <div className="flex items-start gap-3"><User className="mt-0.5 h-4 w-4 text-content-tertiary" /><div><dt className="text-content-tertiary">Responsável</dt><dd className="mt-0.5 font-bold">{caseItem.responsavel?.name || 'Não definido'}</dd></div></div>
                <div className="flex items-start gap-3"><Clock className="mt-0.5 h-4 w-4 text-content-tertiary" /><div><dt className="text-content-tertiary">Prazo</dt><dd className="mt-0.5 font-bold">{fmtDate(caseItem.prazo_em, true)}</dd></div></div>
                <div className="flex items-start gap-3"><MessageSquare className="mt-0.5 h-4 w-4 text-content-tertiary" /><div><dt className="text-content-tertiary">Última resposta pública</dt><dd className="mt-0.5 font-bold">{fmtDate(caseItem.ultima_resposta_publica_em, true)}</dd></div></div>
              </dl>
            </section>

            <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-black"><MessageSquare className="h-4 w-4 text-brand" />Comunicações</h2>
              <div className="mt-4 space-y-3">
                {responses.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-4 text-xs text-content-tertiary">Nenhuma resposta ou nota registrada.</p>
                ) : responses.map((response) => (
                  <article key={response.id} className={`rounded-xl border p-3 ${response.visibilidade === 'publica' ? 'border-brand/25 bg-brand-subtleBg' : 'border-edge-subtle bg-surface-subtle'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wide">{response.visibilidade === 'publica' ? 'Resposta oficial' : 'Nota interna'}</span>
                      <span className="text-[10px] text-content-tertiary">{fmtDate(response.created_at, true)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-xs leading-5 text-content-secondary">{response.mensagem}</p>
                    <p className="mt-2 text-[10px] text-content-tertiary">{response.autor?.name || response.orgao_nome || 'Equipe do órgão'}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-black"><Clock className="h-4 w-4 text-brand" />Histórico do atendimento</h2>
              <div className="mt-4 space-y-4">
                {events.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-4 text-xs text-content-tertiary">Nenhuma movimentação registrada.</p>
                ) : events.map((event) => (
                  <div key={event.id} className="relative border-l-2 border-edge-subtle pl-4">
                    <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-brand" />
                    <p className="text-xs font-bold">{eventLabel(event.tipo)}</p>
                    {event.para_status && <p className="mt-1 text-[11px] text-content-secondary">Situação: {agencyStatus(event.para_status).label}</p>}
                    <p className="mt-1 text-[10px] text-content-tertiary">{event.autor?.name || 'Sistema'} · {fmtDate(event.created_at, true)}</p>
                  </div>
                ))}
              </div>
            </section>

            {refused && (
              <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
                <p className="flex items-center gap-2 text-xs font-black"><AlertTriangle className="h-4 w-4" />Atendimento recusado</p>
                <p className="mt-2 text-xs leading-5">A justificativa oficial permanece no histórico de comunicações.</p>
              </section>
            )}
          </aside>
        </div>
        {canOperate && <div className="sticky bottom-0 z-20 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-lg" aria-label="Salvar atendimento">
          <div className="min-w-0 text-xs" aria-live="polite">
            <p className="font-bold">{dirty ? 'Alterações ainda não salvas' : 'Atendimento atualizado'}</p>
            <p className="mt-1 text-content-secondary">{form.publicResponse.trim() ? `Ao salvar: publicar resposta${form.internalNote.trim() ? ', registrar nota interna' : ''} e atualizar atendimento.` : form.internalNote.trim() ? 'Ao salvar: registrar nota interna e atualizar atendimento.' : form.status !== caseItem.status ? `Ao salvar: ${agencyStatus(form.status).label}.` : 'Salve para registrar as alterações no histórico.'}</p>
          </div>
          <Button onClick={saveCase} disabled={saving || routing || refreshing || !dirty} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Salvando...' : form.publicResponse.trim() ? 'Salvar e publicar resposta' : 'Salvar alterações'}
          </Button>
        </div>}
      </div>
    </>
  );
}
