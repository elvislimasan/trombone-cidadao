import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useOutletContext } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { BarChart3, Building2, LayoutDashboard, LogOut, MapPin, Map as MapIcon, Menu, Moon, Route, Sun, Trees, X } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { CityViewProvider, useCity } from '@/contexts/CityContext';
import { useTheme } from '@/design-system/theme/ThemeProvider';
import { Button } from '@/components/ui/button';
import { ArborizationContent } from '@/pages/ArborizationMapPage';
import { PavementContent } from '@/pages/PavementMapPage';
import { TERRITORIAL_BASE, territorialModules } from '@/lib/territorialAccess';

const AREAS = { ruas: { title: 'Ruas e pavimentações', Icon: Route }, arborizacao: { title: 'Arborização', Icon: Trees } };

function Panels({ modules, active, section, readOnly = false }) {
  // Mantém filtros e seleção ao alternar abas; cidade/conta novas remontam tudo.
  const [visited, setVisited] = useState([active]);
  useEffect(() => { setVisited(current => current.includes(active) ? current : [...current, active]); }, [active]);
  return modules.filter(area => visited.includes(area) || area === active).map(area => (
    <section key={area} id={`panel-${area}`} aria-label={AREAS[area].title} hidden={area !== active}>
      {area === 'ruas' ? <PavementContent embedded section={section} /> : <ArborizationContent management={!readOnly} embedded />}
    </section>
  ));
}

export default function TerritorialPanelPage() {
  const { user, signOut } = useAuth();
  const access = usePermissions();
  const workspace = useOutletContext();
  const embedded = Boolean(workspace?.municipality);
  const { cities, loadingCities, activeCityId } = useCity();
  const { module: requested, section: requestedSection } = useParams();
  const location = useLocation(), navigate = useNavigate();
  const { resolved, setPreference } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const ids = new Set([
    ...(workspace?.municipality ? [workspace.municipality.city_id] : []),
    ...(access.canWrite('urban_planning') ? access.planningCityIds : []),
    ...(access.canWrite('arborization') ? access.treeAssignments.map(row => row.city_id) : []),
  ].map(String));
  const allowedCities = access.isMaster ? cities : cities.filter(city => ids.has(String(city.id)));
  const params = new URLSearchParams(location.search);
  const desiredCity = params.get('cidade') || workspace?.municipality?.city_id || activeCityId;
  const city = allowedCities.find(item => String(item.id) === String(desiredCity)) || allowedCities[0];
  const modules = city ? embedded ? ['ruas', 'arborizacao'].filter(area => workspace.inventoryModules?.includes(area === 'ruas' ? 'urban_planning' : 'arborization')) : territorialModules(access, city.id) : [];
  const active = modules.includes(requested) ? requested : modules[0];
  const streetSection = requestedSection === 'estatisticas' ? 'estatisticas' : 'mapa';
  const href = (area, targetCity = city, section = 'mapa') => `${TERRITORIAL_BASE}/${area}${area === 'ruas' ? '/' + section : ''}?cidade=${targetCity.id}${workspace?.activeChannelId ? '&secretaria=' + workspace.activeChannelId : ''}`;
  const statistics = active === 'ruas' && streetSection === 'estatisticas';
  const general = user?.is_admin || user?.is_master;
  const title = modules.length === 2 ? 'Gestão de ruas e arborização' : AREAS[active]?.title || 'Gestão municipal';
  const municipality = access.municipalities.find(row => String(row.city_id) === String(city?.id));
  const overviewTo = general ? '/admin' : municipality?.papel === 'administrador' ? '/prefeitura/visao-geral' : null;
  const department = access.treeAssignments.find(row => String(row.city_id) === String(city?.id))?.secretaria;

  useEffect(() => { setMenuOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = event => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menuOpen]);

  if (access.loading || loadingCities) return <div role="status" className="page-shell-fluid py-12">Abrindo painel…</div>;
  if (access.error) return <div className="page-shell-fluid space-y-4 py-12"><p role="alert">Não foi possível verificar os acessos do painel.</p><Button onClick={access.refreshPermissions}>Tentar novamente</Button><Link className="block underline" to="/prefeitura/visao-geral">Voltar à prefeitura</Link></div>;
  if (params.has('cidade') && !allowedCities.some(item => String(item.id) === params.get('cidade'))) return <div className="page-shell-fluid py-12" role="alert">Sem acesso aos inventários desta cidade.</div>;
  if (requested && !modules.includes(requested)) return <div className="page-shell-fluid py-12" role="alert">Este inventário não pertence às suas responsabilidades na secretaria.</div>;
  if (!city || !active) return <div className="page-shell-fluid space-y-4 py-12"><h1 className="text-2xl font-bold">Gestão de ruas e arborização</h1><p>Não há cidade com acesso de gestão disponível. Solicite ao administrador o cargo e a liberação do módulo.</p><Link className="block underline" to={general ? '/admin' : '/prefeitura/visao-geral'}>Voltar</Link></div>;
  if (requested !== active || params.get('cidade') !== String(city.id) || (active === 'ruas' ? requestedSection !== streetSection : Boolean(requestedSection))) return <Navigate replace to={href(active, city, streetSection)} />;

  const changeCity = id => {
    const target = allowedCities.find(item => String(item.id) === id);
    const available = territorialModules(access, target.id);
    navigate(href(available.includes(active) ? active : available[0], target, streetSection));
  };
  const cityValue = { cityId: city.id, cityName: city.name, city, cities: allowedCities, loadingCities: false,
    setCityId: id => changeCity(String(id)), isExploring: true, resetToMyCity() {} };
  const navigation = <>
    <p className="mb-3 px-3 text-xs font-semibold text-content-secondary">Áreas de trabalho</p>
    {modules.map(area => { const { Icon, title: label } = AREAS[area]; return <div key={area}>
      <Link to={href(area)} aria-current={active === area && area !== 'ruas' ? 'page' : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${active === area ? 'bg-brand-subtleBg text-brand-subtleFg' : 'text-content-secondary hover:bg-surface-subtle'}`}><Icon className="h-4 w-4 shrink-0" />{label}</Link>
      {area === 'ruas' && <nav aria-label="Ruas e pavimentações" className="mb-2 ml-5 mt-1 grid gap-1 border-l border-edge-subtle pl-3">
        {[['mapa','Mapa',MapIcon],['estatisticas','Estatísticas',BarChart3]].map(([section,label,Icon]) => <Link key={section} to={href('ruas',city,section)} aria-current={active==='ruas' && streetSection===section ? 'page' : undefined} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${active==='ruas' && streetSection===section ? 'bg-brand-subtleBg font-semibold text-brand-subtleFg' : 'text-content-secondary hover:bg-surface-subtle'}`}><Icon className="h-4 w-4" />{label}</Link>)}
      </nav>}
    </div>; })}
    {access.municipalities.length > 0 && <Link className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm" to="/prefeitura/demandas"><Building2 className="h-4 w-4" />Atendimento municipal</Link>}
  </>;

  if (embedded) return <div className="page-shell-fluid min-w-0 py-4" data-testid="territorial-panel">
    <Helmet><title>{title} ? {city.name}</title></Helmet><h1 className="mb-3 text-xl font-bold">{title}</h1>
    {active === 'ruas' && <nav aria-label="Visualização de ruas" className="mb-3 flex gap-2">{[['mapa','Mapa'],['estatisticas','Estatísticas']].map(([section,label]) => <Button asChild key={section} variant={streetSection === section ? 'default' : 'outline'}><Link to={href('ruas',city,section)}>{label}</Link></Button>)}</nav>}
    <CityViewProvider value={cityValue}><Panels key={user.id + ':' + city.id} modules={modules} active={active} section={streetSection} readOnly={!access.canWrite(active === 'ruas' ? 'urban_planning' : 'arborization')} /></CityViewProvider>
  </div>;
  return <div className="territorial-dashboard-shell min-h-[100dvh] min-w-0 bg-surface-base text-content-primary" data-testid="territorial-panel">
    <Helmet><title>{title} — {city.name}</title></Helmet>
    <header className="border-b border-edge-subtle bg-header-bg text-header-fg" style={{ paddingTop: 'var(--header-safe-top, 0px)', paddingLeft: 'var(--safe-area-left, 0px)', paddingRight: 'var(--safe-area-right, 0px)' }}>
      <div className="territorial-header-inner">
        <div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen} aria-controls="territorial-mobile-nav" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X /> : <Menu />}</Button><Building2 className="hidden h-6 w-6 shrink-0 sm:block" /><div className="min-w-0"><p className="break-words text-sm font-bold">{municipality?.nome || `Prefeitura · ${city.name}`}</p><p className="max-w-[28rem] truncate text-[11px] opacity-80">{user?.name || 'Servidor municipal'}{department ? ` · ${department}` : ''}</p></div></div>
        <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
          <label className="territorial-header-city"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="sr-only">Cidade</span><select aria-label="Cidade do painel" value={city.id} onChange={event=>changeCity(event.target.value)}>{allowedCities.map(item=><option key={item.id} value={item.id}>{item.name}{item.state?.uf ? ` · ${item.state.uf}` : ''}</option>)}</select></label>
          {overviewTo && <Button asChild variant="ghost" size="sm" className="h-9 gap-1.5 px-2 text-xs sm:px-3 sm:text-sm"><Link to={overviewTo} aria-label="Visão geral"><LayoutDashboard className="h-4 w-4 shrink-0" />Visão geral</Link></Button>}
          <Button variant="ghost" size="icon" aria-label={resolved === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'} onClick={() => setPreference(resolved === 'dark' ? 'light' : 'dark')}>{resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" aria-label="Sair" onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}><LogOut className="h-4 w-4" /></Button>
        </div>
      </div>
    </header>
    {menuOpen && <nav id="territorial-mobile-nav" aria-label="Áreas de trabalho" className="border-b border-edge-subtle bg-surface-raised p-4 lg:hidden">{navigation}</nav>}
    <div className="territorial-dashboard-grid">
      <aside className="territorial-dashboard-sidebar"><nav aria-label="Áreas de trabalho">{navigation}</nav></aside>
      <main className="territorial-dashboard-main" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
        {!statistics && <div className="territorial-toolbar mb-3 flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="min-w-0 break-words text-lg font-bold sm:text-xl">{title}</h1>
        </div>}
        {active === 'ruas' && <nav aria-label="Visualização de ruas" className="mb-3 flex gap-2 lg:hidden">{[['mapa','Mapa'],['estatisticas','Estatísticas']].map(([section,label]) => <Link key={section} to={href('ruas',city,section)} aria-current={streetSection===section ? 'page' : undefined} className={`rounded-lg px-3 py-2 text-sm font-semibold ${streetSection===section ? 'bg-brand text-content-onBrand' : 'bg-surface-subtle text-content-secondary'}`}>{label}</Link>)}</nav>}
        <CityViewProvider value={cityValue}><Panels key={`${user.id}:${city.id}`} modules={modules} active={active} section={streetSection} /></CityViewProvider>
      </main>
    </div>
  </div>;
}
