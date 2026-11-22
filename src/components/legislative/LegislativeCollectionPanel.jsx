import React from 'react';
import { ArrowUpRight, CheckCircle2, Clock3, Loader2, Play, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import LegislativeCollectionReview from './LegislativeCollectionReview';
import { LegislativeRing } from './LegislativeCharts';

const runLabels = { running: 'Coletando', ready: 'Pronto para revisão', published: 'Publicado', failed: 'Falhou', cancelled: 'Cancelado' };
const jobLabels = { pending: 'Na fila', working: 'Consultando', done: 'Conferido', failed: 'Falhou' };
const resources = { absence_justifications: 'Ausências justificadas', matters: 'Matérias', parliamentarians: 'Parlamentares', authors: 'Autores', parties: 'Partidos', affiliations: 'Filiações', legislatures: 'Legislaturas', mandates: 'Mandatos', matter_types: 'Tipos de matéria', statuses: 'Situações de tramitação', units: 'Unidades de tramitação', authorships: 'Autorias', proceedings: 'Tramitações', sessions: 'Sessões', session_types: 'Tipos de sessão', agenda: 'Ordem do dia', expedient: 'Expediente', ballot_types: 'Resultados de votação', ballots: 'Votações', votes: 'Votos individuais', attendance: 'Presenças em sessão', agenda_attendance: 'Presenças na ordem do dia', norms: 'Normas', committees: 'Comissões' };
const resourceName = key => { const [, kind, year] = String(key).match(/^(.*?)(?:-(\d{4}))?$/);return `${resources[kind] || kind.replaceAll('_', ' ')}${year ? ` · ${year}` : ''}`; };
const number = value => value == null ? '—' : new Intl.NumberFormat('pt-BR').format(value);

export default function LegislativeCollectionPanel({ source, run, jobs, busy, onCollect, onSave, onDailyChange, onReview }) {
  const done = jobs.filter(job => job.status === 'done').length;
  const resources = [['done', 'Conferidos', '#139d89'], ['working', 'Em consulta', '#4383cd'], ['pending', 'Na fila', '#d69219'], ['failed', 'Com falha', '#df594b']].map(([key, label, color]) => ({ key, label, color, value: jobs.filter(job => job.status === key).length }));
  const other = jobs.length - resources.reduce((sum, row) => sum + row.value, 0);
  if (other) resources.push({ key: 'other', label: 'Outros estados', color: '#7b8595', value: other });
  return <div className="legislative-collection-layout">
    <section className="legislative-panel legislative-collection-source">
      <div className="legislative-section-heading"><h2>{source.name}</h2><a href={source.base_url} target="_blank" rel="noreferrer">Fonte oficial<ArrowUpRight size={15} aria-hidden="true" /></a></div>
      <div className="legislative-admin-actions legislative-collection-actions">
        {run?.status === 'ready' && <Button disabled={busy || (run.summary?.quality?.blocked && !run.summary?.quality?.reviewed)} onClick={() => onSave('publish', { run_id: run.id })}><Upload size={17} aria-hidden="true" />Publicar acervo conferido</Button>}
        <Button variant={run?.status === 'ready' ? 'outline' : 'default'} disabled={busy || !source.enabled} onClick={() => onCollect()}>{busy ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}{run?.status === 'running' ? 'Continuar coleta' : run?.status === 'failed' ? 'Retomar coleta' : 'Coletar agora'}</Button>
        {run?.status === 'failed' && <Button variant="outline" disabled={busy} onClick={() => onCollect(true)}>Iniciar nova coleta</Button>}
        {['ready', 'running'].includes(run?.status) && !busy && <Button variant="ghost" onClick={() => onSave('cancel', { run_id: run.id })}>Cancelar esta coleta</Button>}
      </div>
      <p className="legislative-notice">A primeira publicação exige revisão. Uma coleta incompleta mantém o último acervo publicado. Classificações e vínculos são revisados separadamente.</p>
      <div className="legislative-collection-settings">
        <label><span>Coleta diária <small>03h · Fortaleza</small></span><Switch aria-label="Coleta diária" className="legislative-setting-switch" checked={source.daily_enabled} disabled={busy} onCheckedChange={onDailyChange} /></label>
        <label><span>Publicar automaticamente</span><Switch aria-label="Publicar próximas coletas automaticamente" className="legislative-setting-switch" checked={source.auto_publish} disabled={busy || !source.published_run_id} onCheckedChange={enabled => onSave('auto_publish', { enabled })} /></label>
      </div>
      {source.last_error && <p role="alert" className="legislative-notice">{source.last_error}</p>}
    </section>
    {run && <section className="legislative-panel legislative-collection-run">
      <div className="legislative-section-heading"><h2>Conferência do acervo</h2><span className="legislative-run-status" data-status={run.status}>{run.status === 'published' ? <CheckCircle2 size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}{runLabels[run.status] || run.status}</span></div>
      <time className="legislative-run-date" dateTime={run.started_at}>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(run.started_at))}</time>
      {jobs.length > 0 && <div className="legislative-collection-progress"><div><strong>{done} de {jobs.length} {jobs.length === 1 ? 'recurso conferido' : 'recursos conferidos'}</strong><span>{Math.round(done / jobs.length * 100)}%</span></div><progress className="sr-only" aria-label="Recursos conferidos" value={done} max={jobs.length} /><LegislativeRing rows={resources} total={jobs.length} caption={jobs.length === 1 ? 'Recurso' : 'Recursos'} /></div>}
      <LegislativeCollectionReview key={run.id} run={run} disabled={busy} onReview={onReview} />
      {run.summary?.period_warning && <p className="legislative-notice">{run.summary.period_warning}</p>}
      <div className="legislative-admin-table legislative-jobs-table"><table aria-label="Conferência dos recursos da coleta"><thead><tr><th scope="col">Recurso</th><th scope="col">Recebidos</th><th scope="col">Total na fonte</th><th scope="col">Estado</th></tr></thead><tbody>{jobs.map(job => <tr key={job.id}>
        <td data-label="Recurso">{resourceName(job.resource_key)}</td><td data-label="Recebidos">{number(job.received)}</td><td data-label="Total na fonte">{number(job.expected_total)}</td><td data-label="Estado"><span className="legislative-job-status" data-status={job.status}>{job.status === 'done' && <CheckCircle2 size={15} aria-hidden="true" />}{jobLabels[job.status] || job.status}</span>{job.error && <p className="legislative-job-error">{job.error}</p>}</td>
      </tr>)}</tbody></table></div>
    </section>}
  </div>;
}
