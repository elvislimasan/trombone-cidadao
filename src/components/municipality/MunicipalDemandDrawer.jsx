import { poleCode, poleReferenceText } from '@/lib/poleDisplay';
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3, Download, FileText, Link2, Loader2, Lock, MapPin, MessageSquare, Paperclip, Play, RotateCcw, Search, Trash2, UserPlus, X } from 'lucide-react';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import MunicipalDemandHistory from '@/components/municipality/MunicipalDemandHistory';
import MunicipalDemandAttachmentsTab from '@/components/municipality/MunicipalDemandAttachmentsTab';
import MunicipalDemandLocation from '@/components/municipality/MunicipalDemandLocation';
import MunicipalResponsibleInvite from '@/components/municipality/MunicipalResponsibleInvite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError, showAppNotice } from '@/lib/appError';
import { confirmApp } from '@/lib/appConfirm';
import { DEMAND_INITIAL_FORM, DEMAND_STATUSES, DEMAND_PRIORITIES, canEditDemand, demandConclusionBlocked, demandPayload, evidenceError, formFromReport, localDateTime, suggestDemandAssignment, suggestedPublicResponse, validateDemandFields } from '@/lib/municipalDemand';
import { loadMunicipalServiceOrder } from '@/lib/municipalServiceOrder';
import { collectExportRows } from '@/lib/municipalExport';
import { TIPOS_DE_PROBLEMA_ESGOTO, TIPOS_DE_PROBLEMA_ILUMINACAO } from '@/lib/reportCategoryFields';

const selectClass = 'h-10 w-full min-w-0 rounded-lg border border-edge-default bg-surface-subtle px-3 text-sm font-normal text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60';
const textAreaClass = 'w-full min-w-0 rounded-lg border border-edge-default bg-surface-subtle px-3 py-2 text-sm font-normal text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60';
const reportFields = 'id,title,description,address,neighborhood,category_id,issue_type,city_id,moderation_status,is_petition,location,pole_id,status';
const tabs = [['dados', 'Dados'], ['local', 'Local'], ['atendimento', 'Atendimento'], ['anexos', 'Anexos'], ['comunicacao', 'Comunicação'], ['vinculos', 'Vínculos'], ['historico', 'Histórico']];
const tabDetails = {
  dados: { icon: FileText, detail: 'Informações do serviço' },
  local: { icon: MapPin, detail: 'Mapa e endereço' },
  atendimento: { icon: CalendarDays, detail: 'Equipe e prazos' },
  anexos: { icon: Paperclip, detail: 'Execução e conclusão' },
  comunicacao: { icon: MessageSquare, detail: 'Respostas e notas' },
  vinculos: { icon: Link2, detail: 'Solicitações relacionadas' },
  historico: { icon: Clock3, detail: 'Movimentações' },
};
const dateFields = ['prazo_em', 'previsto_em', 'primeira_resposta_prazo_em', 'proxima_acao_em', 'executada_em'];
function Field({ title, children, hint, error, className = '' }) {
  const errorId = React.useId();
  return <label className={'flex min-w-0 flex-col text-xs font-semibold [&>input]:mt-0 [&>select]:mt-0 [&>textarea]:mt-0 ' + className}>
    <span className="mb-1.5 min-h-5 leading-5 text-content-primary">{title}</span>
    {React.Children.map(children, (child) => React.isValidElement(child) ? React.cloneElement(child, {
      'aria-invalid': error ? true : undefined,
      'aria-describedby': [child.props['aria-describedby'], error && errorId].filter(Boolean).join(' ') || undefined,
      className: (child.props.className || '') + (error ? ' border-danger focus-visible:ring-danger' : ''),
    }) : child)}
    {error && <span id={errorId} role="alert" className="mt-1.5 text-xs font-normal text-danger">{error}</span>}
    {hint && <span className="mt-1.5 block text-xs font-normal leading-5 text-content-secondary">{hint}</span>}
  </label>;
}
function SectionHeading({ icon: Icon, title, description, tone = 'brand' }) { return <div className="mb-2 flex items-start gap-3"><span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + (tone === 'blue' ? 'bg-status-progressBg text-status-progressFg' : tone === 'neutral' ? 'bg-surface-subtle text-content-secondary' : 'bg-brand-subtleBg text-brand')}><Icon className="h-4 w-4" /></span><div className="min-w-0"><h2 className="text-sm font-semibold">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-content-secondary">{description}</p>}</div></div>; }

export default function MunicipalDemandDrawer({ open, demandId, reportId, poleId, context, onClose, onSaved, onRemoved, inline = false }) {
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
  const [fileErrors, setFileErrors] = useState({});
  const [validationScope, setValidationScope] = useState('');
  const [focusAttempt, setFocusAttempt] = useState(0);
  const [baseline, setBaseline] = useState('');
  const [revision, setRevision] = useState(0);
  const [inviteResponsible, setInviteResponsible] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [extraMembers, setExtraMembers] = useState([]);
  const municipalityId = context.municipality?.id;
  const electricianMode = Boolean(context.isElectrician && item?.atribuido_a === context.userId && context.electricianChannelIds?.includes(String(item.canal_id)));
  const editable = item ? canEditDemand(context, item.canal_id) || electricianMode : context.canEdit;
  const canDeleteOrder = Boolean(item && editable && !electricianMode && (context.isAdministrator || item.criado_por === context.userId));
  const deletableStatus = ['aberta', 'triagem', 'cancelada'].includes(item?.status);
  const availableChannels = item && !context.isAdministrator ? context.channels.filter((channel) => channel.id === item.canal_id) : context.channels.filter((channel) => canEditDemand(context, channel.id));
  const eligibleMembers = useMemo(() => [...new Map([...context.members, ...extraMembers].map((member) => [String(member.canal_id) + ':' + member.user_id, member])).values()].filter((member) => String(member.canal_id) === String(form.canal_id) && member.ativo && (['gestor', 'operador'].includes(member.papel) || (form.category_id === 'iluminacao' && member.papel === 'eletricista'))), [context.members, extraMembers, form.canal_id, form.category_id]);
  const dirty = Boolean(baseline && (JSON.stringify(form) !== baseline || publicResponse || internalNote || reason || pendingFiles.length || reports.some((report) => report.newLink)));
  const mustExplain = (['cancelada', 'recusada'].includes(form.status) && form.status !== item?.status)
    || (item && ['concluida', 'cancelada', 'recusada', 'aguardando_confirmacao'].includes(item.status) && !['concluida', 'cancelada', 'recusada', 'aguardando_confirmacao'].includes(form.status))
    || (item && form.canal_id !== (item.canal_id || ''));
  const conclusionBlocked = demandConclusionBlocked(form, reports);
  const validationErrors = validateDemandFields(form, { previousStatus: item?.status, reason, electricianMode, reports });
  if (mustExplain && reason.trim().length < 5 && !validationErrors.reason) validationErrors.reason = 'Explique o motivo desta alteração.';
  const fieldErrors = validationScope === 'all' ? validationErrors : validationScope === 'title' && validationErrors.titulo ? { titulo: validationErrors.titulo } : {};
  useEffect(() => {
    if (focusAttempt) document.getElementById('municipal-demand-form')?.querySelector('[aria-invalid="true"]')?.focus();
  }, [focusAttempt]);
  const execution = ['concluida', 'aguardando_confirmacao'].includes(form.status);
  const preparingLinkedResolution = !electricianMode && item && form.category_id === 'iluminacao'
    && !['concluida', 'cancelada', 'recusada'].includes(form.status) && reports.some((report) => report.status !== 'resolved');
  const canPublishConclusion = execution && reports.length > 0;
  const waiting = ['aguardando_informacao', 'aguardando_recurso'].includes(form.status);
  const requiresChannel = !context.isAdministrator || ['programada', 'em_andamento', 'aguardando_confirmacao', 'concluida'].includes(form.status);
  const isNew = !demandId || demandId === 'nova';
  const visibleTabs = tabs.filter(([key]) => electricianMode ? ['atendimento', 'anexos', 'historico'].includes(key) : key !== 'historico' || !isNew);
  const statusOptions = electricianMode ? DEMAND_STATUSES.filter(([value]) => ['concluida', 'cancelada', 'recusada'].includes(item.status) ? value === item.status : [form.status, 'em_andamento', 'concluida'].includes(value)) : DEMAND_STATUSES;
  const stepIndex = visibleTabs.findIndex(([key]) => key === tab);
  const continueForm = () => {
    if (tab === 'dados' && form.titulo.trim().length < 3) { setValidationScope('title'); setFocusAttempt((value) => value + 1); return; }
    setFormError(''); setTab(visibleTabs[stepIndex + 1][0]);
  };
  const close = async () => { if (!saving && !registering && (!dirty || await confirmApp({ title: 'Descartar alterações?', description: 'Há alterações não salvas neste atendimento. Deseja fechar mesmo assim?', confirmLabel: 'Descartar alterações', destructive: true }))) onClose(); };

  useEffect(() => {
    if (!open || !municipalityId) return undefined;
    let active = true;
    setItem(null); setReports([]); setEvents([]); setAttachments([]); setPendingFiles([]); setForm(DEMAND_INITIAL_FORM);
    setTab('dados'); setPublicResponse(''); setInternalNote(''); setReason(''); setSearch(''); setMatches([]); setLinkingReport(false);
    setError(''); setFormError(''); setValidationScope(''); setFileErrors({}); setBaseline(''); setLoading(true);
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
          next.titulo = poleReferenceText(next.titulo);
          dateFields.forEach((key) => { next[key] = localDateTime(detail.data[key]); });
          if (active) { setItem(detail.data); if (context.isElectrician && detail.data.atribuido_a === context.userId) setTab('atendimento'); setReports((links.data || []).map((link) => link.report).filter(Boolean)); setEvents(history.data || []); setAttachments(files.data || []); }
        } else if (reportId) {
          const result = await supabase.from('reports').select(reportFields).eq('id', reportId).eq('city_id', context.municipality.city_id)
            .or(`moderation_status.eq.approved,moderation_status.is.null,and(created_by_municipality.eq.${municipalityId},moderation_status.eq.internal)`).or('is_petition.eq.false,is_petition.is.null').maybeSingle();
          if (result.error) throw result.error;
          if (!result.data || result.data.status === 'duplicate') throw new Error('Solicitação indisponível para vínculo nesta cidade.');
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
          next = { ...next, ...suggestDemandAssignment(context, 'iluminacao'), titulo: 'Manutenção do poste ' + poleCode(pole.identifier || pole.plate || pole.id), category_id: 'iluminacao', endereco: pole.address || '', latitude: pole.latitude ?? '', longitude: pole.longitude ?? '', pole_id: pole.id, origem: 'vistoria' };
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
        if (active) setMatches((data || []).filter((report) => context.enabledCategoryIds?.includes(report.category_id) && (form.category_id !== 'iluminacao' || report.category_id === 'iluminacao') && !reports.some((linked) => linked.id === report.id)));
      } catch (failure) { if (active) setFormError(failure.message); }
      finally { if (active) setSearching(false); }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, municipalityId, context.enabledCategoryIds, search, reports, form.category_id]);

  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setFormError(''); };
  const addReport = async (report) => {
    if (linkingReport) return;
    setLinkingReport(true);
    try {
      const { data, error: failure } = await supabase.from('reports').select(reportFields).eq('id', report.id).eq('city_id', context.municipality.city_id).maybeSingle();
      if (failure) throw failure;
      if (!data) throw new Error('Solicitação indisponível para vínculo nesta cidade.');
      if (!context.enabledCategoryIds?.includes(data.category_id)) throw new Error('Esta categoria não está habilitada para a prefeitura.');
      if (form.category_id === 'iluminacao' && data.category_id !== 'iluminacao') throw new Error('Ordens de iluminação só podem receber solicitações de iluminação.');
      setReports((current) => current.some((linked) => linked.id === data.id) ? current : [...current, { ...data, newLink: true }]);
      setSearch(''); setFormError('');
    } catch (failure) { setFormError(failure.message); }
    finally { setLinkingReport(false); }
  };
  const changeCategory = (categoryId) => {
    if (categoryId === 'iluminacao' && reports.some((report) => report.category_id !== 'iluminacao')) {
      setFormError('Retire as solicitações de outras categorias antes de escolher iluminação.'); return;
    }
    const rule = context.serviceRules.find((item) => item.category_id === categoryId);
    const assignment = suggestDemandAssignment(context, categoryId, item && !context.isAdministrator ? form.canal_id : '');
    const assignedElectrician = context.members.some((member) => member.user_id === form.atribuido_a && member.papel === 'eletricista');
    setForm((current) => ({
      ...current, category_id: categoryId, issue_type: '', service_type: categoryId === 'iluminacao' ? current.service_type : '', service_types: categoryId === 'iluminacao' ? current.service_types : [], pole_id: categoryId === 'iluminacao' ? current.pole_id : '', ...assignment,
      atribuido_a: categoryId !== 'iluminacao' && assignedElectrician ? '' : assignment.canal_id === current.canal_id ? current.atribuido_a || assignment.atribuido_a : assignment.atribuido_a,
      prioridade: item ? current.prioridade : rule?.prioridade || current.prioridade,
      prazo_em: current.prazo_em || (rule?.atendimento_horas ? localDateTime(new Date(Date.now() + rule.atendimento_horas * 3600000)) : ''),
      primeira_resposta_prazo_em: current.primeira_resposta_prazo_em || (rule?.primeira_resposta_horas ? localDateTime(new Date(Date.now() + rule.primeira_resposta_horas * 3600000)) : ''),
    }));
  };
  const changeChannel = (channelId) => {
    const assignment = suggestDemandAssignment(context, form.category_id, channelId);
    setForm((current) => ({ ...current, canal_id: channelId, atribuido_a: channelId ? assignment.atribuido_a : '' }));
  };
  const advance = (status, showDetails = true) => {
    if (status === 'concluida' && conclusionBlocked) { setTab('vinculos'); setFormError('Registre a resolução de cada solicitação vinculada antes de concluir a ordem.'); return; }
    setForm((current) => ({ ...current, status, executada_em: ['aguardando_confirmacao', 'concluida'].includes(status) ? current.executada_em || localDateTime(new Date()) : current.executada_em }));
    if (!['aguardando_confirmacao', 'concluida'].includes(status)) setPendingFiles((current) => current.map((file) => ({ ...file, visibilidade: 'interna' })));
    if (showDetails || ['cancelada', 'recusada', 'programada', 'aguardando_informacao', 'aguardando_recurso', 'concluida', 'aguardando_confirmacao'].includes(status)) setTab('atendimento');
    setFormError('');
  };
  const resolveLinkedReport = async (report) => {
    if (!item || dirty || saving || !editable || electricianMode) return;
    if (!await confirmApp({ title: 'Registrar resolução desta solicitação?', description: `Confirme que o problema de “${report.title}” foi resolvido. O resultado e os serviços salvos na ordem serão registrados para esta solicitação. A última resolução conclui a ordem.`, confirmLabel: 'Registrar resolução' })) return;
    setSaving(true); setFormError('');
    try {
      const { data, error: failure } = await supabase.rpc('registrar_resolucao_solicitacao_municipal', {
        p_prefeitura: municipalityId, p_ordem: item.id, p_report: report.id, p_versao: item.versao,
        p_resultado: form.resultado.trim() || null,
        p_servicos: form.service_types?.length ? form.service_types : form.service_type ? [form.service_type] : [],
      });
      if (failure) throw failure;
      showAppNotice({ title: data.status === 'concluida' ? 'Solicitação resolvida e ordem concluída' : 'Solicitação resolvida' });
      setRevision((value) => value + 1); onSaved(data.id);
    } catch (failure) { setFormError(failure.message); }
    finally { setSaving(false); }
  };
  const removeOrder = async () => {
    if (!canDeleteOrder || !deletableStatus || saving) return;
    if (!await confirmApp({ title: 'Excluir esta ordem?', description: `A ordem ${item.protocolo}, o histórico interno e os anexos deixarão de aparecer. As solicitações vinculadas permanecerão cadastradas. Esta ação não pode ser desfeita.`, confirmLabel: 'Excluir ordem', destructive: true })) return;
    setSaving(true); setFormError('');
    const { error: failure } = await supabase.rpc('excluir_demanda_municipal', { p_prefeitura: municipalityId, p_demanda: item.id });
    setSaving(false);
    if (failure) { setFormError(failure.message); return; }
    showAppNotice({ title: 'Ordem excluída' });
    onRemoved?.(item.id);
  };
  const addFiles = (event, tipo) => {
    const chosen = [...(event.target.files || [])];
    event.target.value = '';
    if (pendingFiles.length + chosen.length > 10) { setFileErrors((current) => ({ ...current, [tipo]: 'Envie no máximo 10 arquivos por atualização.' })); return; }
    const failure = chosen.map(evidenceError).find(Boolean);
    if (failure) { setFileErrors((current) => ({ ...current, [tipo]: failure })); return; }
    setFormError('');
    setFileErrors((current) => ({ ...current, [tipo]: '' }));
    setPendingFiles((current) => [...current, ...chosen.map((file) => ({ id: crypto.randomUUID(), file, tipo, visibilidade: 'interna' }))]);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!editable || saving || locating || registering) return;
    if (isNew && stepIndex < visibleTabs.length - 1) { continueForm(); return; }
    if (!context.enabledCategoryIds?.includes(form.category_id)) {
      setTab('dados');
      setFormError('Selecione uma categoria habilitada para a prefeitura.');
      return;
    }
    setValidationScope('all');
    if (Object.keys(validationErrors).length) {
      setFormError('');
      setTab(validationErrors.titulo || validationErrors.category_id ? 'dados' : validationErrors.latitude || validationErrors.longitude ? 'local' : validationErrors.service_type || validationErrors.resultado ? 'anexos' : 'atendimento');
      setFocusAttempt((value) => value + 1);
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
      showAppNotice({ title: item ? 'Ordem de serviço atualizada' : 'Ordem de serviço criada', description: data.status === 'concluida' && reports.length ? 'Ordem concluída após a resolução das solicitações vinculadas.' : undefined });
      onSaved(data.id);
    } catch (saveError) {
      if (uploaded.length) await supabase.storage.from('municipal-demand-files').remove(uploaded.map((file) => file.storage_path)).catch(() => {});
      const description = saveError.code === '23505' ? 'Uma destas solicitações já possui atendimento. Abra a demanda vinculada para continuar.' : saveError.message;
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

  return <MunicipalDrawer open={open} onClose={close} busy={saving || registering} variant="demand" inline={inline} activeSection={tab}
    title={item?.protocolo || (demandId && demandId !== 'nova' ? 'Ordem de serviço' : 'Nova ordem de serviço')}
    description={item ? <span className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-status-progressBg px-2 py-0.5 text-xs font-bold text-status-progressFg">{DEMAND_STATUSES.find(([key]) => key === form.status)?.[1] || 'Em atendimento'}</span><span className="text-xs">{context.channels.find((channel) => String(channel.id) === String(form.canal_id))?.nome || 'Aguardando secretaria'}</span>{dirty && <span className="inline-flex items-center gap-1.5 rounded-md bg-status-pendingBg px-2 py-0.5 text-xs font-semibold text-status-pendingFg"><span className="h-1.5 w-1.5 rounded-full bg-current" />Não salvo</span>}</span> : 'Registre o serviço em etapas: dados, local, atendimento, anexos, comunicação e vínculos.'}
    headerAction={item && editable && <div className="flex flex-wrap items-center gap-2"><label className="text-xs font-semibold">Status da ordem<select aria-label="Alterar status da ordem" className={selectClass + ' mt-1 min-w-40'} value={form.status} onChange={(event) => advance(event.target.value, false)} disabled={saving}>{statusOptions.map(([value, label]) => <option key={value} value={value} disabled={value === 'concluida' && conclusionBlocked}>{label}</option>)}</select></label>{dirty && <Button type="submit" form="municipal-demand-form" className="min-w-32 shadow-sm" disabled={saving || locating || registering || !form.titulo.trim()}>{saving ? 'Salvando…' : 'Salvar ordem'}</Button>}{canDeleteOrder && <Button type="button" variant="outline" size="sm" disabled={saving || !deletableStatus} title={!deletableStatus ? 'Cancele e salve a ordem antes de excluí-la.' : undefined} onClick={removeOrder}><Trash2 className="mr-1.5 h-4 w-4" />Excluir ordem</Button>}</div>}
    navigation={!loading && !error && (inline && isNew ? <nav aria-label="Etapas da ordem de serviço"><ol className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{visibleTabs.map(([key, title], index) => { const { icon: Icon, detail } = tabDetails[key]; const selected = tab === key; return <li key={key} className="min-w-0"><button type="button" aria-current={selected ? 'step' : undefined} disabled={locating || saving || registering} onClick={() => { setTab(key); setFormError(''); }} className={'flex min-h-16 w-full min-w-0 flex-col justify-between gap-1 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 ' + (selected ? 'border-brand bg-brand text-content-onBrand shadow-sm' : 'border-edge-subtle bg-surface-subtle text-content-primary hover:border-brand/40 hover:bg-brand-subtleBg')}><span className="flex w-full min-w-0 items-center justify-between gap-2 text-xs font-bold"><span className="truncate">{title}{key === 'vinculos' && reports.length ? ` (${reports.length})` : ''}</span><Icon className="h-4 w-4 shrink-0" /></span><span className={'line-clamp-2 text-[11px] leading-4 ' + (selected ? 'text-content-onBrand/80' : 'text-content-secondary')}>{String(index + 1).padStart(2, '0')} · {detail}</span></button></li>; })}</ol></nav> : <nav aria-label="Seções do atendimento" className="overflow-x-auto"><div className="flex min-w-max gap-1.5 rounded-xl bg-surface-subtle p-1.5">{visibleTabs.map(([key, title], index) => { const { icon: Icon } = tabDetails[key]; const selected = tab === key; return <button key={key} type="button" aria-current={selected ? (isNew ? 'step' : 'page') : undefined} disabled={locating || saving || registering} onClick={() => { setTab(key); setFormError(''); }} className={'group flex min-h-10 min-w-max items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 ' + (selected ? 'border-edge-subtle bg-surface-raised text-brand-subtleFg shadow-sm' : 'border-transparent text-content-secondary hover:bg-surface-raised hover:text-content-primary')}><Icon className="h-4 w-4 shrink-0" /><span>{title}{key === 'vinculos' && reports.length ? ` (${reports.length})` : ''}</span>{isNew && <span className="text-[10px] tabular-nums text-content-tertiary">{String(index + 1).padStart(2, '0')}</span>}</button>; })}</div></nav>)}
    footer={isNew && !loading && !error && <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
      {stepIndex > 0 && <Button type="button" variant="ghost" disabled={saving || locating || registering} onClick={() => setTab(visibleTabs[stepIndex - 1][0])}><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Button>}
      <Button type="button" variant="outline" disabled={saving || registering} onClick={close}>Cancelar</Button>
      {editable && <Button type="submit" form="municipal-demand-form" className="min-w-32 shadow-sm" disabled={saving || locating || registering || !form.titulo.trim()}>{saving ? 'Salvando…' : stepIndex < visibleTabs.length - 1 ? <>Continuar<ArrowRight className="ml-2 h-4 w-4" /></> : 'Criar ordem de serviço'}</Button>}
    </div>}
    >
    {loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
      : error ? <div className="space-y-3"><p role="alert" className="text-sm text-danger">{error}</p><Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</Button></div>
        : <form noValidate id="municipal-demand-form" onSubmit={save} className={'min-w-0 ' + (inline && isNew ? 'h-full' : 'space-y-5')}>
          <fieldset disabled={saving || registering} className={'min-w-0 ' + (inline && isNew ? 'flex h-full flex-col gap-3' : 'space-y-5')}>
          {item?.revisao_pendente && <div role="status" className="rounded-xl border border-danger/25 bg-danger-subtleBg p-4 text-sm text-danger-subtleFg"><AlertCircle className="mr-2 inline h-4 w-4" />Há uma manifestação da comunidade que precisa de revisão. Consulte o histórico e reabra o atendimento se houver trabalho pendente.</div>}
          {!editable && <p className="rounded-xl bg-surface-subtle p-3 text-sm text-content-secondary">Você tem acesso de consulta a este atendimento.</p>}
          {formError && <div role="alert" className="space-y-2 rounded-xl border border-danger/30 bg-danger-subtleBg p-3 text-sm text-danger-subtleFg"><p>{formError}</p>{item && <Button type="button" variant="outline" size="sm" onClick={async () => { if (!dirty || await confirmApp({ title: 'Recarregar atendimento?', description: 'As alterações locais não salvas serão descartadas.', confirmLabel: 'Recarregar', destructive: true })) setRevision((value) => value + 1); }}>Recarregar atendimento</Button>}</div>}
          {tab === 'dados' && <section className="flex min-h-[18rem] min-w-0 w-full flex-1 flex-col gap-3 rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm">
              <SectionHeading icon={FileText} title="Informações do serviço" description="Comece pelo que precisa ser feito e pela prioridade." />
              <div className={'grid min-w-0 gap-3 sm:grid-cols-2 ' + (inline ? 'xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]' : '')}>
                <Field error={fieldErrors.titulo} className={'sm:col-span-2 ' + (inline ? 'xl:col-span-1' : '')} title={<>Título <span className="text-danger">*</span></>}><Input placeholder="Ex.: Correção de buraco na rua…" minLength={3} maxLength={180} value={form.titulo} onChange={(event) => update('titulo', event.target.value)} disabled={!editable} /></Field>
                <Field error={fieldErrors.category_id} title="Categoria"><select className={selectClass} value={form.category_id} onChange={(event) => changeCategory(event.target.value)} disabled={!editable}><option value="">Selecione a categoria</option>{context.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
                <Field title="Prioridade"><select className={selectClass} value={form.prioridade} onChange={(event) => update('prioridade', event.target.value)} disabled={!editable}>{DEMAND_PRIORITIES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field title="Origem do pedido"><select className={selectClass} value={form.origem} onChange={(event) => update('origem', event.target.value)} disabled={!editable || Boolean(reports.length)}>{[['interno','Registro interno'],['bronca','Solicitação pública'],['telefone','Telefone'],['presencial','Atendimento presencial'],['vistoria','Vistoria']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field title="Protocolo externo"><Input className="h-10" placeholder="Opcional" value={form.protocolo_externo} onChange={(event) => update('protocolo_externo', event.target.value)} disabled={!editable} /></Field>
                {['iluminacao', 'esgoto'].includes(form.category_id) && <Field className={'sm:col-span-2 ' + (inline ? 'xl:col-span-5' : '')} title="Subcategoria"><select className={selectClass} value={form.issue_type} onChange={(event) => update('issue_type', event.target.value)} disabled={!editable}><option value="">Selecione o tipo de problema</option>{form.issue_type && ![...(form.category_id === 'iluminacao' ? TIPOS_DE_PROBLEMA_ILUMINACAO : TIPOS_DE_PROBLEMA_ESGOTO)].some((type) => type.value === form.issue_type) && <option value={form.issue_type}>{form.issue_type}</option>}{(form.category_id === 'iluminacao' ? TIPOS_DE_PROBLEMA_ILUMINACAO : TIPOS_DE_PROBLEMA_ESGOTO).map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></Field>}
              </div>
              <Field className="min-h-0 flex-1" title="Descrição"><textarea className={textAreaClass + ' min-h-32 flex-1 resize-y'} placeholder="Descreva o problema, detalhes e observações…" maxLength={10000} value={form.descricao} onChange={(event) => update('descricao', event.target.value)} disabled={!editable} /></Field>
              {item && <div className="flex justify-end border-t border-edge-subtle pt-4"><Button type="button" variant="outline" disabled={printing || saving || registering || dirty} title={dirty ? 'Salve as alterações para baixar a ordem atualizada' : 'Baixar a ordem registrada'} onClick={print}>{printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}PDF da ordem</Button></div>}
          </section>}
          {tab === 'local' && <MunicipalDemandLocation fieldErrors={fieldErrors} form={form} reports={reports} municipality={context.municipality} editable={editable} busy={saving} onLocatingChange={setLocating} onChange={(values) => { setForm((current) => ({ ...current, ...values })); setFormError(''); }} />}
          {tab === 'atendimento' && <section className="min-w-0 flex-1 rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm"><div className={'grid min-w-0 gap-4 ' + (inline ? 'xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]' : '')}>
            <div className="min-w-0">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <Field error={fieldErrors.canal_id} title={<>Secretaria {requiresChannel && <span className="text-danger">*</span>}</>}><select className={selectClass} value={form.canal_id} onChange={(event) => changeChannel(event.target.value)} disabled={!editable || Boolean(item && !context.isAdministrator)}><option value="">Aguardando distribuição</option>{availableChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.nome}</option>)}</select></Field>
                <Field error={fieldErrors.status} title="Etapa do serviço"><select aria-label="Etapa do serviço" className={selectClass} value={form.status} onChange={(event) => advance(event.target.value)} disabled={!editable}>{statusOptions.map(([value,label]) => <option key={value} value={value} disabled={value === 'concluida' && conclusionBlocked}>{label}</option>)}</select></Field>
              </div>
              {editable && item && !electricianMode && <div className="mt-4 flex flex-wrap gap-2">
                {!['concluida','cancelada','recusada'].includes(form.status) ? <><Button type="button" variant="outline" size="sm" onClick={() => advance('em_andamento')} disabled={form.status === 'em_andamento'}><Play className="mr-1 h-4 w-4" />Iniciar</Button><Button type="button" size="sm" onClick={() => advance('concluida')} disabled={conclusionBlocked}><CheckCircle2 className="mr-1 h-4 w-4" />Concluir serviço</Button><Button type="button" variant="outline" size="sm" onClick={() => advance('cancelada')}>Cancelar ordem</Button></> : <Button type="button" variant="outline" size="sm" onClick={() => advance('triagem')}><RotateCcw className="mr-1 h-4 w-4" />Reabrir atendimento</Button>}
              </div>}
              {conclusionBlocked && <p className="mt-3 text-xs text-content-secondary">Há solicitações pendentes. Registre cada resolução na aba Vínculos; a última conclui a ordem automaticamente.</p>}
              {form.status === 'programada' && <div className="mt-4"><Field error={fieldErrors.previsto_em} title="Previsão de execução *"><Input aria-label="Previsão de execução" className="h-10" type="datetime-local" value={form.previsto_em} onChange={(event) => update('previsto_em', event.target.value)} disabled={!editable} /></Field></div>}
              {waiting && <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field error={fieldErrors.motivo_pendencia} title="Motivo da pendência *"><textarea className={selectClass + ' min-h-24 py-3'} value={form.motivo_pendencia} onChange={(event) => update('motivo_pendencia', event.target.value)} disabled={!editable} /></Field><Field error={fieldErrors.proxima_acao_em} title="Revisar pendência em *"><Input type="datetime-local" value={form.proxima_acao_em} onChange={(event) => update('proxima_acao_em', event.target.value)} disabled={!editable} /></Field></div>}
              {mustExplain && <div className="mt-4"><Field error={fieldErrors.reason} title="Motivo da alteração *"><textarea className={selectClass + ' min-h-24 py-3'} minLength={5} maxLength={4000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={!editable} /></Field></div>}
              {(execution || preparingLinkedResolution) && <div className="mt-5 space-y-4 border-t border-edge-subtle pt-5">
                {preparingLinkedResolution && <p className="text-xs text-content-secondary">Informe os serviços e o resultado deste atendimento, salve a ordem e registre a resolução da solicitação na aba Vínculos.</p>}
                {form.category_id === 'iluminacao' && <Field error={fieldErrors.service_type} title={<>Serviços executados {electricianMode && form.status === 'concluida' && <span className="text-danger">*</span>}</>}><div className="grid gap-2">{[['lamp_replacement','Troca de lâmpada'],['arm_installation','Instalação de braço de luz'],['relay_replacement','Troca de relé'],['other','Outro serviço']].map(([key,label]) => <label key={key} className="flex min-h-9 items-center gap-2 rounded-lg border border-edge-subtle px-3 text-xs"><input type="checkbox" checked={(form.service_types?.length ? form.service_types : form.service_type ? [form.service_type] : []).includes(key)} onChange={(event) => { const current = form.service_types?.length ? form.service_types : form.service_type ? [form.service_type] : []; const next = event.target.checked ? [...current,key] : current.filter((value) => value !== key); setForm((state) => ({ ...state, service_types: next, service_type: next[0] || '' })); setFormError(''); }} disabled={!editable} className="h-4 w-4 accent-brand" />{label}</label>)}</div></Field>}
                {execution && <>
                <Field error={fileErrors.conclusao} title="Foto do serviço (opcional)"><input type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-edge-default file:bg-surface-subtle file:px-3 file:py-2 file:font-semibold" onChange={(event) => addFiles(event, 'conclusao')} disabled={!editable || saving} /></Field>
                {pendingFiles.filter((file) => file.tipo === 'conclusao').map((file) => <div key={file.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-subtle p-3 text-xs"><span className="min-w-0 flex-1 break-words font-semibold">{file.file.name}</span>{reports.length > 0 && <label className="flex items-center gap-1.5"><input type="checkbox" checked={file.visibilidade === 'publica'} onChange={(event) => setPendingFiles((current) => current.map((entry) => entry.id === file.id ? { ...entry, visibilidade: event.target.checked ? 'publica' : 'interna' } : entry))} disabled={!editable} />Mostrar na solicitação</label>}<Button type="button" variant="ghost" size="icon" aria-label={'Retirar foto ' + file.file.name} onClick={() => setPendingFiles((current) => current.filter((entry) => entry.id !== file.id))}><X className="h-4 w-4" /></Button></div>)}
                </>}
                <Field error={fieldErrors.resultado} title="Resultado do serviço (opcional)"><textarea className={selectClass + ' min-h-24 py-3'} minLength={10} maxLength={4000} value={form.resultado} onChange={(event) => update('resultado', event.target.value)} disabled={!editable} /></Field>
                {electricianMode && <Field error={fieldErrors.registro_execucao} title="Registro técnico (opcional)"><textarea className={selectClass + ' min-h-24 py-3'} minLength={20} maxLength={4000} value={form.registro_execucao} onChange={(event) => update('registro_execucao', event.target.value)} disabled={!editable} /></Field>}
              </div>}
            </div>
            {!electricianMode && <div className={'min-w-0 ' + (inline ? 'xl:border-l xl:border-edge-subtle xl:pl-4' : 'border-t border-edge-subtle pt-4')}>
              <h2 className="text-sm font-semibold">Responsável e prazos (opcional)</h2>
              <div className="mt-3 space-y-3 border-t border-edge-subtle pt-3">
                <section className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><Field title="Responsável na plataforma (opcional)"><select aria-label="Responsável na plataforma (opcional)" className={selectClass} value={form.atribuido_a} onChange={(event) => update('atribuido_a', event.target.value)} disabled={!editable || !form.canal_id}><option value="">Definir depois</option>{form.atribuido_a && !eligibleMembers.some((member) => member.user_id === form.atribuido_a) && <option value={form.atribuido_a}>{item?.responsavel?.name || 'Responsável anterior'} (vínculo inativo)</option>}{eligibleMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.perfil?.name || 'Membro da equipe'}</option>)}</select></Field>
                  {editable && context.isAdministrator && <Button type="button" size="sm" variant="outline" className="h-10" disabled={!form.canal_id} aria-expanded={inviteResponsible} aria-controls="demand-responsible-registration" onClick={() => setInviteResponsible((value) => !value)}><UserPlus className="mr-1.5 h-3.5 w-3.5" />{inviteResponsible ? 'Fechar convite' : 'Convidar responsável'}</Button>}
                  {editable && context.isAdministrator && inviteResponsible && form.canal_id && <div id="demand-responsible-registration" className="sm:col-span-2"><MunicipalResponsibleInvite key={form.canal_id} channel={context.channels.find((channel) => String(channel.id) === String(form.canal_id))} onBusyChange={setRegistering} onMembersLoaded={(members) => setExtraMembers((current) => [...current.filter((member) => String(member.canal_id) !== String(form.canal_id)), ...members])} /></div>}
                </section>
                <section className="grid min-w-0 gap-3 sm:grid-cols-2"><Field title="Prazo de atendimento"><Input type="datetime-local" value={form.prazo_em} onChange={(event) => update('prazo_em', event.target.value)} disabled={!editable} /></Field><Field title="Prazo da primeira resposta"><Input type="datetime-local" value={form.primeira_resposta_prazo_em} onChange={(event) => update('primeira_resposta_prazo_em', event.target.value)} disabled={!editable || Boolean(item?.primeira_resposta_em)} /></Field><Field title="Próxima ação"><Input value={form.proxima_acao} onChange={(event) => update('proxima_acao', event.target.value)} disabled={!editable} /></Field>{!waiting && <Field error={fieldErrors.proxima_acao_em} title="Data da próxima ação"><Input type="datetime-local" value={form.proxima_acao_em} onChange={(event) => update('proxima_acao_em', event.target.value)} disabled={!editable} /></Field>}</section>
                {execution && <section className="grid min-w-0 gap-4 sm:grid-cols-2"><Field title="Executado em"><Input type="datetime-local" value={form.executada_em} onChange={(event) => update('executada_em', event.target.value)} disabled={!editable} /></Field><Field error={fieldErrors.registro_execucao} title="Registro técnico (opcional)"><textarea className={selectClass + ' min-h-24 py-3'} maxLength={4000} value={form.registro_execucao} onChange={(event) => update('registro_execucao', event.target.value)} disabled={!editable} /></Field></section>}
              </div>
            </div>}
          </div></section>}
          {tab === 'anexos' && <MunicipalDemandAttachmentsTab errors={fileErrors} files={attachments} pendingFiles={pendingFiles} editable={editable} busy={saving || registering} canPublish={canPublishConclusion} onAdd={addFiles} onTogglePublic={(id, checked) => setPendingFiles((current) => current.map((file) => file.id === id ? { ...file, visibilidade: checked ? 'publica' : 'interna' } : file))} onRemove={(id) => setPendingFiles((current) => current.filter((file) => file.id !== id))} />}
          {tab === 'comunicacao' && <section className="min-w-0 flex-1 rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm"><div className="grid h-full min-w-0 gap-4 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-3"><SectionHeading icon={MessageSquare} title="Comunicação com o cidadão" description="Opcional. Use quando houver uma solicitação vinculada." tone="blue" /><Field className="min-h-0 flex-1" title="Resposta oficial" hint={reports.length ? 'Será publicada nas solicitações vinculadas, com a identificação da secretaria.' : 'Vincule uma solicitação na próxima etapa para habilitar a resposta.'}><textarea className={textAreaClass + ' min-h-32 flex-1 resize-y'} maxLength={4000} placeholder="Informe o andamento do serviço ao cidadão…" value={publicResponse} onChange={(event) => setPublicResponse(event.target.value)} disabled={!editable || !reports.length} /></Field>{editable && reports.length > 0 && <Button type="button" variant="outline" size="sm" onClick={() => setPublicResponse(suggestedPublicResponse(form))} disabled={!suggestedPublicResponse(form)}>Usar sugestão da etapa</Button>}</div>
            <div className="flex min-w-0 flex-col gap-3 lg:border-l lg:border-edge-subtle lg:pl-4"><SectionHeading icon={Lock} title="Anotações da equipe" description="Opcional. Visível apenas para a equipe municipal." tone="neutral" /><Field className="min-h-0 flex-1" title="Nota interna" hint="Registre orientações, contatos ou observações para a equipe."><textarea className={textAreaClass + ' min-h-32 flex-1 resize-y'} maxLength={4000} placeholder="O que a equipe precisa saber?" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} disabled={!editable} /></Field></div>
          </div></section>}
          {tab === 'vinculos' && <section className="min-w-0 flex-1 rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm"><div className={'grid h-full min-w-0 items-stretch gap-4 ' + (isNew ? 'xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]' : '')}>{isNew && <div className="min-w-0 xl:border-r xl:border-edge-subtle xl:pr-4"><SectionHeading icon={CheckCircle2} title="Confira a ordem antes de criar" description="A ordem pode ser criada sem responsável na plataforma e sem solicitação vinculada." tone="blue" /><h3 className="break-words text-base font-semibold">{poleReferenceText(form.titulo || 'Informe o título do serviço')}</h3><dl className="mt-3 grid grid-cols-2 gap-3">{[
            ['Secretaria', context.channels.find((channel) => channel.id === form.canal_id)?.nome || 'Aguardando distribuição'],
            ['Responsável', eligibleMembers.find((member) => member.user_id === form.atribuido_a)?.perfil?.name || (form.atribuido_a ? item?.responsavel?.name || 'Responsável selecionado' : 'Definir depois')],
            ['Prioridade', DEMAND_PRIORITIES.find(([key]) => key === form.prioridade)?.[1]],
            ['Etapa', DEMAND_STATUSES.find(([key]) => key === form.status)?.[1]],
          ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-content-secondary">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value}</dd></div>)}</dl></div>}
          <div className="min-w-0 space-y-3">
            <SectionHeading icon={Link2} title="Solicitações vinculadas (opcional)" description="Cada solicitação mantém suas fotos, apoios e andamento próprio. O eletricista pode resolvê-las uma por vez." tone="neutral" />
            {!reports.length && <p className="text-sm text-content-tertiary">Nenhuma solicitação vinculada.</p>}
            <div className="max-h-40 space-y-2 overflow-y-auto pr-1">{reports.map((report) => <div key={report.id} className="flex min-w-0 flex-wrap items-start gap-3 rounded-xl border border-edge-subtle p-3"><div className="min-w-0 flex-1"><Link to={'/prefeitura/broncas?bronca=' + report.id} className="break-words text-sm font-bold text-brand">{poleReferenceText(report.title)}</Link><p className="mt-1 text-xs text-content-secondary">{[report.address, report.neighborhood].filter(Boolean).join(' · ')}</p><p className="mt-1 text-xs">{report.newLink ? 'Será vinculada ao salvar' : report.status === 'resolved' ? 'Solicitação resolvida' : 'Relato ainda não resolvido'}</p></div>{item && editable && !electricianMode && form.category_id === 'iluminacao' && !report.newLink && report.status !== 'resolved' && !['concluida','cancelada','recusada'].includes(item.status) && <Button type="button" size="sm" disabled={saving || dirty} title={dirty ? 'Salve as alterações antes de registrar a resolução' : 'Registrar o atendimento desta solicitação'} onClick={() => resolveLinkedReport(report)}>Registrar resolução</Button>}{report.newLink && <Button type="button" size="icon" variant="ghost" aria-label={'Retirar vínculo de ' + poleReferenceText(report.title)} onClick={() => setReports((current) => current.filter((entry) => entry.id !== report.id))}><X className="h-4 w-4" /></Button>}</div>)}</div>
            {editable && !['concluida','cancelada','recusada'].includes(form.status) && <><label className="relative block"><span className="sr-only">Buscar solicitações para vincular</span><Search className="absolute left-3 top-3 h-4 w-4 text-content-tertiary" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Buscar solicitação por título, endereço ou bairro" /></label>{searching ? <p className="text-sm text-content-secondary">Buscando relatos…</p> : search && !matches.length ? <p className="text-sm text-content-tertiary">Nenhuma solicitação disponível para este vínculo.</p> : <div className="max-h-40 space-y-2 overflow-y-auto pr-1">{matches.map((report) => <button key={report.id} type="button" disabled={linkingReport} className="block w-full rounded-xl border border-edge-subtle p-3 text-left hover:bg-surface-subtle disabled:opacity-60" onClick={() => addReport(report)}><strong className="block break-words text-sm">{poleReferenceText(report.title)}</strong><span className="mt-1 block text-xs text-content-secondary">{report.address || report.neighborhood || 'Sem endereço'}</span><span className="mt-2 block text-xs font-bold text-brand">{linkingReport ? 'Carregando local…' : 'Vincular ao atendimento'}</span></button>)}</div>}</>}
          </div></div></section>}
          {tab === 'historico' && <MunicipalDemandHistory events={events} context={context} />}
          </fieldset>
        </form>}
  </MunicipalDrawer>;
}
