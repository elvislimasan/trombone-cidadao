import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { ArrowLeft, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { municipalContextPath } from '@/lib/municipalAccess';
import { validateExecutorResult } from '@/lib/executorActivities';
import { DEMAND_STATUSES, evidenceError } from '@/lib/municipalDemand';
import { loadExecutorDraft, saveExecutorDraft, clearExecutorDraft } from '@/lib/executorDraft';
import { ehErroDeRede } from '@/lib/offlineErros';
import DemandAttachments from '@/components/municipality/DemandAttachments';
import MunicipalDemandHistory from '@/components/municipality/MunicipalDemandHistory';
import ExecutorWorkMap from '@/components/municipality/ExecutorWorkMap';

const emptyForm = () => ({ result: '', note: '', services: [], files: [], reportId: '', operationId: crypto.randomUUID() });
export default function ExecutorOrderPage() {
  const context = useOutletContext();
  const activity = context.executionActivity;
  const { id } = useParams();
  const scope = useMemo(() => ({ userId: context.userId, municipalityId: context.municipality.id, activity: activity.id, orderId: id }), [context.userId, context.municipality.id, activity.id, id]);
  const scopeKey = JSON.stringify(scope);
  const currentScope = useRef(scopeKey); currentScope.current = scopeKey;
  const [response, setResponse] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftNotice, setDraftNotice] = useState('');
  const [notice, setNotice] = useState('');
  const [impediment, setImpediment] = useState(false);
  const data = response?.scope === scopeKey ? response.data : null;
  const order = data?.order;
  const reports = data?.reports || [];
  const workPoints = reports.filter(report => report.latitude != null && report.longitude != null).map(report => ({ ...report, id: report.report_id, titulo: report.title, tipo: 'solicitacao', atribuido_a: order?.atribuido_a, endereco: report.address, bairro: report.neighborhood }));
  const pendingReports = reports.filter(report => report.status !== 'resolved');
  const finished = ['concluida', 'aguardando_confirmacao', 'cancelada', 'recusada'].includes(order?.status);
  const load = useCallback(async () => {
    const { data: detail, error: failure } = await supabase.rpc('detalhar_ordem_executor', { p_prefeitura: scope.municipalityId, p_ordem: scope.orderId, p_especialidade: scope.activity });
    if (failure) throw failure;
    if (currentScope.current === scopeKey) setResponse({ scope: scopeKey, data: detail });
    return detail;
  }, [scope, scopeKey]);
  useEffect(() => {
    let active = true;
    setLoading(true); setBusy(false); setDraftNotice(''); setError(''); setFormError(''); setDraftReady(false); setForm(emptyForm()); setResponse(null); setNotice('');
    load().then(async detail => {
      const draft = await loadExecutorDraft(scope).catch(() => null);
      if (!active) return;
      if (draft && draft.version === detail.order.versao && !['concluida', 'aguardando_confirmacao', 'cancelada', 'recusada'].includes(detail.order.status)) {
        setForm(draft); setDraftNotice('Rascunho recuperado deste aparelho.');
      } else { setForm({ ...emptyForm(), reportId: detail.reports.find(report => report.status !== 'resolved')?.report_id || '' }); setDraftNotice(draft ? 'A ordem mudou desde o rascunho anterior. Confira o serviço antes de registrar novamente.' : 'O rascunho é guardado neste aparelho.'); }
      setDraftReady(true);
    }).catch(cause => { if (active) setError(cause.message || 'Não foi possível carregar a ordem.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load, scope]);
  useEffect(() => {
    if (!draftReady || !order || finished || busy) return undefined;
    const timer = setTimeout(() => saveExecutorDraft(scope, { ...form, version: order.versao })
      .then(() => { if (currentScope.current === scopeKey) setDraftNotice('Rascunho salvo neste aparelho.'); })
      .catch(() => { if (currentScope.current === scopeKey) setDraftNotice('Não foi possível guardar o rascunho neste aparelho.'); }), 400);
    return () => clearTimeout(timer);
  }, [scope, scopeKey, form, order, finished, busy, draftReady]);
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const refresh = async () => {
    setError('');
    try {
      const detail = await load();
      if (currentScope.current !== scopeKey) return;
      if (detail.results.some(result => result.id === form.operationId)) {
        await clearExecutorDraft(scope).catch(() => {});
        setForm({ ...emptyForm(), reportId: detail.reports.find(report => report.status !== 'resolved')?.report_id || '' });
        setNotice('O envio anterior foi confirmado. O resultado já está registrado.');
      } else if (detail.order.versao !== order?.versao) {
        setForm(previous => ({ ...previous, reportId: detail.reports.find(report => report.status !== 'resolved')?.report_id || '' }));
        setFormError('A ordem foi atualizada. Confira os dados antes de enviar novamente.');
      }
    } catch (cause) { if (currentScope.current === scopeKey) { setResponse(null); setError(cause.message); } }
  };
  const submit = async action => {
    if (busy || !order) return;
    if (!navigator.onLine) { setFormError('Sem conexão. Seu rascunho permanece neste aparelho.'); return; }
    if (action === 'concluir') {
      const validation = validateExecutorResult(activity, form);
      if (validation) { setFormError(validation); return; }
      if (pendingReports.length && !pendingReports.some(report => report.report_id === form.reportId)) { setFormError('Selecione uma solicitação pendente.'); return; }
    }
    if (action === 'impedimento' && form.result.trim().length < 5) { setFormError('Descreva o impedimento.'); return; }
    setBusy(true); setFormError(''); setNotice('');
    const operationId = action === 'concluir' ? form.operationId : crypto.randomUUID();
    const uploaded = [];
    let sent = false;
    let committed = false;
    try {
      await saveExecutorDraft(scope, { ...form, version: order.versao }).catch(() => {});
      for (const { id: fileId, file } of action === 'concluir' ? form.files : []) {
        const path = `${scope.municipalityId}/${scope.userId}/${operationId}/${fileId}`;
        const { error: failure } = await supabase.storage.from('municipal-demand-files').upload(path, file, { contentType: file.type });
        if (failure && !['409', 'Duplicate'].includes(String(failure.statusCode || failure.code)) && !failure.message?.includes('already exists')) throw failure;
        uploaded.push({ storage_path: path, nome: file.name, mime_type: file.type, tamanho: file.size });
      }
      sent = true;
      const result = await supabase.rpc('registrar_execucao_executor', { p_prefeitura: scope.municipalityId, p_ordem: id, p_especialidade: activity.id, p_versao: order.versao,
        p_operacao: operationId, p_acao: action, p_report: action === 'concluir' ? form.reportId || null : null,
        p_dados: { resultado: form.result.trim(), registro_execucao: form.note.trim(), service_types: form.services }, p_anexos: uploaded });
      if (result.error) throw result.error;
      committed = true;
      if (currentScope.current !== scopeKey) return;
      if (action === 'concluir') { await clearExecutorDraft(scope).catch(() => {}); setDraftReady(false); }
      const detail = await load();
      if (currentScope.current !== scopeKey) return;
      if (action === 'concluir') { setForm({ ...emptyForm(), reportId: detail.reports.find(report => report.status !== 'resolved')?.report_id || '' }); setDraftReady(true); }
      setNotice(action === 'concluir' ? result.data.status === 'em_andamento' ? 'Solicitação atendida. A ordem ainda possui serviços pendentes.' : result.data.status === 'aguardando_confirmacao' ? 'Execução registrada. Aguardando conferência do gestor.' : 'Serviço concluído.' : action === 'impedimento' ? 'Impedimento informado ao gestor.' : action === 'encerrar' ? 'Ordem encerrada sem registrar novo serviço técnico.' : 'Serviço iniciado.');
      setImpediment(false);
      window.dispatchEvent(new Event('reports-updated'));
    } catch (cause) {
      if (currentScope.current !== scopeKey) return;
      if (committed) { setNotice('Registro salvo. Atualize a ordem para conferir o resultado.'); return; }
      if (!(sent && ehErroDeRede(cause)) && uploaded.length) await supabase.storage.from('municipal-demand-files').remove(uploaded.map(file => file.storage_path)).catch(() => {});
      setFormError(ehErroDeRede(cause) ? 'Falha de conexão. O rascunho foi mantido; atualize a ordem para conferir o envio antes de tentar novamente.' : cause.message);
    } finally { if (currentScope.current === scopeKey) setBusy(false); }
  };
  const addFiles = event => {
    const selected = [...event.target.files]; event.target.value = '';
    const failure = selected.map(evidenceError).find(Boolean);
    if (failure || selected.length + form.files.length > 5) { setFormError(failure || 'Use até cinco evidências.'); return; }
    update('files', [...form.files, ...selected.map(file => ({ id: crypto.randomUUID(), file }))]);
  };
  return <div className="page-shell-fluid space-y-5 py-5 sm:py-7" data-testid="executor-order">
    <Helmet><title>Ordem de serviço | {activity.label}</title></Helmet>
    <div className="flex items-center justify-between gap-3"><Link className="flex items-center gap-2 text-sm font-semibold text-brand" to={municipalContextPath(activity.path, context.municipality.city_id, context.activeChannelId)}><ArrowLeft className="h-4 w-4" />Meus serviços</Link><Button variant="outline" disabled={busy} onClick={refresh} aria-label="Atualizar ordem"><RotateCcw className="h-4 w-4" /></Button></div>
    {loading && <p role="status">Carregando ordem…</p>}{error && <p role="alert" className="text-danger">{error}</p>}{notice && <p role="status" className="rounded-xl bg-success-bg p-3 text-success-fg">{notice}</p>}
    {order && !loading && <><div><p className="text-xs font-bold text-brand">{order.protocolo} · {activity.label}</p><h1 className="mt-1 text-2xl font-extrabold">{order.titulo}</h1><p className="mt-1 text-sm text-content-secondary">{DEMAND_STATUSES.find(([key]) => key === order.status)?.[1]} · {[order.endereco, order.bairro].filter(Boolean).join(' · ')}</p></div>
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-2"><div className="min-w-0 space-y-4"><p className="whitespace-pre-line text-sm">{order.descricao}</p>{(order.endereco || (order.latitude != null && order.longitude != null)) && <a className="inline-block text-sm font-semibold text-brand" target="_blank" rel="noreferrer" href={'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(order.latitude != null && order.longitude != null ? order.latitude + ',' + order.longitude : order.endereco)}>Navegar até o serviço</a>}<ExecutorWorkMap activity={activity} cityId={context.municipality.city_id} items={workPoints.length ? workPoints : [{ ...order, tipo: 'ordem' }]} compact />
        {reports.length > 0 && <section className="space-y-2 rounded-xl border border-edge-subtle p-4"><h2 className="font-bold">Solicitações vinculadas</h2>{reports.map(report => <article key={report.report_id} className="space-y-1 border-b border-edge-subtle py-2 text-sm last:border-0"><p className="font-semibold">{report.status === 'resolved' ? '✓' : '○'} {report.title}</p>{report.description && <p className="whitespace-pre-line text-content-secondary">{report.description}</p>}{report.address && <p className="text-xs text-content-secondary">{[report.address, report.neighborhood].filter(Boolean).join(' · ')}</p>}{report.featured_image_url && <img src={report.featured_image_url} alt="Foto da solicitação" loading="lazy" className="max-h-56 max-w-full rounded-lg object-contain" />}</article>)}</section>}
      </div><section className="min-w-0 space-y-4 rounded-2xl border border-edge-subtle bg-surface-raised p-4 sm:p-5"><h2 className="text-lg font-extrabold">Registrar atendimento</h2>
        {!finished ? <><p role="status" className="text-xs text-content-secondary">{draftNotice}</p>{reports.length > 0 && !pendingReports.length && <Button disabled={busy} onClick={() => submit('encerrar')}>Encerrar ordem com solicitações já atendidas</Button>}{order.status !== 'em_andamento' && <Button disabled={busy} onClick={() => submit('iniciar')}>Iniciar serviço</Button>}
          {pendingReports.length > 0 && <label className="block text-sm font-semibold">Solicitação<select aria-label="Solicitação a atender" value={form.reportId} disabled={busy} onChange={event => update('reportId', event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-surface-raised px-2">{pendingReports.map(report => <option key={report.report_id} value={report.report_id}>{report.title}</option>)}</select></label>}
          <fieldset disabled={busy}><legend className="mb-2 text-sm font-semibold">Serviços executados</legend><div className="grid gap-2 sm:grid-cols-2">{activity.services.map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-edge-subtle p-2 text-sm"><input type="checkbox" checked={form.services.includes(key)} onChange={event => update('services', event.target.checked ? [...form.services, key] : form.services.filter(id => id !== key))} />{label}</label>)}</div></fieldset>
          <label className="block text-sm font-semibold">{impediment ? 'Impedimento encontrado' : 'Resultado do serviço'}<textarea aria-label="Resultado do serviço" rows={4} maxLength={4000} disabled={busy} value={form.result} onChange={event => update('result', event.target.value)} className="mt-2 w-full rounded-lg border bg-surface-raised p-3 font-normal" /></label>
          <label className="block text-sm font-semibold">Registro técnico interno (opcional)<textarea aria-label="Registro técnico interno" rows={3} maxLength={5000} disabled={busy} value={form.note} onChange={event => update('note', event.target.value)} className="mt-2 w-full rounded-lg border bg-surface-raised p-3 font-normal" /></label>
          <label className="block text-sm font-semibold">Fotos ou documentos (opcional)<input aria-label="Evidências do serviço" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={addFiles} className="mt-2 block w-full min-w-0 text-xs" /></label>
          {form.files.map(({ id: fileId, file }) => <div key={fileId} className="flex min-w-0 items-center justify-between gap-2 text-xs"><span className="truncate">{file.name}</span><Button variant="ghost" size="icon" disabled={busy} aria-label={'Remover ' + file.name} onClick={() => update('files', form.files.filter(item => item.id !== fileId))}><X className="h-4 w-4" /></Button></div>)}
          {activity.id === 'arborizacao' && <p className="text-xs text-content-secondary">O manejo da árvore vinculada será registrado no inventário. As notas e evidências permanecem internas.</p>}
          {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
          <div className="flex flex-wrap gap-3"><Button disabled={busy || order.status !== 'em_andamento'} onClick={() => submit(impediment ? 'impedimento' : 'concluir')}>{busy ? 'Enviando…' : impediment ? 'Registrar impedimento' : 'Registrar execução'}</Button><Button variant="outline" disabled={busy} onClick={() => setImpediment(value => !value)}>{impediment ? 'Voltar à execução' : 'Informar impedimento'}</Button></div>
        </> : <p className="text-sm text-content-secondary">{order.status === 'aguardando_confirmacao' ? 'Execução enviada ao gestor para conferência.' : 'Consulte o resultado e o histórico deste serviço.'}</p>}
        <DemandAttachments files={data.attachments} />
      </section></div><MunicipalDemandHistory events={data.events} context={context} /></>}
  </div>;
}
