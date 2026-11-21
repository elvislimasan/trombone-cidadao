import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useCity } from '@/contexts/CityContext';
import { supabase } from '@/lib/customSupabaseClient';
import { legislativePath, legislativeRecordTarget, legislativeRpc } from '@/lib/legislative';
import useLegislativeData from '@/hooks/useLegislativeData';
import { LegislativeMatterCard, LegislativeRelatedRecords, LegislativeState } from '@/components/legislative/LegislativeComponents';
import '@/components/legislative/legislative.css';
import IdentityRow from '@/components/legislative/LegislativeIdentityRow';
import ClassificationForm from '@/components/legislative/LegislativeClassificationForm';
import LegislativeCollectionReview from '@/components/legislative/LegislativeCollectionReview';

const runLabels = { running: 'Coletando', ready: 'Pronto para revisão', published: 'Publicado', failed: 'Falhou', cancelled: 'Cancelado' };
const jobLabels = { pending: 'Na fila', working: 'Consultando', done: 'Conferido', failed: 'Falhou' };

function RelatedForm({ data, disabled, onSave }) {
  const [link, setLink] = useState(''), [note, setNote] = useState(''), [error, setError] = useState('');
  const payload = { matter_id: data.matter.id, version_hash: data.matter.hash };
  return <section className="mt-6 border-t pt-5"><h3 className="font-semibold">Registros relacionados</h3><p className="legislative-notice">Vínculo público revisado. Não comprova execução do serviço nem autoria do atendimento.</p><LegislativeRelatedRecords records={data.related} disabled={disabled} onRemove={id => onSave('unrelate', { ...payload, id })} /><form className="legislative-review-form" onSubmit={event => { event.preventDefault();const target = legislativeRecordTarget(link);if (!target) { setError('Cole o link de uma bronca ou rua do Trombone.');return; }setError('');onSave('relate', { ...payload, ...target, note }); }}><label>Link da bronca ou rua<input required value={link} maxLength={1000} onChange={event => setLink(event.target.value)} placeholder="/bronca/… ou /mapa-pavimentacao/rua/…" /></label><label>Justificativa pública do vínculo<textarea required minLength={5} maxLength={600} value={note} onChange={event => setNote(event.target.value)} /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button variant="outline" disabled={disabled} className="w-fit">Confirmar vínculo com o registro</Button></form></section>;
}

export default function ManageLegislativePage() {
  const { cities, activeCityId } = useCity();const [params, setParams] = useSearchParams();
  const cityId = Number(params.get('cidade') || activeCityId || 64);const matterId = Number(params.get('materia'));const personId = Number(params.get('parlamentar'));
  const [revision, setRevision] = useState(0);const [state, setState] = useState({ cityId: null, data: null, loading: true, error: '' });
  const [busy, setBusy] = useState(false);const [notice, setNotice] = useState('');const [tab, setTab] = useState(matterId ? 'review' : personId ? 'identities' : 'collection');const [activeOnly, setActiveOnly] = useState(true);
  const mounted = useRef(true);const work = useRef(false);
  useEffect(() => { mounted.current = true;return () => { mounted.current = false; }; }, []);
  const load = useCallback(async () => {
    const data = await legislativeRpc(supabase, 'legislative_admin', { p_city: cityId });return data;
  }, [cityId]);
  useEffect(() => {
    let active = true;setState({ cityId, data: null, loading: true, error: '' });
    load().then(data => { if (active) setState({ cityId, data, loading: false, error: '' }); }).catch(error => { if (active) setState({ cityId, data: null, loading: false, error: error.message }); });
    return () => { active = false; };
  }, [load, revision]);
  const data = state.cityId === cityId ? state.data : null;const source = data?.source;const run = data?.runs?.[0];
  const selectedMatter = useLegislativeData(matterId > 0 ? cityId : null, 'matter', { id: matterId }, revision);
  const refresh = () => setRevision(value => value + 1);
  const save = async (action, payload) => {
    if (work.current) return;work.current = true;setBusy(true);setNotice('');
    try { await legislativeRpc(supabase, 'legislative_decide', { p_city: cityId, p_action: action, p_data: payload });setNotice(action === 'bind' ? payload.create ? 'Perfil criado e vinculado.' : 'Perfil vinculado.' : 'Alteração salva.');refresh(); } catch (error) { setNotice(error.message); } finally { work.current = false;if (mounted.current) setBusy(false); }
  };
  const reviewCollection = async note => {
    if (work.current) return;work.current = true;setBusy(true);setNotice('');
    try { await legislativeRpc(supabase, 'legislative_review_collection', { p_city: cityId, p_run: run.id, p_note: note });setNotice('Conferência registrada.');refresh(); } catch (error) { setNotice(error.message); } finally { work.current = false;if (mounted.current) setBusy(false); }
  };
  const invoke = async body => { const { data, error } = await supabase.functions.invoke('collect-legislative-data', { body });if (error || data?.error) throw Error(data?.error || 'Não foi possível executar o coletor. Confira a instalação da função neste ambiente.');return data; };
  const collect = async (fresh = false) => {
    if (work.current) return;work.current = true;setBusy(true);setNotice('');
    try {
      const id = !fresh && run?.status === 'running' ? run.id : (await invoke({ action: !fresh && run?.status === 'failed' ? 'resume' : 'start', city_id: cityId, run_id: run?.id })).run_id;
      while (mounted.current) {
        const slice = await invoke({ action: 'process', city_id: cityId, run_id: id });
        const next = await load();if (!mounted.current) break;
        setState({ cityId, data: next, loading: false, error: '' });
        const current = next.runs.find(item => item.id === id);
        if (!current || current.status !== 'running' || slice.errors?.length || slice.pages === 0) { setNotice(current?.status === 'ready' ? current.summary?.quality?.blocked ? 'Alteração inesperada na fonte. Confira antes de publicar.' : 'Coleta conferida. Revise os dados antes de publicar.' : current?.error || 'Progresso salvo. A coleta pode ser retomada.');break; }
      }
    } catch (error) { if (mounted.current) setNotice(error.message); } finally { work.current = false;if (mounted.current) setBusy(false); }
  };
  const setCity = id => { if (busy) return;setNotice('');setParams({ cidade: id }); };
  return <main className="legislative-page page-shell-fluid"><Helmet><title>Gestão legislativa | Trombone Cidadão</title><meta name="robots" content="noindex" /></Helmet><header className="legislative-heading"><div><Link to="/admin" className="mb-3 inline-flex items-center gap-2 text-sm text-brand"><ArrowLeft size={16} />Admin</Link><h1>Gestão legislativa</h1></div><label className="grid gap-1 text-xs">Cidade<select aria-label="Cidade da gestão legislativa" disabled={busy} value={cityId} onChange={event => setCity(event.target.value)}>{cities.map(city => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label></header>
    <div className="legislative-admin-actions">{[['collection', 'Coleta'], ['identities', 'Vereadores'], ['review', 'Revisões']].map(([id, label]) => <Button key={id} variant={tab === id ? 'default' : 'outline'} onClick={() => setTab(id)}>{label}</Button>)}<Button variant="outline" disabled={busy} onClick={refresh}><RefreshCw size={16} />Atualizar</Button>{source && <Button asChild variant="outline"><Link to={legislativePath(cityId)}>Ver Câmara</Link></Button>}</div>
    {state.loading && <p role="status" className="legislative-notice">Consultando a integração…</p>}{state.error && <p role="alert" className="legislative-notice">{state.error}</p>}{data?.state === 'unconfigured' && <p role="status" className="legislative-notice">Fonte ainda não configurada nesta cidade.</p>}{notice && <p role="status" className="legislative-notice">{notice}</p>}
    {source && tab === 'collection' && <><section className="legislative-panel"><div className="legislative-section-heading"><h2>{source.name}</h2><a href={source.base_url} target="_blank" rel="noreferrer">Fonte oficial</a></div><div className="legislative-admin-actions"><Button disabled={busy || !source.enabled} onClick={() => collect()}>{busy ? <Loader2 size={17} className="animate-spin" /> : <Play size={17} />}{run?.status === 'running' ? 'Continuar coleta' : run?.status === 'failed' ? 'Retomar coleta' : 'Coletar agora'}</Button>{run?.status === 'failed' && <Button variant="outline" disabled={busy} onClick={() => collect(true)}>Iniciar nova coleta</Button>}{run?.status === 'ready' && <Button disabled={busy || (run.summary?.quality?.blocked && !run.summary?.quality?.reviewed)} onClick={() => save('publish', { run_id: run.id })}>Publicar acervo conferido</Button>}{['ready', 'running'].includes(run?.status) && !busy && <Button variant="outline" onClick={() => save('cancel', { run_id: run.id })}>Cancelar esta coleta</Button>}</div><div className="grid gap-4 md:grid-cols-2"><label className="flex items-center justify-between gap-4 rounded-xl border p-4"><span className="text-sm font-semibold">Coleta diária · 03h Fortaleza</span><Switch className="legislative-setting-switch" checked={source.daily_enabled} disabled={busy} onCheckedChange={async enabled => { setBusy(true);setNotice('');try { await legislativeRpc(supabase, 'legislative_set_daily', { p_city: cityId, p_enabled: enabled });refresh(); } catch (error) { setNotice(error.message); } finally { setBusy(false); } }} /></label><label className="flex items-center justify-between gap-4 rounded-xl border p-4"><span className="text-sm font-semibold">Publicar próximas coletas automaticamente</span><Switch className="legislative-setting-switch" checked={source.auto_publish} disabled={busy || !source.published_run_id} onCheckedChange={enabled => save('auto_publish', { enabled })} /></label></div><p className="legislative-notice">A primeira publicação exige revisão. Uma coleta incompleta mantém o último acervo publicado. Classificações e vínculos são revisados separadamente.</p>{source.last_error && <p role="alert" className="text-sm text-destructive">{source.last_error}</p>}</section>{run && <section className="legislative-panel mt-5"><div className="legislative-section-heading"><h2>{runLabels[run.status]}</h2><span className="text-xs text-content-secondary">{new Date(run.started_at).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}</span></div><LegislativeCollectionReview key={run.id} run={run} disabled={busy} onReview={reviewCollection} />{run.summary?.period_warning && <p className="legislative-notice">{run.summary.period_warning}</p>}<div className="legislative-admin-table"><table><thead><tr><th>Recurso</th><th>Recebidos</th><th>Total na fonte</th><th>Estado</th></tr></thead><tbody>{data.jobs.map(job => <tr key={job.id}><td>{job.resource_key}</td><td>{job.received}</td><td>{job.expected_total ?? '—'}</td><td>{jobLabels[job.status]}{job.error && <p className="text-xs text-destructive">{job.error}</p>}</td></tr>)}</tbody></table></div></section>}</>}
    {source && tab === 'identities' && <section className="legislative-panel"><h2>Conciliar perfis</h2><p className="legislative-notice">Confirme a identidade antes de vincular. O vínculo preserva a conta responsável, a biografia e os contatos do perfil.</p><label className="mb-4 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={activeOnly} onChange={event => setActiveOnly(event.target.checked)} />Ativos no cadastro da Câmara</label>{personId > 0 && <Button variant="outline" className="mb-4" onClick={() => setParams({ cidade: String(cityId) })}>Ver todos os cadastros</Button>}<div className="legislative-admin-table"><table><thead><tr><th>Cadastro oficial</th><th>Perfil no Trombone</th><th>Ação</th></tr></thead><tbody>{data.parliamentarians.filter(person => personId ? person.id === personId : !activeOnly || person.data.active).map(person => <IdentityRow key={`${person.id}-${person.link?.councilor_id}`} person={person} councilors={data.councilors} disabled={busy} onSave={save} />)}</tbody></table></div>{!data.parliamentarians.length && <p className="legislative-notice">Conclua uma coleta para revisar as identidades.</p>}</section>}
    {source && tab === 'review' && <><section className="legislative-panel"><h2>Classificar matéria</h2><form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault();const id = new FormData(event.currentTarget).get('matter');setParams({ cidade: String(cityId), materia: String(id) }); }}><label className="grid gap-2 text-xs">ID da matéria na Câmara<input name="matter" type="number" min={1} required defaultValue={matterId || ''} /></label><Button type="submit" variant="outline">Consultar</Button></form>{matterId > 0 && <div className="mt-5"><LegislativeState query={selectedMatter} onRetry={refresh} />{selectedMatter.data?.state === 'ready' && <><LegislativeMatterCard matter={selectedMatter.data.matter} cityId={cityId} /><ClassificationForm key={`${selectedMatter.data.matter.id}-${revision}`} matter={selectedMatter.data.matter} disabled={busy} onSave={save} /><RelatedForm key={`related-${selectedMatter.data.matter.id}-${revision}`} data={selectedMatter.data} disabled={busy} onSave={save} /></>}</div>}</section><section className="legislative-panel mt-5"><h2>Correções solicitadas ({data.corrections.length})</h2><div className="legislative-list mt-4">{data.corrections.map(item => <CorrectionReview key={item.id} item={item} disabled={busy} onSave={save} cityId={cityId} />)}{!data.corrections.length && <p className="text-sm text-content-secondary">Nenhuma correção pendente.</p>}</div></section></>}
  </main>;
}

function CorrectionReview({ item, onSave, disabled, cityId }) {
  const [response, setResponse] = useState('');
  return <article className="rounded-xl border p-4"><p className="text-sm">{item.message}</p>{item.matter_id && <Link className="mt-2 inline-block text-sm text-brand" to={legislativePath(cityId, `/materias/${item.matter_id}`)}>Ver matéria {item.matter_id}</Link>}<form className="legislative-review-form" onSubmit={event => { event.preventDefault();onSave('correction', { id: item.id, response }); }}><label>Resultado da revisão<textarea required minLength={5} maxLength={3000} value={response} onChange={event => setResponse(event.target.value)} /></label><Button variant="outline" disabled={disabled} className="w-fit">Registrar resposta</Button></form></article>;
}
