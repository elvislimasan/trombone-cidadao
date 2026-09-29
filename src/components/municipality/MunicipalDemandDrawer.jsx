import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3, Download, FileText, Link2, Loader2, Lock, MapPin, MessageSquare, Paperclip, Play, RotateCcw, Search, UserPlus, X } from 'lucide-react';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import MunicipalDemandHistory from '@/components/municipality/MunicipalDemandHistory';
import MunicipalDemandAttachmentsTab from '@/components/municipality/MunicipalDemandAttachmentsTab';
import MunicipalDemandLocation from '@/components/municipality/MunicipalDemandLocation';
import MunicipalResponsibleInvite from '@/components/municipality/MunicipalResponsibleInvite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError, showAppNotice } from '@/lib/appError';
import { DEMAND_INITIAL_FORM, DEMAND_STATUSES, DEMAND_PRIORITIES, canEditDemand, demandPayload, evidenceError, formFromReport, localDateTime, suggestDemandAssignment, suggestedPublicResponse, validateDemand } from '@/lib/municipalDemand';
import { loadMunicipalServiceOrder } from '@/lib/municipalServiceOrder';
import { collectExportRows } from '@/lib/municipalExport';

const selectClass = 'h-10 w-full min-w-0 rounded-lg border border-edge-default bg-surface-subtle px-3 text-sm font-normal text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60';
const reportFields = 'id,title,description,address,neighborhood,category_id,city_id,moderation_status,is_petition,location,pole_id,status';
const tabs = [['dados', 'Dados'], ['local', 'Local'], ['atendimento', 'Atendimento'], ['anexos', 'Anexos'], ['comunicacao', 'Comunicação'], ['vinculos', 'Vínculos'], ['historico', 'Histórico']];
const tabDetails = {
  dados: { icon: FileText, detail: 'Informações do serviço' },
  local: { icon: MapPin, detail: 'Mapa e endereço' },
  atendimento: { icon: CalendarDays, detail: 'Equipe e prazos' },
  anexos: { icon: Paperclip, detail: 'Execução e conclusão' },
  comunicacao: { icon: MessageSquare, detail: 'Respostas e notas' },
  vinculos: { icon: Link2, detail: 'Broncas relacionadas' },
  historico: { icon: Clock3, detail: 'Movimentações' },
};
const dateFields = ['prazo_em', 'previsto_em', 'primeira_resposta_prazo_em', 'proxima_acao_em', 'executada_em'];
function Field({ title, children, hint }) { return <label className="flex min-w-0 flex-col text-xs font-semibold [&>input]:mt-0 [&>select]:mt-0 [&>textarea]:mt-0"><span className="mb-1.5 min-h-5 leading-5 text-content-primary">{title}</span>{children}{hint && <span className="mt-1.5 block text-xs font-normal leading-5 text-content-secondary">{hint}</span>}</label>; }
function SectionHeading({ icon: Icon, title, description, tone = 'brand' }) { return <div className="mb-4 flex items-start gap-3"><span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + (tone === 'blue' ? 'bg-status-progressBg text-status-progressFg' : tone === 'neutral' ? 'bg-surface-subtle text-content-secondary' : 'bg-brand-subtleBg text-brand')}><Icon className="h-4 w-4" /></span><div className="min-w-0"><h2 className="text-sm font-semibold">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-content-secondary">{description}</p>}</div></div>; }

export default function MunicipalDemandDrawer({ open, demandId, reportId, poleId, context, onClose, onSaved }) {
  const [item, setItem] = useState(null);
  const [form, setForm] = useState(DEMAND_INITIAL_FORM);
  const [reports, setReports] = useState([]);
  const [events, setEvents] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [tab, setTab] = useState('dados');
  const [publicResponse, setPublicResponse] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [linkingReport, setLinkingReport] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [baseline, setBaseline] = useState('');
  const [revision, setRevision] = useState(0);
  const [inviteResponsible, setInviteResponsible] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [extraMembers, setExtraMembers] = useState([]);
  const municipalityId = context.municipality?.id;
  const editable = item ? canEditDemand(context, item.canal_id) : context.canEdit;
  const availableChannels = item && !context.isAdministrator ? context.channels.filter((channel) => channel.id === item.canal_id) : context.channels.filter((channel) => canEditDemand(context, channel.id));
  const eligibleMembers = useMemo(() => [...new Map([...context.members, ...extraMembers].map((member) => [String(member.canal_id) + ':' + member.user_id, member])).values()].filter((member) => String(member.canal_id) === String(form.canal_id) && member.ativo && ['gestor', 'operador'].includes(member.papel)), [context.members, extraMembers, form.canal_id]);
  const dirty = Boolean(baseline && (JSON.stringify(form) !== baseline || publicResponse || internalNote || reason || pendingFiles.length || reports.some((report) => report.newLink)));
  const mustExplain = (['cancelada', 'recusada'].includes(form.status) && form.status !== item?.status)
    || (item && ['concluida', 'cancelada', 'recusada', 'aguardando_confirmacao'].includes(item.status) && !['concluida', 'cancelada', 'recusada', 'aguardando_confirmacao'].includes(form.status))
    || (item && form.canal_id !== (item.canal_id || ''));
  const execution = ['concluida', 'aguardando_confirmacao'].includes(form.status);
  const canPublishConclusion = execution && reports.length > 0;
  const waiting = ['aguardando_informacao', 'aguardando_recurso'].includes(form.status);
  const requiresChannel = !context.isAdministrator || ['programada', 'em_andamento', 'aguardando_confirmacao', 'concluida'].includes(form.status);
  const isNew = !demandId || demandId === 'nova';
  const visibleTabs = tabs.filter(([key]) => key !== 'historico' || !isNew);
  const stepIndex = visibleTabs.findIndex(([key]) => key === tab);
  const continueForm = () => {
    if (tab === 'dados' && form.titulo.trim().length < 3) { setFormError('Informe um título com pelo menos 3 caracteres.'); return; }
    setFormError(''); setTab(visibleTabs[stepIndex + 1][0]);
  };
  const close = () => { if (!saving && !registering && (!dirty || window.confirm('Há alterações não salvas. Deseja fechar o atendimento?'))) onClose(); };

  useEffect(() => {
    if (!open || !municipalityId) return undefined;
    let active = true;
    setItem(null); setReports([]); setEvents([]); setAttachments([]); setPendingFiles([]); setForm(DEMAND_INITIAL_FORM);
    setTab('dados'); setPublicResponse(''); setInternalNote(''); setReason(''); setSearch(''); setMatches([]); setLinkingReport(false);
    setError(''); setFormError(''); setBaseline(''); setLoading(true);
    setInviteResponsible(false); setExtraMembers([]); setRegistering(false);
    (async () => {
      try {
        let next = { ...DEMAND_INITIAL_FORM, ...suggestDemandAssignment(context, '') };
        if (demandId && demandId !== 'nova') {
          const [detail, links, history, files] = await Promise.all([
            supabase.from('demandas_municipais').select('*, responsavel:profiles!demandas_municipais_atribuido_a_fkey(name)').eq('id', demandId).eq('prefeitura_id', municipalityId).maybeSingle(),
            collectExportRows(() => supabase.from('demanda_broncas').select('report:reports(' + reportFields + ')').eq('demanda_id', demandId).order('report_id')).then((data) => ({ data })),
            supabase.from('demanda_eventos').select('*,autor:profiles!demanda_eventos_criado_por_fkey(name)').eq('demanda_id', demandId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100),
            supabase.from('demanda_anexos').select('*').eq('demanda_id', demandId).order('created_at', { ascending: false }),
          ]);
          const failure = [detail, links, history, files].find((result) => result.error)?.error;
          if (failure) throw failure;
          if (!detail.data) throw new Error('Demanda não encontrada ou sem acesso à sua secretaria.');
          next = Object.fromEntries(Object.keys(DEMAND_INITIAL_FORM).map((key) => [key, detail.data[key] ?? DEMAND_INITIAL_FORM[key]]));
          dateFields.forEach((key) => { next[key] = localDateTime(detail.data[key]); });
          if (active) { setItem(detail.data); setReports((links.data || []).map((link) => link.report).filter(Boolean)); setEvents(history.data || []); setAttachments(files.data || []); }
        } else if (reportId) {
          const result = await supabase.from('reports').select(reportFields).eq('id', reportId).eq('city_id', context.municipality.city_id)
            .or('moderation_status.eq.approved,moderation_status.is.null').or('is_petition.eq.false,is_petition.is.null').maybeSingle();
          if (result.error) throw result.error;
          if (!result.data || result.data.status === 'duplicate') throw new Error('Bronca indisponível para vínculo nesta cidade.');
          next = formFromReport(result.data, context);
          if (active) setReports([{ ...result.data, newLink: true }]);
        } else if (poleId) {
          const result = await supabase.from('poles').select('id,identifier,plate,address,latitude,longitude,lighting_status').eq('id', poleId).eq('city_id', context.municipality.city_id).maybeSingle();
          if (result.error) throw result.error;
          if (!result.data) throw new Error('Poste não encontrado nesta cidade.');
          const pole = result.data;
          const poleReports = await collectExportRows(() => supabase.from('reports').select(reportFields)
            .eq('city_id', context.municipality.city_id).eq('pole_id', pole.id)
            .or('moderation_status.eq.approved,moderation_status.is.null')
            .or('is_petition.eq.false,is_petition.is.null')
            .not('status', 'in', '(duplicate,resolved)')
            .order('created_at', { ascending: false }).order('id'));
          const linkedIds = new Set();
          for (let start = 0; start < poleReports.length; start += 500) {
            const { data, error: linksError } = await supabase.rpc('vinculos_broncas_prefeitura', {
              p_prefeitura: municipalityId, p_reports: poleReports.slice(start, start + 500).map((report) => report.id),
            });
            if (linksError) throw linksError;
            (data || []).forEach((link) => linkedIds.add(link.report_id));
          }
          next = { ...next, ...suggestDemandAssignment(context, 'iluminacao'), titulo: 'Manutenção do poste ' + (pole.identifier || pole.plate || pole.id), category_id: 'iluminacao', endereco: pole.address || '', latitude: pole.latitude ?? '', longitude: pole.longitude ?? '', pole_id: pole.id, origem: 'vistoria' };
          if (active) setReports(poleReports.filter((report) => !linkedIds.has(report.id)).map((report) => ({ ...report, newLink: true })));
        }
        if (active) { setForm(next); setBaseline(JSON.stringify(next)); }
      } catch (failure) { if (active) setError(failure.message); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
    // Workspace data is read once when opening, so updates do not erase a draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, demandId, reportId, poleId, municipalityId, revision]);

  useEffect(() => {
    if (!open || !dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [open, dirty]);
  useEffect(() => {
    if (!open || !search.trim() || !municipalityId) { setMatches([]); setSearching(false); return undefined; }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const { data, error: failure } = await supabase.rpc('buscar_broncas_para_demanda', { p_prefeitura: municipalityId, p_busca: search.trim() });
        if (failure) throw failure;
        if (active) setMatches((data || []).filter((report) => !reports.some((linked) => linked.id === report.id)));
      } catch (failure) { if (active) setFormError(failure.message); }
      finally { if (active) setSearching(false); }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, municipalityId, search, reports]);

  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setFormError(''); };
  const addReport = async (report) => {
    if (linkingReport) return;
    setLinkingReport(true);
    try {
      const { data, error: failure } = await supabase.from('reports').select(reportFields).eq('id', report.id).eq('city_id', context.municipality.city_id).maybeSingle();
      if (failure) throw failure;
      if (!data) throw new Error('Bronca indisponível para vínculo nesta cidade.');
      setReports((current) => current.some((linked) => linked.id === data.id) ? current : [...current, { ...data, newLink: true }]);
      setSearch(''); setFormError('');
    } catch (failure) { setFormError(failure.message); }
    finally { setLinkingReport(false); }
  };
  const changeCategory = (categoryId) => {
    const rule = context.serviceRules.find((item) => item.category_id === categoryId);
    const assignment = suggestDemandAssignment(context, categoryId, item && !context.isAdministrator ? form.canal_id : '');
    setForm((current) => ({
      ...current, category_id: categoryId, ...assignment,
      atribuido_a: assignment.canal_id === current.canal_id ? current.atribuido_a || assignment.atribuido_a : assignment.atribuido_a,
      prioridade: item ? current.prioridade : rule?.prioridade || current.prioridade,
      prazo_em: current.prazo_em || (rule?.atendimento_horas ? localDateTime(new Date(Date.now() + rule.atendimento_horas * 3600000)) : ''),
      primeira_resposta_prazo_em: current.primeira_resposta_prazo_em || (rule?.primeira_resposta_horas ? localDateTime(new Date(Date.now() + rule.primeira_resposta_horas * 3600000)) : ''),
    }));
  };
  const changeChannel = (channelId) => {
    const assignment = suggestDemandAssignment(context, form.category_id, channelId);
    setForm((current) => ({ ...current, canal_id: channelId, atribuido_a: channelId ? assignment.atribuido_a : '' }));
  };
  const advance = (status) => {
    setForm((current) => ({ ...current, status, executada_em: ['aguardando_confirmacao', 'concluida'].includes(status) ? current.executada_em || localDateTime(new Date()) : current.executada_em }));
    if (!['aguardando_confirmacao', 'concluida'].includes(status)) setPendingFiles((current) => current.map((file) => ({ ...file, visibilidade: 'interna' })));
    setTab('atendimento'); setFormError('');
  };
  const addFiles = (event, tipo) => {
    const chosen = [...(event.target.files || [])];
    event.target.value = '';
    if (pendingFiles.length + chosen.length > 10) { setFormError('Envie no máximo 10 arquivos por atualização.'); return; }
    const failure = chosen.map(evidenceError).find(Boolean);
    if (failure) { setFormError(failure); return; }
    setFormError('');
    setPendingFiles((current) => [...current, ...chosen.map((file) => ({ id: crypto.randomUUID(), file, tipo, visibilidade: 'interna' }))]);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!editable || saving || locating || registering) return;
    if (isNew && stepIndex < visibleTabs.length - 1) { continueForm(); return; }
    const failure = validateDemand(form, { previousStatus: item?.status, reason });
    if (failure || (mustExplain && reason.trim().length < 5)) {
      setFormError(failure || 'Explique o motivo desta alteração.');
      setTab(form.titulo.trim().length < 3 ? 'dados' : failure?.startsWith('Informe latitude e longitude') || failure?.startsWith('Informe coordenadas') ? 'local' : 'atendimento');
      return;
    }
    setSaving(true); setFormError('');
    const uploaded = [];
    try {
      for (const pending of pendingFiles) {
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[pending.file.type];
        const storagePath = municipalityId + '/' + context.userId + '/' + pending.id + '.' + extension;
        const { error: uploadError } = await supabase.storage.from('municipal-demand-files').upload(storagePath, pending.file, { contentType: pending.file.type });
        if (uploadError) throw uploadError;
        uploaded.push({ storage_path: storagePath, nome: pending.file.name, mime_type: pending.file.type, tamanho: pending.file.size, tipo: pending.tipo, visibilidade: pending.tipo === 'conclusao' && canPublishConclusion ? pending.visibilidade : 'interna' });
      }
      const { data, error: saveError } = await supabase.rpc('salvar_demanda_municipal', {
        p_prefeitura: municipalityId, p_id: item?.id || crypto.randomUUID(), p_versao: item?.versao ?? null,
        p_dados: demandPayload(form), p_reports: reports.map((report) => report.id), p_anexos: uploaded,
        p_resposta_publica: publicResponse.trim() || null, p_nota_interna: internalNote.trim() || null, p_motivo: reason.trim() || null,
      });
      if (saveError) throw saveError;
      setBaseline(''); setPendingFiles([]);
      showAppNotice({ title: item ? 'Ordem de serviço atualizada' : 'Ordem de serviço criada', description: data.status === 'concluida' && reports.length ? 'Serviço concluído. A resolução das broncas segue sua própria verificação.' : undefined });
      onSaved(data.id);
    } catch (saveError) {
      if (uploaded.length) await supabase.storage.from('municipal-demand-files').remove(uploaded.map((file) => file.storage_path)).catch(() => {});
      const description = saveError.code === '23505' ? 'Uma destas broncas já possui atendimento. Abra a demanda vinculada para continuar.' : saveError.message;
      setFormError(description);
      showAppError({ title: 'Não foi possível salvar o atendimento', description });
    } finally { setSaving(false); }
  };

  const print = async () => {
    if (!item || printing || dirty) return;
    setPrinting(true);
    try {
      const { downloadServiceOrderPdf } = await import('@/utils/municipalServiceOrderPdf');
      const document = await loadMunicipalServiceOrder(supabase, context, item.id);
      await downloadServiceOrderPdf({ ...document, municipality: context.municipality, creatorName: context.userName });
    } catch (failure) { showAppError({ title: 'Não foi possível gerar o PDF da ordem', description: failure.message }); }
    finally { setPrinting(false); }
  };

  return <MunicipalDrawer open={open} onClose={close} busy={saving || registering} variant="demand" activeSection={tab}
    title={item?.protocolo || (demandId && demandId !== 'nova' ? 'Ordem de serviço' : 'Nova ordem de serviço')}
    description={item ? <span className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-status-progressBg px-2 py-0.5 text-xs font-bold text-status-progressFg">{DEMAND_STATUSES.find(([key]) => key === form.status)?.[1] || 'Em atendimento'}</span><span className="text-xs">{context.channels.find((channel) => String(channel.id) === String(form.canal_id))?.nome || 'Aguardando secretaria'}</span>{dirty && <span className="inline-flex items-center gap-1.5 rounded-md bg-status-pendingBg px-2 py-0.5 text-xs font-semibold text-status-pendingFg"><span className="h-1.5 w-1.5 rounded-full bg-current" />Não salvo</span>}</span> : 'Registre o serviço em etapas: dados, local, atendimento, anexos, comunicação e vínculos.'}
    headerAction={item && editable && dirty && <Button type="submit" form="municipal-demand-form" className="min-w-32 shadow-sm" disabled={saving || locating || registering || !form.titulo.trim()}>{saving ? 'Salvando…' : 'Salvar ordem'}</Button>}
    navigation={!loading && !error && <nav aria-label="Seções do atendimento" className="overflow-x-auto"><div className="flex min-w-max gap-1.5 rounded-xl bg-surface-subtle p-1.5">{visibleTabs.map(([key, title], index) => { const { icon: Icon } = tabDetails[key]; const selected = tab === key; return <button key={key} type="button" aria-current={selected ? (isNew ? 'step' : 'page') : undefined} disabled={locating || saving || registering} onClick={() => { setTab(key); setFormError(''); }} className={'group flex min-h-10 min-w-max items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 ' + (selected ? 'border-edge-subtle bg-surface-raised text-brand-subtleFg shadow-sm' : 'border-transparent text-content-secondary hover:bg-surface-raised hover:text-content-primary')}><Icon className="h-4 w-4 shrink-0" /><span>{title}{key === 'vinculos' && reports.length ? ` (${reports.length})` : ''}</span>{isNew && <span className="text-[10px] tabular-nums text-content-tertiary">{String(index + 1).padStart(2, '0')}</span>}</button>; })}</div></nav>}
    footer={isNew && !loading && !error && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
      {stepIndex > 0 && <Button type="button" variant="ghost" className="mr-auto" disabled={saving || locating || registering} onClick={() => setTab(visibleTabs[stepIndex - 1][0])}><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Button>}
      <Button type="button" variant="outline" disabled={saving || registering} onClick={close}>Cancelar</Button>
      {editable && <Button type="submit" form="municipal-demand-form" className="min-w-32 shadow-sm" disabled={saving || locating || registering || !form.titulo.trim()}>{saving ? 'Salvando…' : stepIndex < visibleTabs.length - 1 ? <>Continuar<ArrowRight className="ml-2 h-4 w-4" /></> : 'Criar ordem de serviço'}</Button>}
    </div>}
    >
    {loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
      : error ? <div className="space-y-3"><p role="alert" className="text-sm text-danger">{error}</p><Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</Button></div>
        : <form id="municipal-demand-form" onSubmit={save} className="min-w-0 space-y-5">
          <fieldset disabled={saving || registering} className="min-w-0 space-y-5">
          {item?.revisao_pendente && <div role="status" className="rounded-xl border border-danger/25 bg-danger-subtleBg p-4 text-sm text-danger-subtleFg"><AlertCircle className="mr-2 inline h-4 w-4" />Há uma manifestação da comunidade que precisa de revisão. Consulte o histórico e reabra o atendimento se houver trabalho pendente.</div>}
          {!editable && <p className="rounded-xl bg-surface-subtle p-3 text-sm text-content-secondary">Você tem acesso de consulta a este atendimento.</p>}
          {formError && <div role="alert" className="space-y-2 rounded-xl border border-danger/30 bg-danger-subtleBg p-3 text-sm text-danger-subtleFg"><p>{formError}</p>{item && <Button type="button" variant="outline" size="sm" onClick={() => { if (!dirty || window.confirm('Recarregar o atendimento e descartar as alterações locais?')) setRevision((value) => value + 1); }}>Recarregar atendimento</Button>}</div>}
          {tab === 'dados' && <section className="min-w-0 w-full space-y-5 rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
              <SectionHeading icon={FileText} title="Informações do serviço" description="Comece pelo que precisa ser feito e pela prioridade." />
              <div className="grid min-w-0 gap-4">
                <Field title={<>Título <span className="text-danger">*</span></>}><Input className="mt-2" placeholder="Ex.: Correção de buraco na rua…" minLength={3} maxLength={180} value={form.titulo} onChange={(event) => update('titulo', event.target.value)} disabled={!editable} /></Field>
                <div className="grid min-w-0 gap-4 sm:grid-cols-2"><Field title="Categoria"><select className={selectClass} value={form.category_id} onChange={(event) => changeCategory(event.target.value)} disabled={!editable}><option value="">Selecione a categoria</option>{context.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field><Field title="Prioridade"><select className={selectClass} value={form.prioridade} onChange={(event) => update('prioridade', event.target.value)} disabled={!editable}>{DEMAND_PRIORITIES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
              </div>
              <Field title="Descrição"><textarea className={selectClass + ' mt-2 min-h-40 resize-y py-3'} placeholder="Descreva o problema, detalhes e observações…" maxLength={10000} value={form.descricao} onChange={(event) => update('descricao', event.target.value)} disabled={!editable} /></Field>
              <div className="grid min-w-0 gap-4 border-t border-edge-subtle pt-4 sm:grid-cols-2"><Field title="Origem do pedido"><select className={selectClass} value={form.origem} onChange={(event) => update('origem', event.target.value)} disabled={!editable || Boolean(reports.length)}>{[['interno','Registro interno'],['bronca','Bronca pública'],['telefone','Telefone'],['presencial','Atendimento presencial'],['vistoria','Vistoria']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field title="Protocolo externo (opcional)"><Input className="h-10" placeholder="Se houver" value={form.protocolo_externo} onChange={(event) => update('protocolo_externo', event.target.value)} disabled={!editable} /></Field></div>
              {form.pole_id && <p className="rounded-lg bg-brand-subtleBg p-3 text-xs text-brand">Este atendimento está vinculado ao poste cadastrado #{form.pole_id}.</p>}
              {item && <div className="flex justify-end border-t border-edge-subtle pt-4"><Button type="button" variant="outline" disabled={printing || saving || registering || dirty} title={dirty ? 'Salve as alterações para baixar a ordem atualizada' : 'Baixar a ordem registrada'} onClick={print}>{printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}PDF da ordem</Button></div>}
          </section>}
          {tab === 'local' && <div className="max-w-4xl"><MunicipalDemandLocation form={form} reports={reports} municipality={context.municipality} editable={editable} busy={saving} onLocatingChange={setLocating} onChange={(values) => { setForm((current) => ({ ...current, ...values })); setFormError(''); }} /></div>}
          {tab === 'atendimento' && <div className="space-y-5">
            <section className="min-w-0 rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <Field title={<>Secretaria {requiresChannel && <span className="text-danger">*</span>}</>}><select className={selectClass} value={form.canal_id} onChange={(event) => changeChannel(event.target.value)} disabled={!editable || Boolean(item && !context.isAdministrator)}><option value="">Aguardando distribuição</option>{availableChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.nome}</option>)}</select></Field>
                <Field title="Etapa do serviço"><select aria-label="Etapa do serviço" className={selectClass} value={form.status} onChange={(event) => advance(event.target.value)} disabled={!editable}>{DEMAND_STATUSES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              </div>
              {editable && item && <div className="mt-4 flex flex-wrap gap-2">
                {!['concluida','cancelada','recusada'].includes(form.status) ? <><Button type="button" variant="outline" size="sm" onClick={() => advance('em_andamento')} disabled={form.status === 'em_andamento'}><Play className="mr-1 h-4 w-4" />Iniciar</Button><Button type="button" size="sm" onClick={() => advance('concluida')}><CheckCircle2 className="mr-1 h-4 w-4" />Concluir serviço</Button></> : <Button type="button" variant="outline" size="sm" onClick={() => advance('triagem')}><RotateCcw className="mr-1 h-4 w-4" />Reabrir atendimento</Button>}
              </div>}
              {form.status === 'programada' && <div className="mt-4"><Field title="Previsão de execução *"><Input aria-label="Previsão de execução" className="h-10" type="datetime-local" value={form.previsto_em} onChange={(event) => update('previsto_em', event.target.value)} disabled={!editable} /></Field></div>}
              {waiting && <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field title="Motivo da pendência *"><textarea className={selectClass + ' min-h-24 py-3'} value={form.motivo_pendencia} onChange={(event) => update('motivo_pendencia', event.target.value)} disabled={!editable} /></Field><Field title="Revisar pendência em *"><Input type="datetime-local" value={form.proxima_acao_em} onChange={(event) => update('proxima_acao_em', event.target.value)} disabled={!editable} /></Field></div>}
              {mustExplain && <div className="mt-4"><Field title="Motivo da alteração *"><textarea className={selectClass + ' min-h-24 py-3'} minLength={5} maxLength={4000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={!editable} /></Field></div>}
              {execution && <div className="mt-5 space-y-4 border-t border-edge-subtle pt-5">
                <Field title="Foto do serviço (opcional)"><input type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-edge-default file:bg-surface-subtle file:px-3 file:py-2 file:font-semibold" onChange={(event) => addFiles(event, 'conclusao')} disabled={!editable || saving} /></Field>
                {pendingFiles.filter((file) => file.tipo === 'conclusao').map((file) => <div key={file.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-subtle p-3 text-xs"><span className="min-w-0 flex-1 break-words font-semibold">{file.file.name}</span>{reports.length > 0 && <label className="flex items-center gap-1.5"><input type="checkbox" checked={file.visibilidade === 'publica'} onChange={(event) => setPendingFiles((current) => current.map((entry) => entry.id === file.id ? { ...entry, visibilidade: event.target.checked ? 'publica' : 'interna' } : entry))} disabled={!editable} />Mostrar na bronca</label>}<Button type="button" variant="ghost" size="icon" aria-label={'Retirar foto ' + file.file.name} onClick={() => setPendingFiles((current) => current.filter((entry) => entry.id !== file.id))}><X className="h-4 w-4" /></Button></div>)}
                <details className="rounded-lg border border-edge-subtle p-3" open={Boolean(form.resultado) || undefined}><summary className="cursor-pointer text-xs font-semibold">Observação (opcional)</summary><textarea className={selectClass + ' mt-3 min-h-24 py-3'} maxLength={4000} value={form.resultado} onChange={(event) => update('resultado', event.target.value)} disabled={!editable} /></details>
              </div>}
            </section>
            <details className="min-w-0 rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
              <summary className="cursor-pointer text-sm font-semibold">Responsável e prazos (opcional)</summary>
              <div className="mt-5 space-y-5 border-t border-edge-subtle pt-5">
                <section><Field title="Responsável na plataforma (opcional)"><select aria-label="Responsável na plataforma (opcional)" className={selectClass} value={form.atribuido_a} onChange={(event) => update('atribuido_a', event.target.value)} disabled={!editable || !form.canal_id}><option value="">Definir depois</option>{form.atribuido_a && !eligibleMembers.some((member) => member.user_id === form.atribuido_a) && <option value={form.atribuido_a}>{item?.responsavel?.name || 'Responsável anterior'} (vínculo inativo)</option>}{eligibleMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.perfil?.name || 'Membro da equipe'}</option>)}</select></Field>
                  {editable && context.isAdministrator && <div className="mt-4"><Button type="button" size="sm" variant="outline" disabled={!form.canal_id} aria-expanded={inviteResponsible} aria-controls="demand-responsible-registration" onClick={() => setInviteResponsible((value) => !value)}><UserPlus className="mr-1.5 h-3.5 w-3.5" />{inviteResponsible ? 'Fechar convite' : 'Convidar responsável'}</Button></div>}
                  {editable && context.isAdministrator && inviteResponsible && form.canal_id && <div id="demand-responsible-registration" className="mt-4"><MunicipalResponsibleInvite key={form.canal_id} channel={context.channels.find((channel) => String(channel.id) === String(form.canal_id))} onBusyChange={setRegistering} onMembersLoaded={(members) => setExtraMembers((current) => [...current.filter((member) => String(member.canal_id) !== String(form.canal_id)), ...members])} /></div>}
                </section>
                <section className="grid min-w-0 gap-4 sm:grid-cols-2"><Field title="Prazo de atendimento"><Input type="datetime-local" value={form.prazo_em} onChange={(event) => update('prazo_em', event.target.value)} disabled={!editable} /></Field><Field title="Prazo da primeira resposta"><Input type="datetime-local" value={form.primeira_resposta_prazo_em} onChange={(event) => update('primeira_resposta_prazo_em', event.target.value)} disabled={!editable || Boolean(item?.primeira_resposta_em)} /></Field><Field title="Próxima ação"><Input value={form.proxima_acao} onChange={(event) => update('proxima_acao', event.target.value)} disabled={!editable} /></Field>{!waiting && <Field title="Data da próxima ação"><Input type="datetime-local" value={form.proxima_acao_em} onChange={(event) => update('proxima_acao_em', event.target.value)} disabled={!editable} /></Field>}</section>
                {execution && <section className="grid min-w-0 gap-4 sm:grid-cols-2"><Field title="Executado em"><Input type="datetime-local" value={form.executada_em} onChange={(event) => update('executada_em', event.target.value)} disabled={!editable} /></Field><Field title="Registro técnico (opcional)"><textarea className={selectClass + ' min-h-24 py-3'} maxLength={4000} value={form.registro_execucao} onChange={(event) => update('registro_execucao', event.target.value)} disabled={!editable} /></Field></section>}
              </div>
            </details>
          </div>}
          {tab === 'anexos' && <MunicipalDemandAttachmentsTab files={attachments} pendingFiles={pendingFiles} editable={editable} busy={saving || registering} canPublish={canPublishConclusion} onAdd={addFiles} onTogglePublic={(id, checked) => setPendingFiles((current) => current.map((file) => file.id === id ? { ...file, visibilidade: checked ? 'publica' : 'interna' } : file))} onRemove={(id) => setPendingFiles((current) => current.filter((file) => file.id !== id))} />}
          {tab === 'comunicacao' && <div className="grid min-w-0 gap-5 lg:grid-cols-2">
            <section className="space-y-3 rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5"><SectionHeading icon={MessageSquare} title="Comunicação com o cidadão" description="Opcional. Use quando houver uma bronca vinculada." tone="blue" /><Field title="Resposta oficial" hint={reports.length ? 'Será publicada nas broncas vinculadas, com a identificação da secretaria.' : 'Vincule uma bronca na próxima etapa para habilitar a resposta.'}><textarea className={selectClass + ' min-h-40 py-3'} maxLength={4000} placeholder="Informe o andamento do serviço ao cidadão…" value={publicResponse} onChange={(event) => setPublicResponse(event.target.value)} disabled={!editable || !reports.length} /></Field>{editable && reports.length > 0 && <Button type="button" variant="outline" size="sm" onClick={() => setPublicResponse(suggestedPublicResponse(form))} disabled={!suggestedPublicResponse(form)}>Usar sugestão da etapa</Button>}</section>
            <section className="rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5"><SectionHeading icon={Lock} title="Anotações da equipe" description="Opcional. Visível apenas para a equipe municipal." tone="neutral" /><Field title="Nota interna" hint="Registre orientações, contatos ou observações para a equipe."><textarea className={selectClass + ' min-h-40 py-3'} maxLength={4000} placeholder="O que a equipe precisa saber?" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} disabled={!editable} /></Field></section>
          </div>}
          {tab === 'vinculos' && <div className="space-y-5">{isNew && <section className="rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5"><SectionHeading icon={CheckCircle2} title="Confira a ordem antes de criar" description="A ordem pode ser criada sem responsável na plataforma e sem bronca vinculada." tone="blue" /><h3 className="break-words text-base font-semibold">{form.titulo || 'Informe o título do serviço'}</h3><dl className="mt-4 grid grid-cols-2 gap-4">{[
            ['Secretaria', context.channels.find((channel) => channel.id === form.canal_id)?.nome || 'Aguardando distribuição'],
            ['Responsável', eligibleMembers.find((member) => member.user_id === form.atribuido_a)?.perfil?.name || (form.atribuido_a ? item?.responsavel?.name || 'Responsável selecionado' : 'Definir depois')],
            ['Prioridade', DEMAND_PRIORITIES.find(([key]) => key === form.prioridade)?.[1]],
            ['Etapa', DEMAND_STATUSES.find(([key]) => key === form.status)?.[1]],
          ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-content-secondary">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value}</dd></div>)}</dl></section>}
          <section className="space-y-4 rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5">
            <SectionHeading icon={Link2} title="Broncas vinculadas (opcional)" description="Agrupe relatos sobre o mesmo problema. Cada bronca mantém suas fotos, apoios e verificação." tone="neutral" />
            {!reports.length && <p className="text-sm text-content-tertiary">Nenhuma bronca vinculada.</p>}
            {reports.map((report) => <div key={report.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-edge-subtle p-4"><div className="min-w-0 flex-1"><Link to={'/prefeitura/broncas?bronca=' + report.id} className="break-words text-sm font-bold text-brand">{report.title}</Link><p className="mt-1 text-xs text-content-secondary">{[report.address, report.neighborhood].filter(Boolean).join(' · ')}</p><p className="mt-1 text-xs">{report.newLink ? 'Será vinculada ao salvar' : report.status === 'resolved' ? 'Resolução verificada' : 'Relato ainda não resolvido'}</p></div>{report.newLink && <Button type="button" size="icon" variant="ghost" aria-label={'Retirar vínculo de ' + report.title} onClick={() => setReports((current) => current.filter((entry) => entry.id !== report.id))}><X className="h-4 w-4" /></Button>}</div>)}
            {editable && !['concluida','cancelada','recusada'].includes(form.status) && <><label className="relative block"><span className="sr-only">Buscar broncas para vincular</span><Search className="absolute left-3 top-3 h-4 w-4 text-content-tertiary" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Buscar bronca por título, endereço ou bairro" /></label>{searching ? <p className="text-sm text-content-secondary">Buscando relatos…</p> : search && !matches.length ? <p className="text-sm text-content-tertiary">Nenhuma bronca disponível para este vínculo.</p> : matches.map((report) => <button key={report.id} type="button" disabled={linkingReport} className="block w-full rounded-xl border border-edge-subtle p-3 text-left hover:bg-surface-subtle disabled:opacity-60" onClick={() => addReport(report)}><strong className="block break-words text-sm">{report.title}</strong><span className="mt-1 block text-xs text-content-secondary">{report.address || report.neighborhood || 'Sem endereço'}</span><span className="mt-2 block text-xs font-bold text-brand">{linkingReport ? 'Carregando local…' : 'Vincular ao atendimento'}</span></button>)}</>}
          </section></div>}
          {tab === 'historico' && <MunicipalDemandHistory events={events} context={context} />}
          </fieldset>
        </form>}
  </MunicipalDrawer>;
}
