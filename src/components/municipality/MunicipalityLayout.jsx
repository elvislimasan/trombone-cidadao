import { executorActivityForPath, executorHome, executionActivity } from '@/lib/executorActivities';
import { municipalHome, municipalRouteAllowed, municipalContextPath, municipalAccessUnavailableReason, municipalWorkspaceChannel } from '@/lib/municipalAccess';
import { usePermissions } from '@/hooks/usePermissions';
import { territorialModules, TERRITORIAL_BASE } from '@/lib/territorialAccess';
import { TREE_ADOPTION_MANAGEMENT_PATH, TREE_ADOPTION_REQUESTS_PATH, TREE_NURSERIES_MANAGEMENT_PATH } from '@/lib/treeAdoption';
import { COMMUNITY_REVIEW_PATH } from '@/lib/communityTrees';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  ChevronDown,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  Users,
  X,
  Moon,
  Sun,
  MessageSquare,
  LampDesk,
  BarChart3,
  Map as MapIcon,
  Plus,
  Sprout,
  Leaf,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useTheme } from '@/design-system/theme/ThemeProvider';
import useMunicipalityWorkspace, { MunicipalityWorkspaceProvider, selectMunicipalityWorkspace } from '@/hooks/useMunicipalityWorkspace';
import ElectricianLayout, { ExecutorLayout } from '@/components/municipality/ElectricianLayout';

const navigation = [
  { to: '/prefeitura/visao-geral', label: 'Visão geral', icon: LayoutDashboard, adminOnly: false },
  { to: TERRITORIAL_BASE, label: 'Ruas e arborização', icon: MapIcon, territorial: true },
  { to: '/prefeitura/broncas', label: 'Solicitações da cidade', icon: MessageSquare, adminOnly: false },
  { to: '/prefeitura/demandas', label: 'Ordens de serviço', icon: ClipboardList, adminOnly: false },
  { to: '/prefeitura/iluminacao', label: 'Iluminação pública', icon: LampDesk, adminOnly: false },
  { to: TREE_ADOPTION_MANAGEMENT_PATH, label: 'Adote uma árvore', icon: Sprout, adminOnly: false },
  { to: '/prefeitura/secretarias', label: 'Secretarias', icon: Settings2, adminOnly: true },
  { to: '/prefeitura/equipe', label: 'Equipe', icon: Users, adminOnly: true },
  { to: '/prefeitura/configuracoes', label: 'Regras de atendimento', icon: Settings2, adminOnly: true },
];

const navClass = ({ isActive }) => [
  'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
  isActive
    ? 'bg-brand-subtleBg text-brand-subtleFg ring-1 ring-inset ring-brand/20 before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-brand'
    : 'text-content-secondary hover:bg-surface-subtle hover:text-content-primary',
].join(' ');

export default function MunicipalityLayout() {
  return <MunicipalityWorkspaceProvider><MunicipalityLayoutContent /></MunicipalityWorkspaceProvider>;
}

function MunicipalityLayoutContent() {
  const { user, signOut } = useAuth();
  const territorialAccess = usePermissions();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const contentRef = useRef(null);
  const workspace = useMunicipalityWorkspace();
  const { memberships, municipality, enabledCategoryIds, isAdministrator, isElectrician: assignedElectrician } = workspace;
  const isElectrician = assignedElectrician && pathname.startsWith('/prefeitura/eletricista');
  const modules = municipality ? ['ruas', 'arborizacao'].filter(area => workspace.inventoryModules?.includes(area === 'ruas' ? 'urban_planning' : 'arborization')) : territorialModules(territorialAccess, null);
  const inventoryPath = modules.length ? TERRITORIAL_BASE + '/' + modules[0] + '?cidade=' + municipality?.city_id : null;
  const homePath = municipalHome(workspace, inventoryPath);
  const home = homePath ? municipalContextPath(homePath, municipality?.city_id, municipalWorkspaceChannel(homePath, isAdministrator, workspace.activeChannelId)) : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(() => pathname.startsWith('/prefeitura/demandas'));
  const [lightingOpen, setLightingOpen] = useState(() => pathname.startsWith('/prefeitura/iluminacao'));
  const [adoptionOpen, setAdoptionOpen] = useState(() => pathname.startsWith(TREE_ADOPTION_MANAGEMENT_PATH));
  const [branding, setBranding] = useState({ name: 'Trombone Cidadão', logo: '/logo.png' });
  const { resolved: theme, setPreference } = useTheme();

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith('/prefeitura/demandas')) setOrdersOpen(true);
    if (pathname.startsWith('/prefeitura/iluminacao')) setLightingOpen(true);
    if (pathname.startsWith(TREE_ADOPTION_MANAGEMENT_PATH)) setAdoptionOpen(true);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  useEffect(() => {
    let active = true;
    const loadBranding = async () => {
      const { data } = await supabase.from('site_config').select('site_name, logo_url').eq('id', 1).maybeSingle();
      if (active && data) setBranding({ name: data.site_name || 'Trombone Cidadão', logo: data.logo_url || '/logo.png' });
    };
    loadBranding();
    window.addEventListener('site-settings-updated', loadBranding);
    return () => { active = false; window.removeEventListener('site-settings-updated', loadBranding); };
  }, []);

  const city = municipality?.cidade;
  const locationLabel = [city?.name, city?.states?.uf].filter(Boolean).join(' - ');
  const visibleNavigation = useMemo(
    () => navigation.filter((item) => (!item.territorial || modules.length > 0) && municipalRouteAllowed(item.to, workspace) && (!item.adminOnly || isAdministrator) && (!isElectrician || item.to === '/prefeitura/demandas')
      && (item.to !== '/prefeitura/iluminacao' || enabledCategoryIds?.includes('iluminacao')))
      .map(item => item.territorial ? {
        ...item,
        label: modules.length === 1
          ? modules[0] === 'ruas' ? 'Ruas e pavimentações' : 'Arborização'
          : 'Ruas e arborização',
      } : item),
    [isAdministrator, isElectrician, enabledCategoryIds, modules, workspace]
  );
  const ordersActive = pathname.startsWith('/prefeitura/demandas');
  const newOrderActive = pathname === '/prefeitura/demandas/nova';
  const ordersListActive = pathname === '/prefeitura/demandas';
  const scopedHref = href => municipalContextPath(href, municipality?.city_id, municipalWorkspaceChannel(href, isAdministrator, workspace.activeChannelId));
  const renderNavigation = (mobile = false) => visibleNavigation.map(({ to, label, icon: Icon }) => {
    if (to === TREE_ADOPTION_MANAGEMENT_PATH) {
      const submenuId = mobile ? 'municipality-mobile-adoption' : 'municipality-desktop-adoption';
      const active = pathname === to || pathname.startsWith(`${to}/`);
      return <div key={to} className="min-w-0">
        <button type="button" aria-expanded={adoptionOpen} aria-controls={submenuId} onClick={() => setAdoptionOpen(value => !value)} className={'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (active ? 'bg-brand-subtleBg text-brand-subtleFg ring-1 ring-inset ring-brand/20' : 'text-content-secondary hover:bg-surface-subtle hover:text-content-primary')}><Sprout className="h-4 w-4 shrink-0" /><span className="flex-1">{label}</span><ChevronDown className={'h-4 w-4 shrink-0 transition-transform ' + (adoptionOpen ? 'rotate-180' : '')} /></button>
        {adoptionOpen && <div id={submenuId} role="group" aria-label="Opções de Adote uma árvore" className="ml-3 mt-1 grid gap-0.5 rounded-r-xl border-l-2 border-brand/60 bg-surface-subtle/70 py-1 pl-2 pr-1">
          {[[TREE_ADOPTION_REQUESTS_PATH, 'Solicitações', ClipboardList], [TREE_NURSERIES_MANAGEMENT_PATH, 'Viveiros e mudas', Leaf], [COMMUNITY_REVIEW_PATH, 'Árvores da comunidade', Sprout]].map(([href, title, SubIcon]) => {
            const current = pathname === href || (href === TREE_ADOPTION_REQUESTS_PATH && pathname === to);
            return <Link key={href} to={scopedHref(href)} aria-current={current ? 'page' : undefined} onClick={mobile ? () => setMenuOpen(false) : undefined} className={'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (current ? 'bg-brand-subtleBg text-brand-subtleFg' : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary')}><SubIcon className="h-4 w-4 shrink-0" />{title}</Link>;
          })}
        </div>}
      </div>;
    }
    if (to === '/prefeitura/iluminacao') {
      const submenuId = mobile ? 'municipality-mobile-lighting' : 'municipality-desktop-lighting';
      const active = pathname.startsWith(to);
      return <div key={to} className="min-w-0">
        <div className={'flex items-center rounded-xl transition-colors ' + (active ? 'bg-brand-subtleBg text-brand-subtleFg ring-1 ring-inset ring-brand/20' : 'text-content-secondary hover:bg-surface-subtle hover:text-content-primary')}>
          <Link to={scopedHref(to)} onClick={mobile ? () => setMenuOpen(false) : undefined} className="flex min-w-0 flex-1 items-center gap-3 rounded-l-xl px-3 py-2.5 text-sm font-semibold"><LampDesk className="h-4 w-4 shrink-0" />{label}</Link>
          <button type="button" aria-label={lightingOpen ? 'Recolher iluminação pública' : 'Expandir iluminação pública'} aria-expanded={lightingOpen} aria-controls={submenuId} onClick={() => setLightingOpen((value) => !value)} className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand"><ChevronDown className={'h-4 w-4 transition-transform ' + (lightingOpen ? 'rotate-180' : '')} /></button>
        </div>
        {lightingOpen && <div id={submenuId} role="group" aria-label="Opções de iluminação pública" className="ml-3 mt-1 grid gap-0.5 rounded-r-xl border-l-2 border-brand/60 bg-surface-subtle/70 py-1 pl-2 pr-1">
          {[[to, 'Mapa', MapIcon], ...(workspace.canReadAttendance ? [[`${to}/estatisticas`, 'Estatísticas', BarChart3]] : [])].map(([href, title, SubIcon]) => <Link key={href} to={scopedHref(href)} aria-current={pathname === href ? 'page' : undefined} onClick={mobile ? () => setMenuOpen(false) : undefined} className={'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ' + (pathname === href ? 'bg-brand-subtleBg text-brand-subtleFg' : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary')}><SubIcon className="h-4 w-4 shrink-0" />{title}</Link>)}
        </div>}
      </div>;
    }
    if (to !== '/prefeitura/demandas') return <NavLink key={to} to={scopedHref(to)} className={({ isActive }) => navClass({ isActive: isActive || (to === '/prefeitura/broncas' && pathname === '/prefeitura/mapa') })} onClick={mobile ? () => setMenuOpen(false) : undefined}>
      <Icon className="h-4 w-4" /> {label}
    </NavLink>;
    const submenuId = mobile ? 'municipality-mobile-orders' : 'municipality-desktop-orders';
    return <div key={to} className="min-w-0">
      <div className={'flex items-center rounded-xl transition-colors ' + (ordersActive ? 'bg-brand-subtleBg text-brand-subtleFg ring-1 ring-inset ring-brand/20' : 'text-content-secondary hover:bg-surface-subtle hover:text-content-primary')}>
        <Link to={scopedHref(to)} onClick={mobile ? () => setMenuOpen(false) : undefined} className="flex min-w-0 flex-1 items-center gap-3 rounded-l-xl px-3 py-2.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><ClipboardList className="h-4 w-4 shrink-0" />{label}</Link>
        <button type="button" aria-label={ordersOpen ? 'Recolher ordens de serviço' : 'Expandir ordens de serviço'} aria-expanded={ordersOpen} aria-controls={submenuId} onClick={() => setOrdersOpen((value) => !value)} className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><ChevronDown className={'h-4 w-4 transition-transform ' + (ordersOpen ? 'rotate-180' : '')} /></button>
      </div>
      {ordersOpen && <div id={submenuId} role="group" aria-label="Opções de ordens de serviço" className="ml-3 mt-1 grid gap-0.5 rounded-r-xl border-l-2 border-brand/60 bg-surface-subtle/70 py-1 pl-2 pr-1">
        {!isElectrician && <Link to="/prefeitura/demandas/nova" aria-current={newOrderActive ? 'page' : undefined} onClick={mobile ? () => setMenuOpen(false) : undefined} className={'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (newOrderActive ? 'bg-brand-subtleBg text-brand-subtleFg' : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary')}><Plus className="h-4 w-4 shrink-0" />Nova ordem</Link>}
        <Link to="/prefeitura/demandas" aria-current={ordersListActive ? 'page' : undefined} onClick={mobile ? () => setMenuOpen(false) : undefined} className={'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (ordersListActive ? 'bg-brand-subtleBg text-brand-subtleFg' : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary')}><Clock3 className="h-4 w-4 shrink-0" />Em andamento</Link>
      </div>}
    </div>;
  });
  const initials = (user?.name || user?.email || 'Servidor')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  if (workspace.loading) return <div className="flex min-h-[100dvh] items-center justify-center bg-surface-base text-sm text-content-secondary">Abrindo painel…</div>;
  if (!municipality && !territorialAccess.loading && !territorialAccess.error && territorialAccess.municipalities.length === 0 && (pathname.startsWith(TERRITORIAL_BASE) || (pathname.startsWith(TREE_ADOPTION_MANAGEMENT_PATH) && territorialAccess.canWrite('arborization')))) return <Outlet />;
  if (workspace.error) return <div className="page-shell-fluid space-y-4 py-12"><p className="text-sm">Conta: {user?.email}</p><p role="alert">{workspace.error}</p><div className="flex gap-3"><Button onClick={workspace.refresh}>Tentar novamente</Button><Button variant="outline" onClick={handleSignOut}>Sair</Button></div></div>;
  if (!municipality || !home) return <div className="page-shell-fluid space-y-4 py-12"><h1 className="text-xl font-bold">Acesso municipal indisponível</h1><p className="text-sm">Conta: {user?.email}</p><p role="alert">{municipalAccessUnavailableReason(workspace)}</p><div className="flex gap-3"><Button onClick={workspace.refresh}>Verificar acesso novamente</Button><Button variant="outline" onClick={handleSignOut}>Sair</Button></div></div>;
  if (pathname === '/prefeitura/visao-geral' && !workspace.canReadAttendance && homePath !== pathname) return <Navigate to={home} replace />;
  if (!municipalRouteAllowed(pathname, workspace)) return <Navigate to={home} replace />;

  if (pathname === '/prefeitura/executor' && workspace.canExecute) return <Navigate to={scopedHref(executorHome(workspace))} replace />;
  if (pathname.startsWith('/prefeitura/executor/')) return <ExecutorLayout context={workspace} branding={branding} activity={executorActivityForPath(pathname)} />;
  if (isElectrician) return <ElectricianLayout context={workspace} branding={branding} />;

  return (
    <div className="municipality-shell relative flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-surface-base text-content-primary">
      <header className="municipality-header relative z-40 shrink-0 border-b border-edge-subtle bg-header-bg text-header-fg shadow-sm">
        <div className="page-shell-fluid flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 lg:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              aria-controls="municipality-mobile-nav"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Link to={home} className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <img src={branding.logo} alt="" className="h-9 w-9 shrink-0 object-contain" onError={() => setBranding((current) => current.logo === '/logo.png' ? current : { ...current, logo: '/logo.png' })} />
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-extrabold tracking-tight sm:text-lg">{branding.name}</p>
                <p className="truncate text-[11px] font-medium opacity-75">Painel da Prefeitura</p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {memberships.length > 1 && <label className="min-w-0"><span className="sr-only">Prefeitura ativa</span><select aria-label="Prefeitura ativa" className="h-9 max-w-[9rem] rounded-lg border border-edge-subtle bg-surface-raised px-2 text-xs text-content-primary sm:max-w-[14rem]" value={municipality?.id || ''} onChange={(event) => { selectMunicipalityWorkspace(user.id, event.target.value); navigate('/prefeitura/visao-geral'); }}>{memberships.map((item) => <option key={item.prefeitura.id} value={item.prefeitura.id}>{item.prefeitura.nome}</option>)}</select></label>}
            <Button type="button" variant="ghost" size="icon" onClick={() => setPreference(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <div className="hidden text-right md:block">
              <p className="max-w-48 truncate text-xs font-bold">{user?.name || user?.email || 'Servidor municipal'}</p>
              <p className="text-[10px] opacity-75">{isAdministrator ? 'Administrador municipal' : workspace.canDispatch ? 'Gestor da secretaria' : workspace.canReceive ? 'Atendente' : 'Inventário e consulta'}</p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-black text-content-onBrand">{initials || 'SM'}</div>
          </div>
        </div>
      </header>

      <div className="municipality-workspace relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)]">
        {menuOpen && <button type="button" className="absolute inset-0 z-30 bg-black/30 lg:hidden" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
        {menuOpen && (
          <div className="municipality-mobile-menu absolute inset-x-0 top-0 z-40 max-h-full overflow-y-auto border-b border-edge-subtle bg-surface-raised px-4 py-3 shadow-lg lg:hidden">
            <p className="mb-3 px-3 text-xs font-semibold text-content-secondary">{municipality?.nome || 'Gestão municipal'}{locationLabel ? ` · ${locationLabel}` : ''}</p>
            <nav id="municipality-mobile-nav" aria-label="Painel da prefeitura" className="grid gap-1">
              {workspace.executionSpecialties?.map(id => <NavLink key={id} to={scopedHref(executionActivity(id).path)} className={navClass}>Meus serviços · {executionActivity(id).label}</NavLink>)}{renderNavigation(true)}
              <button type="button" onClick={handleSignOut} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand hover:bg-brand-subtleBg">
                <LogOut className="h-4 w-4" /> Sair
              </button>
            </nav>
          </div>
        )}

        <aside className="hidden min-h-0 border-r border-edge-subtle bg-surface-raised lg:block">
          <div className="flex h-full min-h-0 flex-col p-4">
            <div className="mb-5 shrink-0 rounded-2xl border border-edge-subtle bg-surface-subtle p-4">
              <Building2 className="mb-3 h-5 w-5 text-brand" />
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">Gestão municipal</p>
              <p className="mt-2 break-words text-sm font-bold">{municipality?.nome || 'Painel da Prefeitura'}</p>
              <p className="mt-1 text-xs leading-5 text-content-secondary">{locationLabel || 'Atendimento às demandas da cidade'}</p>
            </div>
            <nav aria-label="Painel da prefeitura" className="grid min-h-0 content-start gap-1 overflow-y-auto">
              {workspace.executionSpecialties?.map(id => <NavLink key={id} to={scopedHref(executionActivity(id).path)} className={navClass}><ClipboardList className="h-4 w-4" />Meus serviços · {executionActivity(id).label}</NavLink>)}{renderNavigation()}
            </nav>
            <div className="mt-auto shrink-0 border-t border-edge-subtle pt-4">
              <button type="button" onClick={handleSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand hover:bg-brand-subtleBg">
                <LogOut className="h-4 w-4" /> Sair do painel
              </button>
            </div>
          </div>
        </aside>
        <main ref={contentRef} className="min-h-0 min-w-0 overflow-y-auto overscroll-contain">
          <ErrorBoundary key={pathname}><Outlet context={workspace} /></ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
