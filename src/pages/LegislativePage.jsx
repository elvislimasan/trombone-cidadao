import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, NavLink, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, LayoutGrid, Users, CalendarDays, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCity } from '@/contexts/CityContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import useLegislativeData from '@/hooks/useLegislativeData';
import { legislativeFilters, legislativePath, legislativeRpc } from '@/lib/legislative';
import { LegislativeState, LegislativeMatterList, LegislativePagination } from '@/components/legislative/LegislativeComponents';
import '@/components/legislative/legislative.css';
import '@/components/legislative/legislative-workspace.css';
import '@/components/legislative/legislative-analytics.css';
import '@/components/legislative/legislative-attendance.css';
import '@/components/legislative/legislative-places-sessions.css';
import Filters from '@/components/legislative/LegislativeFilters';
import Directory from '@/components/legislative/LegislativeDirectory';
import LegislativeParliamentarian from '@/components/legislative/LegislativeParliamentarian';
import LegislativeRecurrences from '@/components/legislative/LegislativeRecurrences';
import LegislativePageInfo from '@/components/legislative/LegislativePageInfo';
import LegislativeOverview from '@/components/legislative/LegislativeOverview';
import LegislativeSessions from '@/components/legislative/LegislativeSessions';
import LegislativeCityPicker from '@/components/legislative/LegislativeCityPicker';
import useLegislativeView from '@/hooks/useLegislativeView';
import LegislativeWorkspace from '@/components/legislative/LegislativeWorkspace';
import MatterDetail from '@/components/legislative/LegislativeMatterDetail';
import SessionDetail from '@/components/legislative/LegislativeSessionDetail';

export function LegislativeEntry() {
  const { activeCityId } = useCity();
  return <Navigate replace to={legislativePath(activeCityId || 64)} />;
}

function CorrectionForm({ cityId, matterId, context }) {
  const { user } = useAuth();const [message, setMessage] = useState('');const [state, setState] = useState('');const [busy, setBusy] = useState(false);
  return <details data-legislative-correction className="legislative-method"><summary>Informar erro</summary><div>{!user ? <Button asChild variant="outline"><Link to="/login">Entre para informar um erro</Link></Button> : <form className="legislative-review-form" onSubmit={async event => {
    event.preventDefault();if (busy) return;setBusy(true);setState('');
    try { await legislativeRpc(supabase, 'legislative_report_error', { p_city: Number(cityId), p_matter: matterId == null ? null : Number(matterId), p_message: [context, message.trim()].filter(Boolean).join('\n') });setMessage('');setState('Solicitação enviada para revisão.'); } catch (error) { setState(error.message); } finally { setBusy(false); }
  }}><label>O que precisa ser conferido?<textarea required minLength={10} maxLength={2800} value={message} onChange={event => setMessage(event.target.value)} /></label><Button disabled={busy} className="w-fit">{busy ? 'Enviando…' : 'Enviar para revisão'}</Button><p role="status">{state}</p></form>}</div></details>;
}

export default function LegislativePage({ view = 'overview' }) {
  const { cityId, matterId, sessionId, parliamentarianId } = useParams();const { cities } = useCity();const navigate = useNavigate();const [params, setParams] = useSearchParams();const [revision, setRevision] = useState(0);
  const presentation = useLegislativeView();
  const filters = legislativeFilters(params);const invalidPeriod = filters.end < filters.start;
  const rpcFilters = ['matter', 'session'].includes(view) ? { id: Number(matterId || sessionId) } : { start: filters.start, end: filters.end, search: filters.search, territory: filters.territory, group_key: filters.group, parliamentarian_id: view === 'parliamentarian' ? Number(parliamentarianId) : filters.parliamentarianId, type_id: filters.typeId, councilor_id: filters.councilorId, topic: filters.topic, location: params.get('local') || null, page: filters.page };
  const query = useLegislativeData(invalidPeriod ? null : cityId, view, rpcFilters, revision);
  const data = query.data;const ready = data?.state === 'ready' && !invalidPeriod;
  const update = changes => setParams(current => { const next = new URLSearchParams(current);for (const [key, value] of Object.entries(changes)) { if (value === '' || value == null) next.delete(key);else next.set(key, String(value)); }if (!('pagina' in changes)) next.delete('pagina');return next; }, { replace: true });
  const city = cities.find(item => String(item.id) === String(cityId));
  const title = { parliamentarian: data?.parliamentarian?.data.parliamentary_name || 'Ficha parlamentar', overview: 'Radar legislativo', matters: 'Matérias', directory: 'Vereadores', sessions: 'Sessões', recurrences: 'Demandas recorrentes', matter: data?.matter ? `${data.matter.type_data.abbreviation} ${data.matter.data.number}/${data.matter.data.year}` : 'Matéria legislativa', session: 'Sessão da Câmara' }[view];
  const nav = [['', 'Radar', LayoutGrid], ['/vereadores', 'Vereadores', Users], ['/materias', 'Propostas', FileText], ['/sessoes', 'Sessões', CalendarDays], ['/demandas', 'Bairros', MapPin]];
  const base = legislativePath(cityId);
  return <main className="legislative-page legislative-public-page page-shell-fluid" data-layout={presentation.layout}><Helmet><title>{title} · {city?.name || 'Câmara'} | Trombone Cidadão</title><meta name="description" content="Consulte propostas, autores, sessões e votações da Câmara com acesso às fontes oficiais." /></Helmet>
    <LegislativeWorkspace heading={<header className="legislative-heading"><div className="legislative-heading-title"><div><small>Câmara Municipal</small><h1>{view === 'parliamentarian' ? 'Ficha parlamentar' : view === 'matter' ? title : view === 'session' ? 'Sessão da Câmara' : view === 'matters' ? 'Propostas' : view === 'recurrences' ? 'No seu bairro' : title}</h1></div></div><LegislativeCityPicker cityId={cityId} cities={cities} onChange={id => navigate(legislativePath(id))} /></header>}
      navigation={nav.map(([suffix, label, Icon]) => <NavLink key={suffix} to={base + suffix} end={suffix === ''}><Icon size={18} aria-hidden="true" /><span>{label}</span></NavLink>)}>
    {data?.source?.stale && <p className="legislative-inline-warning" role="status">Atualização pendente · exibindo o último acervo conferido.</p>}
    {['matter', 'session'].includes(view) && <Link className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-brand" to={base + (view === 'matter' ? '/materias' : '/sessoes')}><ArrowLeft size={16} />{view === 'matter' ? 'Matérias' : 'Sessões'}</Link>}
    {['overview', 'matters', 'sessions', 'recurrences', 'parliamentarian', 'directory'].includes(view) && <Filters key={`${cityId}-${view}`} params={params} update={update} data={data} filters={filters} simple={['sessions', 'recurrences', 'parliamentarian'].includes(view)} territory={view === 'recurrences'} directory={view === 'directory'} presentation={presentation} overview={view === 'overview'} profile={view === 'parliamentarian'} />}
    {invalidPeriod ? <p role="alert" className="legislative-notice">A data final precisa ser igual ou posterior à inicial.</p> : <LegislativeState query={query} onRetry={() => setRevision(value => value + 1)} />}
    {ready && <>
      {view === 'overview' && <LegislativeOverview data={data} cityId={cityId} filters={filters} presentation={presentation} />}
      {view === 'matters' && <><div className="legislative-section-heading"><h2>Propostas <span className="legislative-result-count">{data.total}</span></h2></div><LegislativeMatterList matters={data.matters} cityId={cityId} layout={presentation.layout} />{!data.total && <p className="legislative-notice">Nenhuma matéria encontrada neste filtro.</p>}<LegislativePagination page={data.page} total={data.total} onChange={page => update({ pagina: page })} /></>}
      {view === 'parliamentarian' && <LegislativeParliamentarian data={data} cityId={cityId} filters={filters} presentation={presentation} />}
      {view === 'directory' && <Directory data={data} cityId={cityId} search={filters.search} activeOnly={params.get('cadastro') !== 'todos'} layout={presentation.layout} />}
      {view === 'matter' && <MatterDetail data={data} cityId={cityId} />}
      {view === 'session' && <SessionDetail data={data} cityId={cityId} />}
      {view === 'sessions' && <LegislativeSessions data={data} cityId={cityId} layout={presentation.layout} onPage={page => update({ pagina: page })} filters={filters} onPeriodChange={update} />}
      {view === 'recurrences' && <LegislativeRecurrences data={data} cityId={cityId} layout={presentation.layout} />}
    </>}
    <LegislativePageInfo cityId={cityId} source={data?.source} correction={ready ? <CorrectionForm cityId={cityId} matterId={view === 'matter' ? Number(matterId) : null} context={`Camara ${cityId} / ${view} / ${parliamentarianId || matterId || sessionId || ''}`} /> : null} />
    </LegislativeWorkspace>
  </main>;
}
