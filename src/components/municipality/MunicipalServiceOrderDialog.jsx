import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Download, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogDescription, DialogHeader, DialogTitle, FormDialogContent, FormDialogFooter } from '@/components/ui/dialog';
import { canEditDemand, DEMAND_PRIORITIES, suggestDemandAssignment } from '@/lib/municipalDemand';
import { createMunicipalServiceOrder, loadMunicipalServiceOrder, loadServiceOrderSelection, SERVICE_ORDER_INSTRUCTION, serviceOrderDraft } from '@/lib/municipalServiceOrder';
import { supabase } from '@/lib/customSupabaseClient';
import { loadPendingMapReports, OPEN_REPORT_STATUSES, REPORT_AGES } from '@/lib/municipalReports';
import { TIPOS_DE_PROBLEMA_ESGOTO, TIPOS_DE_PROBLEMA_ILUMINACAO } from '@/lib/reportCategoryFields';

const controlClass = 'h-10 w-full min-w-0 rounded-lg border border-edge-default bg-surface-raised px-3 text-sm text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export default function MunicipalServiceOrderDialog({ context, selectedIds, onRemove, onClose, onCreated, onOpenOrder }) {
  const [ids, setIds] = useState(() => [...selectedIds]);
  const [choosing, setChoosing] = useState(true);
  const [candidates, setCandidates] = useState([]);
  const [neighborhoodOptions, setNeighborhoodOptions] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [candidatesError, setCandidatesError] = useState('');
  const [candidateRevision, setCandidateRevision] = useState(0);
  const [filters, setFilters] = useState({ category: 'all', neighborhood: 'all', age: 'all', query: '' });
  const [orderId] = useState(() => crypto.randomUUID());
  const [selection, setSelection] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState(null);
  const [created, setCreated] = useState(null);
  const [downloaded, setDownloaded] = useState(false);
  const [observation, setObservation] = useState('');
  const [title, setTitle] = useState('');
  const [channelId, setChannelId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [priority, setPriority] = useState('normal');
  const [issueType, setIssueType] = useState('');
  const channels = context.channels.filter((channel) => canEditDemand(context, channel.id));
  const members = useMemo(() => [...new Map((context.members || []).filter((member) => String(member.canal_id) === String(channelId) && member.ativo && (['gestor', 'operador'].includes(member.papel) || (draft?.category_id === 'iluminacao' && member.papel === 'eletricista'))).map((member) => [member.user_id, member])).values()], [context.members, channelId, draft?.category_id]);

  useEffect(() => {
    if (!choosing) return undefined;
    const controller = new AbortController();
    setCandidatesLoading(true); setCandidatesError('');
    const timer = window.setTimeout(() => loadPendingMapReports(supabase, {
      cityId: context.municipality.city_id, municipalityId: context.municipality.id,
      ...filters, includeAllStatuses: true, statuses: OPEN_REPORT_STATUSES, publicOnly: true, signal: controller.signal,
    }, 'id,title,address,neighborhood,created_at,category_id,category:categories(name)')
      .then((rows) => { if (!controller.signal.aborted) { setCandidates(rows); setNeighborhoodOptions((current) => [...new Set([...current, ...rows.map((item) => item.neighborhood).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR'))); } })
      .catch((failure) => { if (!controller.signal.aborted) { setCandidates([]); setCandidatesError(failure.message); } })
      .finally(() => { if (!controller.signal.aborted) setCandidatesLoading(false); }), filters.query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [choosing, context.municipality.id, context.municipality.city_id, filters, candidateRevision]);

  useEffect(() => {
    if (created || choosing) return undefined;
    const controller = new AbortController();
    setLoading(true); setLoadError('');
    loadServiceOrderSelection(supabase, context, ids, controller.signal).then((rows) => {
      if (controller.signal.aborted) return;
      setSelection(rows); setLoading(false);
      setDraft((current) => current || serviceOrderDraft(rows.filter((item) => item.report && !item.link).map((item) => item.report), context));
    }).catch((failure) => { if (!controller.signal.aborted) { setLoadError(failure.message); setLoading(false); } });
    return () => controller.abort();
    // Workspace and selection are snapshots while reviewing this order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, context.municipality.id, revision, created, choosing]);
  useEffect(() => {
    if (!draft) return;
    setTitle(draft.titulo); setChannelId(draft.canal_id || ''); setResponsibleId(draft.atribuido_a || ''); setPriority(draft.prioridade); setIssueType(draft.issue_type || '');
  }, [draft]);

  const available = selection.filter((item) => item.report && !item.link);
  const unavailable = selection.filter((item) => !item.report || item.link);
  const types = [...new Set(available.map((item) => item.report.category?.name || 'Sem categoria'))];
  const neighborhoods = [...new Set(available.map((item) => item.report.neighborhood || 'Bairro não informado'))];
  const remove = (id) => { setIds((current) => current.filter((value) => value !== id)); onRemove(id); setError(''); };
  const destination = (value) => {
    setChannelId(value);
    setResponsibleId(value ? suggestDemandAssignment(context, draft?.category_id || '', value).atribuido_a || '' : '');
  };
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const toggleCandidate = (id) => setIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const allCandidatesSelected = candidates.length > 0 && candidates.every((item) => ids.includes(item.id));
  const generate = async (event) => {
    event.preventDefault();
    if (saving || loading || created) return;
    setSaving(true); setError('');
    try {
      const saved = await createMunicipalServiceOrder(supabase, { context, id: orderId, selection, title, channelId, responsibleId, priority, issueType, observation });
      setCreated(saved); onCreated(saved);
    } catch (failure) {
      setError(failure.code === '23505' ? 'Uma das solicitações foi vinculada a outra ordem. Atualize a prévia e remova a ocorrência vinculada.' : failure.message || 'Não foi possível gerar a ordem.');
    } finally { setSaving(false); }
  };
  const download = async () => {
    if (!created || saving) return;
    setSaving(true); setError('');
    try {
      const { downloadServiceOrderPdf } = await import('@/utils/municipalServiceOrderPdf');
      const document = await loadMunicipalServiceOrder(supabase, context, created.id);
      await downloadServiceOrderPdf({ ...document, municipality: context.municipality, creatorName: context.userName });
      setDownloaded(true);
    } catch (failure) { setError(`Não foi possível baixar o PDF: ${failure.message}`); }
    finally { setSaving(false); }
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}><FormDialogContent hideClose={saving} className="!flex max-h-[94dvh] flex-col !overflow-hidden sm:max-h-[90dvh] sm:w-[calc(100vw-4rem)] sm:max-w-4xl">
    <DialogHeader className="shrink-0 pr-6"><DialogTitle className="flex items-center gap-2 text-xl"><ClipboardList className="h-5 w-5 text-brand" />{created ? `Ordem ${created.protocolo}` : 'Gerar Ordem de Serviço'}</DialogTitle><DialogDescription>{created ? 'A ordem está registrada e disponível em Ordens de serviço.' : choosing ? 'Filtre as solicitações pendentes e escolha as ocorrências que entrarão na ordem.' : 'Confira as ocorrências e o destino da equipe. O PDF poderá ser baixado depois do cadastro.'}</DialogDescription></DialogHeader>
    {choosing && !created ? <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid min-w-0 gap-1 text-xs font-medium text-content-secondary">Categoria<select value={filters.category} onChange={(event) => setFilter('category', event.target.value)} className={controlClass}><option value="all">Todas</option>{context.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="grid min-w-0 gap-1 text-xs font-medium text-content-secondary">Bairro<select value={filters.neighborhood} onChange={(event) => setFilter('neighborhood', event.target.value)} className={controlClass}><option value="all">Todos</option>{neighborhoodOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className="grid min-w-0 gap-1 text-xs font-medium text-content-secondary">Idade<select value={filters.age} onChange={(event) => setFilter('age', event.target.value)} className={controlClass}>{REPORT_AGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="relative grid min-w-0 gap-1 text-xs font-medium text-content-secondary">Buscar<span className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-tertiary" /><Input value={filters.query} onChange={(event) => setFilter('query', event.target.value)} placeholder="Título ou endereço" className={controlClass + ' pl-9'} /></span></label>
      </div>
      <p className="text-xs text-content-secondary">{ids.length} selecionadas · {candidatesLoading ? 'Consultando…' : `${candidates.length} encontradas nos filtros`}</p>
      {candidatesError ? <div role="alert" className="text-sm text-danger">{candidatesError}<Button type="button" variant="outline" size="sm" className="ml-2" onClick={() => setCandidateRevision((value) => value + 1)}>Tentar novamente</Button></div> : <div className="min-w-0 overflow-hidden rounded-xl border border-edge-default">
        <label className="flex cursor-pointer items-center gap-2 border-b border-edge-subtle bg-surface-subtle p-3 text-xs font-semibold"><input type="checkbox" checked={allCandidatesSelected} disabled={candidatesLoading || !candidates.length} onChange={(event) => setIds((current) => event.target.checked ? [...new Set([...current, ...candidates.map((item) => item.id)])] : current.filter((id) => !candidates.some((item) => item.id === id)))} className="accent-brand" />Selecionar todas as solicitações filtradas</label>
        <div className="max-h-72 divide-y divide-edge-subtle overflow-y-auto">{candidatesLoading ? <p role="status" className="p-5 text-center text-sm text-content-secondary">Carregando solicitações…</p> : candidates.length ? candidates.slice(0, 100).map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-3 p-3 text-xs hover:bg-surface-subtle"><input type="checkbox" checked={ids.includes(item.id)} onChange={() => toggleCandidate(item.id)} className="mt-0.5 accent-brand" /><span className="min-w-0"><strong className="block break-words text-content-primary">{item.title || 'Solicitação sem título'}</strong><span className="mt-1 block break-words text-content-secondary">{[item.category?.name, item.neighborhood, item.address].filter(Boolean).join(' · ')}</span></span></label>) : <p className="p-5 text-center text-sm text-content-secondary">Nenhuma solicitação disponível para estes filtros.</p>}</div>
      </div>}
      {candidates.length > 100 && <p className="text-xs text-content-secondary">Mostrando as primeiras 100. “Selecionar todas” inclui as {candidates.length} encontradas.</p>}
      </div>
      <FormDialogFooter className="!static !mx-0 !mb-0 !mt-0 shrink-0 !px-0"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="button" disabled={!ids.length || candidatesLoading || Boolean(candidatesError)} onClick={() => { setDraft(null); setChoosing(false); }}>Continuar com {ids.length} {ids.length === 1 ? 'solicitação' : 'solicitações'}</Button></FormDialogFooter>
    </div> : <form onSubmit={generate} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
      {created ? <div className="rounded-xl border border-edge-default bg-surface-subtle p-5"><CheckCircle2 className="mb-3 h-7 w-7 text-success-fg" /><p className="font-semibold">Ordem de serviço registrada</p><p className="mt-2 text-sm text-content-secondary">{downloaded ? 'O PDF A4 foi gerado e está pronto para impressão.' : 'Você pode baixar o PDF ou abrir o atendimento para acompanhar a execução.'}</p><p className="mt-2 text-xs text-content-secondary">Baixar novamente mantém o mesmo número e os mesmos vínculos.</p></div> : loading ? <div role="status" className="flex min-h-40 items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Carregando ocorrências…</div> : loadError ? <div><p role="alert" className="text-sm text-danger">{loadError}</p><Button type="button" variant="outline" className="mt-3" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</Button></div> : <fieldset disabled={saving} className="min-w-0 space-y-5">
        <div className="grid min-w-0 gap-3 rounded-xl border border-edge-subtle bg-surface-subtle p-4 sm:grid-cols-[auto_1fr_1fr]"><div><p className="text-xs text-content-secondary">Ocorrências</p><p className="mt-1 text-2xl font-bold tabular-nums">{available.length}</p></div><div><p className="text-xs text-content-secondary">Tipos de demanda</p><p className="mt-1 break-words text-sm font-semibold">{types.join(', ') || 'Nenhuma'}</p></div><div><p className="text-xs text-content-secondary">Bairros envolvidos</p><p className="mt-1 break-words text-sm font-semibold">{neighborhoods.join(', ') || 'Nenhum'}</p></div></div>
        {unavailable.length > 0 && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-subtleBg p-3 text-sm text-danger-subtleFg">{unavailable.length} {unavailable.length === 1 ? 'ocorrência já vinculada ou indisponível' : 'ocorrências já vinculadas ou indisponíveis'}. Remova esses itens para continuar.<Button type="button" variant="outline" size="sm" className="mt-2 block" onClick={() => { const blocked = unavailable.map((item) => item.id); setIds((current) => current.filter((id) => !blocked.includes(id))); blocked.forEach(onRemove); }}>Remover indisponíveis</Button></div>}
        <label className="grid gap-1.5 text-xs font-medium text-content-secondary">Título da ordem<Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required minLength={3} className={controlClass} /></label>
        {['iluminacao', 'esgoto'].includes(draft?.category_id) && <label className="grid gap-1.5 text-xs font-medium text-content-secondary">Subcategoria<select className={controlClass} value={issueType} onChange={(event) => setIssueType(event.target.value)}><option value="">Selecione o tipo de problema</option>{(draft.category_id === 'iluminacao' ? TIPOS_DE_PROBLEMA_ILUMINACAO : TIPOS_DE_PROBLEMA_ESGOTO).map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>}
        <div className="grid min-w-0 gap-3 sm:grid-cols-3"><label className="grid min-w-0 gap-1.5 text-xs font-medium text-content-secondary">Setor de destino<select value={channelId} required={!context.isAdministrator} onChange={(event) => destination(event.target.value)} className={controlClass}><option value="">{context.isAdministrator ? 'Definir depois' : 'Escolha a secretaria'}</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.nome}</option>)}</select></label><label className="grid min-w-0 gap-1.5 text-xs font-medium text-content-secondary">Responsável <span className="sr-only">(opcional)</span><select value={responsibleId} onChange={(event) => setResponsibleId(event.target.value)} className={controlClass}><option value="">Definir depois</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.perfil?.name || 'Membro da equipe'}</option>)}</select></label><label className="grid min-w-0 gap-1.5 text-xs font-medium text-content-secondary">Prioridade<select value={priority} onChange={(event) => setPriority(event.target.value)} className={controlClass}>{DEMAND_PRIORITIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
        {types.length > 1 && <p className="text-xs leading-5 text-content-secondary">Há tipos diferentes na seleção. Esta ordem reúne todas as ocorrências para o setor escolhido.</p>}
        <section aria-label="Ocorrências da ordem" className="min-w-0"><h3 className="mb-2 text-sm font-semibold">Lista de serviços</h3><div className="max-h-64 divide-y divide-edge-subtle overflow-y-auto rounded-xl border border-edge-default">{selection.map((item, index) => <article key={item.id} className="flex min-w-0 items-start gap-3 p-3"><span className="mt-0.5 text-xs tabular-nums text-content-secondary">{index + 1}.</span><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{item.report?.title || 'Ocorrência indisponível'}</p><p className="mt-1 break-words text-xs text-content-secondary">{[item.report?.category?.name, item.report?.address, item.report?.neighborhood].filter(Boolean).join(' · ')}</p>{item.report?.pole_id != null && <p className="mt-1 text-xs text-content-secondary">Poste {item.report.pole?.identifier || item.report.pole?.plate || item.report.pole_number || item.report.pole_id}</p>}{item.link && <p className="mt-1 text-xs text-danger">Já vinculada à ordem {item.link.protocolo}</p>}<p className="mt-1 break-all text-[10px] text-content-tertiary">ID: {item.report?.protocol || item.id}</p></div><Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={'Remover ocorrência ' + (item.report?.title || item.id)} onClick={() => remove(item.id)}><X className="h-3.5 w-3.5" /></Button></article>)}</div></section>
        <p className="rounded-lg bg-surface-subtle p-3 text-xs leading-5 text-content-secondary">{SERVICE_ORDER_INSTRUCTION}</p>
        <label className="grid gap-1.5 text-xs font-medium text-content-secondary">Observação para a equipe (opcional)<textarea value={observation} onChange={(event) => setObservation(event.target.value)} maxLength={10000} placeholder="Orientações de acesso, materiais ou cuidados na execução…" className={controlClass + ' h-auto min-h-24 py-3'} /></label>
        <p className="text-xs text-content-secondary">O PDF inclui os locais, dados dos postes quando disponíveis e espaço para assinatura e registro da execução em campo.</p>
      </fieldset>}
      {error && <div role="alert" className="mt-4 text-sm text-danger">{error}{!created && !loading && <Button type="button" variant="outline" size="sm" className="mt-2 block" onClick={() => { setRevision((value) => value + 1); setError(''); }}>Atualizar prévia</Button>}</div>}
      </div>
      <FormDialogFooter className="!static !mx-0 !mb-0 !mt-0 shrink-0 !px-0"><Button type="button" variant="outline" disabled={saving} onClick={created ? onClose : () => setChoosing(true)}>{created ? 'Fechar' : 'Voltar à seleção'}</Button>{created && <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenOrder(created.id)}>Ver ordem de serviço</Button>}{created ? <Button type="button" variant="outline" disabled={saving} onClick={download}><Download className="mr-2 h-4 w-4" />{saving ? 'Preparando PDF…' : 'Baixar PDF'}</Button> : <Button type="submit" disabled={saving || loading || Boolean(loadError) || !available.length || unavailable.length > 0 || (!channelId && !context.isAdministrator) || title.trim().length < 3}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? 'Criando ordem…' : 'Gerar ordem de serviço'}</Button>}</FormDialogFooter>
    </form>}
  </FormDialogContent></Dialog>;
}
