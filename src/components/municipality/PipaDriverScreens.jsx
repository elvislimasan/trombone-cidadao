import React, { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, ClipboardList, History, KeyRound, LocateFixed, LogOut, Map, MapPin, Moon, Navigation, Play, RefreshCw, Route, Sun, Truck, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PipaTable from './PipaTable';
import PipaDriverOverview from './PipaDriverOverview';
import PipaMap from './PipaMap';
import PipaRoutes from './PipaRoutes';
import PipaRoutePlanner from './PipaRoutePlanner';
import PipaDeliveryLevel from './PipaDeliveryLevel';
import MunicipalDrawer from './MunicipalDrawer';
import { PipaField } from './PipaForm';
import { PIPA_DRIVER_PATH, pipaDateTime, pipaNumber, PIPA_KINDS } from '@/lib/pipa';
import { pipaDefaultRoute, pipaRoutePending, pipaRouteSource, pipaRouteStops, pipaRouteTanks } from '@/lib/pipaRoutes';
import { haversine } from '@/lib/navGeo';

const NAV = [['entregas', 'Entregas', ClipboardList], ['rotas', 'Rotas', Route], ['mapa', 'Mapa', Map], ['historico', 'Histórico', History]];
function VoiceToggle({ voice }) {
  if (!voice?.suportada) return null;
  const label = voice.mudo ? 'Ativar avisos por voz' : 'Silenciar avisos por voz';
  return <Button type="button" variant="ghost" size="icon" className="pipa-driver-voice" onClick={voice.alternarMudo} aria-label={label} title={label} aria-pressed={!voice.mudo}>{voice.mudo ? <VolumeX size={19} /> : <Volume2 size={19} />}</Button>;
}

export default function PipaDriverScreens({ data, loading, branding, theme, setPreference, signOut, error, notice, refreshing, refresh, busy, active, position, gpsError, liters, setLiters, tankId, setTankId, start, complete, cancelRoute, voice }) {
  const { view: requestedView = 'entregas' } = useParams(), navigate = useNavigate();
  const view = NAV.some(([id]) => id === requestedView) ? requestedView : 'entregas', mapView = view === 'mapa';
  const [params, setParams] = useSearchParams(), [planning, setPlanning] = useState(false), [dischargeOpen, setDischargeOpen] = useState(false), [follow, setFollow] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [levelAfter, setLevelAfter] = useState('');
  useEffect(() => { setLevelAfter(''); }, [active?.id]);
  const routes = (data?.routes || []).filter(route => !route.cancelled), routeId = params.get('rota');
  const route = routeId === 'todas' ? null : routes.find(r => r.id === routeId) || routes.find(r => r.id === active?.route_id) || pipaDefaultRoute(routes);
  const stops = route ? pipaRouteStops(route) : [], pendingStops = stops.filter(s => ['assigned', 'in_transit'].includes(s.status));
  const tanks = data ? pipaRouteTanks(data.tanks, route) : [];
  const routeTanks = pendingStops.map(s => data.tanks.find(t => t.id === s.tank_id)).filter(Boolean);
  const activeTank = active && { ...active, id: active.tank_id || active.id, name: data.tanks.find(t => t.id === active.tank_id)?.name || 'Entrega avulsa' };
  const selected = data?.tanks.find(t => t.id === tankId) || activeTank || routeTanks[0];
  const isActive = active && selected?.id === activeTank?.id;
  useEffect(() => { setPanelCollapsed(false); }, [selected?.id, active?.id]);
  const distance = position && selected ? haversine(position, { lat: selected.latitude, lng: selected.longitude }) : null;
  const waiting = data?.requests.filter(r => !r.route_id && r.status === 'assigned') || [];
  const nextStop = routeTanks[0];
  const routeStarted = route && (active?.route_id === route.id || stops.some(s => ['in_transit', 'completed'].includes(s.status)));
  const openRoute = id => { voice?.preparar(); setTankId(''); navigate(`${PIPA_DRIVER_PATH}/mapa?rota=${id}`); };
  const chooseRoute = id => { setTankId(''); setFollow(false); setParams({ rota: id }); };
  const startSelected = () => {
    const request = data.requests.find(r => r.tank_id === selected?.id && r.status === 'assigned' && (!route || r.route_id === route.id));
    start(request?.id, selected?.id);
  };
  return <div className={`pipa-driver-shell pipa-driver-app${mapView ? ' pipa-patrol-shell' : ''}`}>
    <header className={`pipa-driver-header bg-header-bg text-header-fg${mapView ? ' pipa-patrol-header' : ''}`}><div className="page-shell-fluid pipa-driver-header-inner">
      {mapView ? <><Button asChild variant="ghost" size="icon"><Link to={`${PIPA_DRIVER_PATH}/entregas`} aria-label="Voltar às entregas"><ArrowLeft size={20} /></Link></Button><h1>Mapa da rota</h1><div className="pipa-driver-header-actions"><VoiceToggle voice={voice} /><Button variant="ghost" size="icon" onClick={refresh} disabled={refreshing} aria-label="Atualizar entregas"><RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} /></Button><Button variant="ghost" size="icon" onClick={() => setPreference(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</Button></div></> : <>
      <Link to={PIPA_DRIVER_PATH} className="pipa-driver-brand"><img src={branding.logo} alt="" width="36" height="36" onError={e => { if (!e.currentTarget.src.endsWith('/logo.png')) e.currentTarget.src = '/logo.png'; }} /><span><strong>{branding.name}</strong><small>Operação-pipa</small></span></Link>
      <div className="pipa-driver-header-actions"><Button variant="ghost" size="icon" onClick={() => setPreference(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</Button><Button asChild variant="ghost" size="icon"><Link to={`${PIPA_DRIVER_PATH}/senha`} aria-label="Alterar senha"><KeyRound size={18} /></Link></Button><Button variant="ghost" size="icon" aria-label="Sair" onClick={async () => { await signOut(); navigate('/operacao-pipa/login', { replace: true }); }}><LogOut size={18} /></Button></div>
      </>}
    </div></header>
    <main className={mapView ? 'pipa-patrol-main' : 'page-shell-fluid pipa-page pipa-driver-page'} data-driver-screen={view}>
      {view === 'entregas' && <h1 className="sr-only">Entregas do pipeiro</h1>}
      {!mapView && view !== 'entregas' && <div className="pipa-driver-page-heading"><h1>{view === 'rotas' ? 'Minhas rotas' : 'Histórico'}</h1><Button variant="outline" size="icon" onClick={refresh} disabled={busy || refreshing} aria-label="Atualizar entregas"><RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} /></Button></div>}
      {!mapView && error && <p className="pipa-error" role="alert">{error}</p>}{!mapView && notice && <p className="pipa-success" role="status">{notice}</p>}
      {!loading && !data && <div className={mapView ? 'pipa-patrol-load-error' : 'pipa-actions'}>{mapView && error && <p className="pipa-error" role="alert">{error}</p>}<Button variant="outline" disabled={refreshing} onClick={refresh}>Tentar novamente</Button></div>}
      {loading ? <p role="status">Abrindo entregas…</p> : data && <>
        {view === 'entregas' && <>
          <PipaDriverOverview driver={data.driver} monthlyLoads={data.monthly_loads} quota={data.quota} onRefresh={refresh} refreshing={busy || refreshing} />
          {active && <section className="pipa-driver-live" aria-labelledby="pipa-active-delivery">
            <div className="pipa-driver-live-heading"><span className="pipa-driver-live-icon"><Navigation size={21} aria-hidden="true" /></span><span>Entrega em andamento</span><VoiceToggle voice={voice} /></div>
            <h2 id="pipa-active-delivery">{activeTank.name}</h2>
            <p className="pipa-driver-locality"><MapPin size={15} aria-hidden="true" />{active.locality}</p>
            <Button className="pipa-driver-action" onClick={() => { voice?.preparar(); setTankId(''); navigate(`${PIPA_DRIVER_PATH}/mapa${active.route_id ? `?rota=${active.route_id}` : '?rota=todas'}`); }}><Map size={17} className="mr-2" />Continuar rota<ArrowRight size={17} className="ml-auto" /></Button>
          </section>}
          <div className="pipa-driver-workspace">
            <section className="pipa-driver-section">
              <div className="pipa-driver-section-heading"><h2><ClipboardList size={19} aria-hidden="true" />Entregas direcionadas</h2><span className="pipa-driver-count">{waiting.length}</span></div>
              {active && waiting.length > 0 && <p className="pipa-note pipa-driver-queue-note">Conclua a entrega atual para iniciar outra.</p>}
              {waiting.length ? <div className="pipa-driver-requests">{waiting.map(request => <article key={request.id} className="pipa-panel pipa-driver-card" data-urgent={request.kind === 'urgent'}>
                <div className="pipa-driver-card-heading"><span className="pipa-driver-destination-icon"><MapPin size={20} aria-hidden="true" /></span><span className="pipa-badge" data-tone={request.kind === 'urgent' ? 'urgent' : undefined}>{PIPA_KINDS[request.kind]}</span></div>
                <h3>{data.tanks.find(t => t.id === request.tank_id)?.name || 'Entrega avulsa'}</h3>
                <p className="pipa-driver-locality"><MapPin size={14} aria-hidden="true" />{request.locality}</p>
                {request.address && <p className="pipa-note">{request.address}</p>}
                <Button className="pipa-driver-action" disabled={busy || Boolean(active)} onClick={() => start(request.id)}><Navigation size={17} className="mr-2" />Iniciar rota<ArrowRight size={16} className="ml-auto" /></Button>
              </article>)}</div> : <div className="pipa-driver-empty"><span><ClipboardList size={23} /></span><strong>Nenhuma entrega direcionada</strong></div>}
            </section>
            <section className="pipa-panel pipa-driver-current pipa-driver-planned">
              <div className="pipa-driver-card-heading"><span className="pipa-driver-destination-icon"><Route size={21} aria-hidden="true" /></span><h2>Rota planejada</h2>{route && <span className="pipa-driver-count" aria-label={`${pendingStops.length} paradas pendentes`}>{pendingStops.length}</span>}</div>
              {route ? <><span className="pipa-badge">{pipaRouteSource(route.source)}</span><h3>{route.name}</h3>
                {nextStop && <div className="pipa-driver-next-stop"><MapPin size={17} aria-hidden="true" /><div><span>{routeStarted ? 'Próxima parada' : 'Primeira parada'}</span><strong>{nextStop.name}</strong><small>{nextStop.locality}</small></div></div>}
                <Button variant="outline" className="pipa-driver-soft-action pipa-driver-action" onClick={() => openRoute(route.id)}><Play size={16} className="mr-2" />{routeStarted ? 'Continuar rota' : 'Iniciar rota'}<ArrowRight size={16} className="ml-auto" /></Button>
              </> : <><p className="pipa-note">Nenhuma rota para hoje</p><Button variant="outline" className="pipa-driver-soft-action pipa-driver-action" onClick={() => navigate(`${PIPA_DRIVER_PATH}/rotas`)}>Planejar rota<ArrowRight size={16} className="ml-auto" /></Button></>}
            </section>
          </div>
        </>}
        {view === 'rotas' && <PipaRoutes data={data} onPlan={() => setPlanning(true)} onOpen={openRoute} canCancel={r => r.source === 'driver'} onCancel={cancelRoute} busy={busy} />}
        {view === 'historico' && <section className="pipa-driver-section">
          <div className="pipa-driver-history-table"><PipaTable headings={['Data', 'Destino / localidade', 'Carradas', 'Volume']} rows={data.deliveries} empty="Nenhum abastecimento registrado" render={d => <tr key={d.id}><td>{pipaDateTime(d.delivered_at)}</td><td>{d.destination_name}<br />{d.locality}</td><td>{d.loads}</td><td>{pipaNumber(d.liters)} L</td></tr>} /></div>
          <div className="pipa-driver-history-cards">{data.deliveries.map(delivery => <article key={delivery.id} className="pipa-driver-history-card"><time dateTime={delivery.delivered_at}>{pipaDateTime(delivery.delivered_at)}</time><h2>{delivery.destination_name}</h2><p>{delivery.locality}</p><div><span className="pipa-badge">{delivery.loads} {delivery.loads === 1 ? 'carrada' : 'carradas'}</span><strong>{pipaNumber(delivery.liters)} L</strong></div></article>)}{!data.deliveries.length && <div className="pipa-driver-empty"><span><History size={22} /></span><strong>Nenhum abastecimento registrado</strong></div>}</div>
        </section>}
        {mapView && <>
          <PipaMap tanks={tanks} requests={data.requests} selected={selected} onSelect={t => { setTankId(t.id); setFollow(false); setPanelCollapsed(false); }} position={position} followPosition={follow} routeStops={routeTanks} showLegend={false} showPopups={false} />
          <div className="pipa-patrol-top"><label className="pipa-patrol-route-select"><Route size={16} aria-hidden="true" /><span className="sr-only">Exibir no mapa</span><select className="pipa-input" aria-label="Exibir no mapa" value={route?.id || 'todas'} onChange={e => chooseRoute(e.target.value)}><option value="todas">Todas as caixas</option>{routes.filter(r => pipaRoutePending(r) || r.id === route?.id).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>{route && <div className="pipa-patrol-route-progress"><span>{stops.filter(s => s.status === 'completed').length}/{stops.length} abastecidas</span><span>{pipaRouteSource(route.source)}</span></div>}</div>
          <Button className="pipa-patrol-locate" variant="outline" size="icon" aria-label="Acompanhar caminhão" aria-pressed={follow} onClick={() => setFollow(v => !v)} disabled={!position}><LocateFixed size={21} /></Button>
          <section className="pipa-patrol-destination" data-collapsed={panelCollapsed} aria-label="Destino da rota">
            <button type="button" className="pipa-patrol-panel-toggle" aria-label={panelCollapsed ? 'Expandir painel do destino' : 'Recolher painel do destino'} aria-expanded={!panelCollapsed} aria-controls="pipa-patrol-destination-body" onClick={() => setPanelCollapsed(current => !current)}><i aria-hidden="true" /><span>{panelCollapsed ? selected?.name || 'Escolher destino' : isActive ? 'Entrega em andamento' : 'Destino'}</span>{panelCollapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
            {(error || gpsError) && <p className="pipa-error" role="alert">{error || gpsError}</p>}{notice && <p className="pipa-success" role="status">{notice}</p>}
            <div id="pipa-patrol-destination-body" className="pipa-patrol-destination-body" hidden={panelCollapsed}>
              <PipaField label="Selecionar caixa"><select className="pipa-input" value={selected?.id || ''} disabled={busy} onChange={e => { setTankId(e.target.value); setFollow(false); }}><option value="">Toque em uma caixa no mapa</option>{[...tanks, ...(selected && !tanks.some(t => t.id === selected.id) ? [selected] : [])].map(t => <option key={t.id} value={t.id}>{t.name} · {t.locality}</option>)}</select></PipaField>
              {selected ? <div className="pipa-patrol-destination-meta"><span><MapPin size={14} />{selected.locality}</span><strong>{distance == null ? 'Aguardando GPS' : distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`} {distance != null && <small>em linha reta</small>}</strong></div> : <p className="pipa-note">{route ? 'Rota encerrada. Selecione outra rota ou todas as caixas.' : 'Selecione uma caixa para iniciar o abastecimento.'}</p>}
              {active && selected && !isActive && <p className="pipa-note">A parada atual continuará pendente ao trocar de destino.</p>}
            </div>
            {selected && <div className="pipa-patrol-destination-actions">{isActive ? <><Button asChild variant="outline" className="pipa-driver-action"><a href={`https://www.google.com/maps/dir/?api=1&destination=${active.latitude},${active.longitude}&travelmode=driving`} target="_blank" rel="noopener noreferrer"><Navigation size={17} className="mr-2" />Navegar</a></Button><Button className="pipa-driver-action" disabled={busy} onClick={() => setDischargeOpen(true)}>Registrar abastecimento</Button></> : <Button className="pipa-driver-action" disabled={busy} onClick={startSelected}><Truck size={18} className="mr-2" />{active ? 'Abastecer esta caixa' : 'Iniciar rota'}<ArrowRight size={16} className="ml-auto" /></Button>}</div>}
          </section>
        </>}
      </>}
    </main>
    <nav className="pipa-driver-bottom-nav" aria-label="Navegação do pipeiro">{NAV.map(([id, label, Icon]) => <NavLink key={id} to={`${PIPA_DRIVER_PATH}/${id}`} aria-current={view === id ? 'page' : undefined} className={view === id ? 'is-active' : ''}><Icon size={22} /><span>{label}</span></NavLink>)}</nav>
    {planning && <PipaRoutePlanner data={data} driver={data.driver} onClose={() => setPlanning(false)} onSaved={async id => { await refresh(); setPlanning(false); openRoute(id); }} />}
    {dischargeOpen && active && <MunicipalDrawer open placement="center" title="Registrar abastecimento" description="Confirme a descarga no destino." busy={busy} onClose={() => setDischargeOpen(false)} footer={<div className="pipa-actions"><Button variant="outline" disabled={busy} onClick={() => setDischargeOpen(false)}>Voltar</Button><Button type="submit" form="pipa-discharge-form" disabled={busy}>{busy ? 'Registrando…' : 'Confirmar descarga'}</Button></div>}><form id="pipa-discharge-form" className="pipa-driver-discharge" onSubmit={async e => { if (await complete(e, levelAfter)) setDischargeOpen(false); }}><h2 className="font-bold">{activeTank.name}</h2>{error && <p className="pipa-error" role="alert">{error}</p>}<PipaField label="Volume entregue (litros)"><input name="liters" className="pipa-input" type="number" required min={1} max={data.driver.capacity_liters} step={1} disabled={busy} value={liters} onChange={e => setLiters(e.target.value)} /></PipaField>{active.tank_id && <PipaDeliveryLevel key={active.id} value={levelAfter} onChange={setLevelAfter} disabled={busy} />}<p className="pipa-note">Confirme após descarregar, a até 250 m do destino e com precisão do GPS de até 100 m.</p></form></MunicipalDrawer>}
  </div>;
}
