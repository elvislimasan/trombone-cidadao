import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BarChart3, ClipboardList, Download, Droplets, LockKeyhole, MapPin, Plus, RefreshCw, Route, Truck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MunicipalEmptyState, MunicipalPageHeader } from '@/components/municipality/MunicipalPageUi';
import useMunicipalityWorkspace from '@/hooks/useMunicipalityWorkspace';
import PipaManagementMap from '@/components/municipality/PipaManagementMap';
import PipaManagementSummary from '@/components/municipality/PipaManagementSummary';
import PipaManagementStats from '@/components/municipality/PipaManagementStats';
import PipaManagementRecords from '@/components/municipality/PipaManagementRecords';
import PipaLoginDetails from '@/components/municipality/PipaLoginDetails';
import PipaRequests from '@/components/municipality/PipaRequests';
import PipaTankList from '@/components/municipality/PipaTankList';
import PipaFilterBar from '@/components/municipality/PipaFilterBar';
import PipaDeliveryHistory from '@/components/municipality/PipaDeliveryHistory';
import { pipaWaterLevels, pipaWaterPriority } from '@/lib/pipaWaterLevel';
import PipaRoutes from '@/components/municipality/PipaRoutes';
import PipaRoutePlanner from '@/components/municipality/PipaRoutePlanner';
import PipaForm, { PipaField, PipaSelect } from '@/components/municipality/PipaForm';
import { loadPipaData, pipaRpc } from '@/lib/pipaApi';
import { PIPA_PATH, PIPA_PROVIDERS, PIPA_KINDS, PIPA_STATUSES, pipaCalendarMonth, pipaCapabilities, pipaDateTime, pipaNumber, pipaPeriod, pipaStatistics } from '@/lib/pipa';
import '@/components/municipality/pipa.css';

const EMPTY = { tanks: [], drivers: [], requests: [], deliveries: [], quotas: [], routes: [] };
const TABS = [['mapa', 'Mapa', MapPin], ['caixas', 'Caixas d’água', Droplets], ['pipeiros', 'Pipeiros', Truck], ['rotas', 'Rotas', Route], ['solicitacoes', 'Solicitações', ClipboardList], ['abastecimentos', 'Abastecimentos', ClipboardList], ['estatisticas', 'Estatísticas', BarChart3]];
export { default as PipaTable } from '@/components/municipality/PipaTable';
function Badge({ children, tone }) { return <span className="pipa-badge" data-tone={tone}>{children}</span>; }
export default function OperationPipaPage() {
  const workspace = useMunicipalityWorkspace(), { search } = useLocation(), navigate = useNavigate(), { section = 'mapa' } = useParams();
  const { channels, canManage, canRequest } = pipaCapabilities(workspace);
  const channelKey = channels.map(c => c.id).sort().join(','), scopeKey = `${workspace.userId}:${workspace.municipality?.id}:${channelKey}`;
  const [state, setState] = useState({ key: '', data: EMPTY, loading: true }), [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [form, setForm] = useState(null), [selectedId, setSelectedId] = useState('');
  const [text, setText] = useState(''), [provider, setProvider] = useState('');
  const [levelFilter, setLevelFilter] = useState(''), [periodPreset, setPeriodPreset] = useState('month');
  const [period, setPeriod] = useState(pipaPeriod('month')), [driver, setDriver] = useState(''), [locality, setLocality] = useState('');
  const version = useRef(0), mounted = useRef(true), tabsRef = useRef(null);
  const data = state.key === scopeKey ? state.data : EMPTY;
  const refresh = useCallback(async (quiet = false) => {
    const requestVersion = ++version.current;
    if (!channelKey) { setState({ key: scopeKey, data: EMPTY, loading: false }); return; }
    if (!quiet) setRefreshing(true);
    try {
      const result = await loadPipaData(channelKey.split(',').map(id => ({ id })));
      if (mounted.current && version.current === requestVersion) { setState({ key: scopeKey, data: result, loading: false }); setError(''); }
    } catch (failure) { if (mounted.current && version.current === requestVersion) { setError(failure.message || 'Não foi possível atualizar os dados.'); setState(s => ({ ...s, loading: false })); } }
    finally { if (mounted.current && version.current === requestVersion) setRefreshing(false); }
  }, [scopeKey, channelKey]);
  useEffect(() => {
    mounted.current = true; setForm(null); setSelectedId(''); setError(''); setNotice(''); refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(true); }, 20000);
    const focused = () => refresh(true); window.addEventListener('focus', focused);
    return () => { mounted.current = false; version.current++; clearInterval(timer); window.removeEventListener('focus', focused); };
  }, [refresh]);
  useEffect(() => { setText(''); setLevelFilter(''); setNotice(''); }, [section]);
  useEffect(() => { tabsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block:'nearest', inline:'nearest' }); }, [section]);
  useEffect(() => { setSelectedId(''); }, [text, provider, levelFilter]);
  const stats = useMemo(() => pipaStatistics(data, { ...period, provider, driver, locality }), [data, period, provider, driver, locality]);
  const levels = useMemo(() => pipaWaterLevels(data.tanks, data.deliveries, data.requests), [data.tanks, data.deliveries, data.requests]);
  const selected = data.tanks.find(t => t.id === selectedId);
  const match = row => (!provider || row.provider === provider) && (!text || [row.name, row.system_code, row.official_code, row.locality, row.plate, row.requester_name, row.destination_name, row.driver_name].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(text.toLocaleLowerCase('pt-BR')));
  const tanks = useMemo(() => data.tanks.filter(t => !t.archived_at).filter(match).filter(t => !levelFilter || (levelFilter === 'attention' ? levels.get(t.id)?.needsAttention : levels.get(t.id)?.state === levelFilter)).sort((a, b) => pipaWaterPriority(a, b, levels)), [data.tanks, provider, text, levelFilter, levels]);
  const editAllowed = channelId => channels.find(c => c.id === channelId)?.manage;
  const open = (mode, value = {}) => { setNotice(''); setForm({ mode, value }); };
  const act = async action => { try { setError(''); await action(); await refresh(); setNotice('Registro atualizado.'); } catch (failure) { setError(failure.message); } };
  const exportReport = async () => {
    try {
      const { exportPipaReport } = await import('@/lib/pipaReport');
      await exportPipaReport({ municipality: workspace.municipality?.nome, stats, period, provider, driverName: data.drivers.find(d => d.id === driver)?.name, locality });
    } catch (failure) { setError(failure.message || 'Não foi possível gerar o relatório.'); }
  };
  if (!channels.length) return <div className="page-shell-fluid pipa-page pipa-management-page"><MunicipalPageHeader title="Operação-pipa" /><MunicipalEmptyState title={workspace.waterError || 'Operação-pipa não habilitada'} action={workspace.isAdministrator && <Button asChild><Link to="/prefeitura/secretarias">Configurar secretarias</Link></Button>} /><p className="pipa-note">Habilite Operação-pipa nos inventários da secretaria e atribua os cargos da equipe.</p></div>;
  const periodControls = <>
    <PipaSelect label="Período" required={false} value={periodPreset} onChange={v => { setPeriodPreset(v); if (v !== 'custom') setPeriod(pipaPeriod(v)); }}><option value="custom">Personalizado</option><option value="month">Este mês</option><option value="previous">Mês anterior</option><option value="year">Este ano</option><option value="last12">Últimos 12 meses</option></PipaSelect>
    <PipaField label="De"><input className="pipa-input" type="date" value={period.from} max={period.to} onChange={e => { if (e.target.value) { setPeriodPreset('custom'); setPeriod(p => ({ ...p, from: e.target.value })); } }} /></PipaField>
    <PipaField label="Até"><input className="pipa-input" type="date" value={period.to} min={period.from} onChange={e => { if (e.target.value) { setPeriodPreset('custom'); setPeriod(p => ({ ...p, to: e.target.value })); } }} /></PipaField>
    <PipaSelect label="Pipeiro" required={false} value={driver} onChange={setDriver}><option value="">Todos</option>{data.drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</PipaSelect>
    <PipaSelect label="Localidade" required={false} value={locality} onChange={setLocality}><option value="">Todas</option>{[...new Set(data.deliveries.map(d => d.locality))].sort().map(l => <option key={l}>{l}</option>)}</PipaSelect>
  </>;
  const currentPeriod=pipaPeriod('month');
  const periodLabel=period.from===currentPeriod.from&&period.to===currentPeriod.to ? 'Este mês' : [period.from,period.to].map(day=>day.split('-').reverse().join('/')).join(' – ');
  const reportFilterLabels=[periodLabel==='Este mês'?'':periodLabel,provider ? PIPA_PROVIDERS[provider] : '',driver ? 'Pipeiro: '+data.drivers.find(d=>d.id===driver)?.name : '',locality ? 'Localidade: '+locality : ''].filter(Boolean);
  const resetReportFilters=()=>{setProvider('');setDriver('');setLocality('');setPeriodPreset('month');setPeriod(pipaPeriod('month'))};
  const providerControl=<PipaSelect label="Abastecimento habitual" required={false} value={provider} onChange={setProvider}><option value="">Prefeitura e Exército</option>{Object.entries(PIPA_PROVIDERS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</PipaSelect>;
  const reportFilters=<><PipaSelect label="Entrega realizada por" required={false} value={provider} onChange={setProvider}><option value="">Prefeitura e Exército</option>{Object.entries(PIPA_PROVIDERS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</PipaSelect>{periodControls}</>;
  return <div className="page-shell-fluid pipa-page pipa-management-page">
    <MunicipalPageHeader title="Operação-pipa" action={<><Badge><LockKeyhole size={12} />Privado</Badge><Button variant="outline" size="sm" onClick={() => refresh()} disabled={refreshing}><RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Atualizar</Button>{section === 'abastecimentos' && canManage ? <Button onClick={() => open('manual')}><Plus className="mr-2 h-4 w-4" />Lançar abastecimento</Button> : canRequest && <Button onClick={() => open('request')}><Plus className="mr-2 h-4 w-4" />Solicitar água</Button>}</>} />
    {error && <p className="pipa-error" role="alert">{error}</p>}{notice && <p className="pipa-success" role="status">{notice}</p>}
    <nav ref={tabsRef} className="pipa-tabs" aria-label="Operação-pipa">{TABS.map(([id, label, Icon]) => <NavLink key={id} to={`${PIPA_PATH}/${id}${search}`} end><Icon size={17} />{label}{id === 'solicitacoes' && stats.urgent > 0 && <Badge tone="urgent">{stats.urgent}</Badge>}</NavLink>)}</nav>
    <label className="pipa-mobile-section"><span className="sr-only">Seção da operação-pipa</span><select aria-label="Seção da operação-pipa" value={section} onChange={event => navigate(`${PIPA_PATH}/${event.target.value}${search}`)}>{TABS.map(([id, label]) => <option key={id} value={id}>{label}{id === 'solicitacoes' && stats.urgent > 0 ? ` (${stats.urgent})` : ''}</option>)}</select></label>
    {(state.loading || state.key !== scopeKey) && !error ? <p role="status">Carregando registros…</p> : <>
      {['mapa','caixas'].includes(section) && <PipaFilterBar search={text} onSearch={setText} placeholder="Buscar caixa ou localidade" labels={provider?[PIPA_PROVIDERS[provider]]:[]} onClear={()=>{setText('');setProvider('');setLevelFilter('')}} secondary={<PipaManagementSummary tanks={data.tanks.filter(t=>!t.archived_at&&(section==='caixas'||t.active)&&(!provider||t.provider===provider))} levels={levels} levelFilter={levelFilter} onFilter={setLevelFilter}/>} actions={canManage&&<Button variant="secondary" onClick={()=>open('tank')}><Plus size={15} className="mr-2"/>Cadastrar caixa</Button>}>{providerControl}</PipaFilterBar>}
      {section==='pipeiros' && <PipaFilterBar search={text} onSearch={setText} placeholder="Buscar pipeiro ou placa" labels={[provider?PIPA_PROVIDERS[provider]:'',period.from.slice(0,7)!==currentPeriod.from.slice(0,7)?'Cotas: '+period.from.slice(0,7).split('-').reverse().join('/'): ''].filter(Boolean)} onClear={()=>{setText('');setProvider('')}} actions={canManage&&<Button onClick={()=>open('driver')}><Plus size={15} className="mr-2"/>Cadastrar pipeiro</Button>}>{providerControl}<PipaField label="Mês das cotas"><input className="pipa-input" type="month" value={period.from.slice(0,7)} onChange={e=>{if(e.target.value){setPeriodPreset('custom');setPeriod(pipaCalendarMonth(e.target.value))}}}/></PipaField></PipaFilterBar>}
      {section==='solicitacoes' && <PipaRequests data={data} canEdit={editAllowed} onOpen={open} />}
      {section==='estatisticas' && <PipaFilterBar labels={reportFilterLabels} onClear={resetReportFilters} actions={<Button variant="outline" onClick={exportReport}><Download size={16} className="mr-2"/>Relatório PDF</Button>}>{reportFilters}</PipaFilterBar>}
      {section==='abastecimentos' && <PipaDeliveryHistory rows={stats.period} deliveries={data.deliveries} filters={reportFilters} filterLabels={reportFilterLabels} onReset={resetReportFilters} canEdit={editAllowed} onManual={value=>open('manual',value)}/>}
      {section==='pipeiros' && <PipaManagementRecords section={section} data={data} stats={stats} period={period} match={match} editAllowed={editAllowed} open={open} />}
      {section === 'rotas' && <PipaRoutes data={data} onPlan={canManage ? () => open('route') : undefined} canCancel={route => editAllowed(route.channel_id)} onCancel={id => act(() => pipaRpc('pipa_cancel_route', { p_route: id }))} />}
      {section === 'mapa' && <PipaManagementMap tanks={tanks} selected={selected} levels={levels} city={workspace.municipality?.cidade} requests={data.requests} onSelect={setSelectedId} onOpen={open} canRequest={canRequest} canEdit={editAllowed} />}
      {section === 'caixas' && <PipaTankList tanks={tanks} levels={levels} canEdit={editAllowed} canRequest={canRequest} onOpen={open} />}
      {section === 'estatisticas' && <PipaManagementStats stats={stats} />}
    </>}
    {form?.mode === 'login-details' && <PipaLoginDetails key={form.value.id} driver={form.value} onClose={() => setForm(null)} />}
    {form?.mode === 'route' && <PipaRoutePlanner data={data} levels={levels} channels={channels} city={workspace.municipality?.cidade} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await refresh(); setNotice('Rota planejada.'); }} />}
    {form?.mode === 'cancel' ? <div className="pipa-panel p-5" role="alertdialog" aria-labelledby="pipa-cancel-title"><h2 id="pipa-cancel-title" className="font-bold">Cancelar a solicitação de {form.value.locality}?</h2><p className="pipa-note my-3">O pipeiro não poderá registrar uma entrega para esta solicitação.</p><div className="pipa-actions"><Button variant="outline" onClick={() => setForm(null)}>Voltar</Button><Button onClick={() => act(async () => { await pipaRpc('pipa_dispatch', { p_request: form.value.id, p_cancel: true }); setForm(null); })}>Confirmar cancelamento</Button></div></div> : form && form.mode !== 'route' && form.mode !== 'login-details' && <PipaForm key={`${form.mode}:${form.value.id || ''}`} {...form} data={data} channels={channels} city={workspace.municipality?.cidade} onClose={() => setForm(null)} onSaved={async (close = true) => { if (close) { setForm(null); setNotice('Registro salvo.'); } await refresh(); }} />}
  </div>;
}
