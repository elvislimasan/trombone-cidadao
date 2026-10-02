import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useTheme } from '@/design-system/theme/ThemeProvider';
import useMunicipalityWorkspace, { selectMunicipalityWorkspace } from '@/hooks/useMunicipalityWorkspace';

const navigation = [
  { to: '/prefeitura/visao-geral', label: 'Visão geral', icon: LayoutDashboard, adminOnly: false },
  { to: '/prefeitura/broncas', label: 'Solicitações da cidade', icon: MessageSquare, adminOnly: false },
  { to: '/prefeitura/demandas', label: 'Ordens de serviço', icon: ClipboardList, adminOnly: false },
  { to: '/prefeitura/iluminacao', label: 'Iluminação pública', icon: LampDesk, adminOnly: false },
  { to: '/prefeitura/secretarias', label: 'Secretarias', icon: Settings2, adminOnly: true },
  { to: '/prefeitura/equipe', label: 'Equipe', icon: Users, adminOnly: true },
  { to: '/prefeitura/configuracoes', label: 'Regras de atendimento', icon: Settings2, adminOnly: true },
];

const navClass = ({ isActive }) => [
  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
  isActive
    ? 'bg-brand-subtleBg text-brand-subtleFg ring-1 ring-inset ring-brand/20'
    : 'text-content-secondary hover:bg-surface-subtle hover:text-content-primary',
].join(' ');

export default function MunicipalityLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const contentRef = useRef(null);
  const { memberships, municipality, enabledCategoryIds, isAdministrator, isElectrician } = useMunicipalityWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(() => pathname.startsWith('/prefeitura/demandas'));
  const [lightingOpen, setLightingOpen] = useState(() => pathname.startsWith('/prefeitura/iluminacao'));
  const [branding, setBranding] = useState({ name: 'Trombone Cidadão', logo: '/logo.png' });
  const { resolved: theme, setPreference } = useTheme();

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith('/prefeitura/demandas')) setOrdersOpen(true);
    if (pathname.startsWith('/prefeitura/iluminacao')) setLightingOpen(true);
  }, [pathname]);

  useEffect(() => {
    if (isElectrician && pathname === '/prefeitura/visao-geral') navigate('/prefeitura/demandas', { replace: true });
  }, [isElectrician, pathname, navigate]);

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
    () => navigation.filter((item) => (!item.adminOnly || isAdministrator) && (!isElectrician || item.to === '/prefeitura/demandas')
      && (item.to !== '/prefeitura/iluminacao' || enabledCategoryIds?.includes('iluminacao'))),
    [isAdministrator, isElectrician, enabledCategoryIds]
  );
  const ordersActive = pathname.startsWith('/prefeitura/demandas');
  const newOrderActive = pathname === '/prefeitura/demandas/nova';
  const inProgressActive = pathname === '/prefeitura/demandas' && new URLSearchParams(search).get('fila') === 'em_atendimento';
  const renderNavigation = (mobile = false) => visibleNavigation.map(({ to, label, icon: Icon }) => {
    if (to === '/prefeitura/iluminacao') {
      const submenuId = mobile ? 'municipality-mobile-lighting' : 'municipality-desktop-lighting';
      const active = pathname.startsWith(to);
      return <div key={to} className="min-w-0">
        <div className={'flex items-center rounded-xl transition-colors ' + (active ? 'bg-brand-subtleBg text-brand-subtleFg ring-1 ring-inset ring-brand/20' : 'text-content-secondary hover:bg-surface-subtle hover:text-content-primary')}>
          <Link to={to} onClick={mobile ? () => setMenuOpen(false) : undefined} className="flex min-w-0 flex-1 items-center gap-3 rounded-l-xl px-3 py-2.5 text-sm font-semibold"><LampDesk className="h-4 w-4 shrink-0" />{label}</Link>
          <button type="button" aria-label={lightingOpen ? 'Recolher iluminação pública' : 'Expandir iluminação pública'} aria-expanded={lightingOpen} aria-controls={submenuId} onClick={() => setLightingOpen((value) => !value)} className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand"><ChevronDown className={'h-4 w-4 transition-transform ' + (lightingOpen ? 'rotate-180' : '')} /></button>
        </div>
        {lightingOpen && <div id={submenuId} role="group" aria-label="Opções de iluminação pública" className="ml-3 mt-1 grid gap-0.5 rounded-r-xl border-l-2 border-brand/60 bg-surface-subtle/70 py-1 pl-2 pr-1">
          {[[to, 'Mapa', MapIcon], [`${to}/estatisticas`, 'Estatísticas', BarChart3]].map(([href, title, SubIcon]) => <Link key={href} to={href} aria-current={pathname === href ? 'page' : undefined} onClick={mobile ? () => setMenuOpen(false) : undefined} className={'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ' + (pathname === href ? 'bg-brand-subtleBg text-brand-subtleFg' : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary')}><SubIcon className="h-4 w-4 shrink-0" />{title}</Link>)}
        </div>}
      </div>;
    }
    if (to !== '/prefeitura/demandas') return <NavLink key={to} to={to} className={({ isActive }) => navClass({ isActive: isActive || (to === '/prefeitura/broncas' && pathname === '/prefeitura/mapa') })} onClick={mobile ? () => setMenuOpen(false) : undefined}>
      <Icon className="h-4 w-4" /> {label}
    </NavLink>;
    const submenuId = mobile ? 'municipality-mobile-orders' : 'municipality-desktop-orders';
    return <div key={to} className="min-w-0">
      <div className={'flex items-center rounded-xl transition-colors ' + (ordersActive ? 'bg-brand-subtleBg text-brand-subtleFg ring-1 ring-inset ring-brand/20' : 'text-content-secondary hover:bg-surface-subtle hover:text-content-primary')}>
        <Link to={to} aria-current={pathname === to && !inProgressActive ? 'page' : undefined} onClick={mobile ? () => setMenuOpen(false) : undefined} className="flex min-w-0 flex-1 items-center gap-3 rounded-l-xl px-3 py-2.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><ClipboardList className="h-4 w-4 shrink-0" />{label}</Link>
        <button type="button" aria-label={ordersOpen ? 'Recolher ordens de serviço' : 'Expandir ordens de serviço'} aria-expanded={ordersOpen} aria-controls={submenuId} onClick={() => setOrdersOpen((value) => !value)} className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><ChevronDown className={'h-4 w-4 transition-transform ' + (ordersOpen ? 'rotate-180' : '')} /></button>
      </div>
      {ordersOpen && <div id={submenuId} role="group" aria-label="Opções de ordens de serviço" className="ml-3 mt-1 grid gap-0.5 rounded-r-xl border-l-2 border-brand/60 bg-surface-subtle/70 py-1 pl-2 pr-1">
        {!isElectrician && <Link to="/prefeitura/demandas/nova" aria-current={newOrderActive ? 'page' : undefined} onClick={mobile ? () => setMenuOpen(false) : undefined} className={'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (newOrderActive ? 'bg-brand-subtleBg text-brand-subtleFg' : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary')}><Plus className="h-4 w-4 shrink-0" />Nova ordem</Link>}
        <Link to="/prefeitura/demandas?status=all&fila=em_atendimento" aria-current={inProgressActive ? 'page' : undefined} onClick={mobile ? () => setMenuOpen(false) : undefined} className={'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (inProgressActive ? 'bg-brand-subtleBg text-brand-subtleFg' : 'text-content-secondary hover:bg-surface-raised hover:text-content-primary')}><Clock3 className="h-4 w-4 shrink-0" />Em andamento</Link>
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

  return (
    <div className="relative flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-surface-base text-content-primary">
      <header className="relative z-40 shrink-0 border-b border-edge-subtle bg-header-bg text-header-fg shadow-sm">
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
            <Link to={isElectrician ? '/prefeitura/demandas' : '/prefeitura/visao-geral'} className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <img src={branding.logo} alt="" className="h-9 w-9 shrink-0 object-contain" onError={() => setBranding((current) => current.logo === '/logo.png' ? current : { ...current, logo: '/logo.png' })} />
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-extrabold tracking-tight sm:text-lg">{branding.name}</p>
                <p className="truncate text-[11px] font-medium opacity-75">Painel da Prefeitura</p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {memberships.length > 1 && <label className="min-w-0"><span className="sr-only">Prefeitura ativa</span><select aria-label="Prefeitura ativa" className="h-9 max-w-[9rem] rounded-lg border border-edge-subtle bg-surface-raised px-2 text-xs text-content-primary sm:max-w-[14rem]" value={municipality?.id || ''} onChange={(event) => selectMunicipalityWorkspace(user.id, event.target.value)}>{memberships.map((item) => <option key={item.prefeitura.id} value={item.prefeitura.id}>{item.prefeitura.nome}</option>)}</select></label>}
            <Button type="button" variant="ghost" size="icon" onClick={() => setPreference(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <div className="hidden text-right md:block">
              <p className="max-w-48 truncate text-xs font-bold">{user?.name || user?.email || 'Servidor municipal'}</p>
              <p className="text-[10px] opacity-75">{isAdministrator ? 'Administrador municipal' : isElectrician ? 'Eletricista' : 'Equipe municipal'}</p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-black text-content-onBrand">{initials || 'SM'}</div>
          </div>
        </div>
      </header>

      {menuOpen && <button type="button" className="absolute inset-x-0 bottom-0 top-16 z-30 bg-black/30 lg:hidden" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
      {menuOpen && (
        <div className="absolute inset-x-0 top-16 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-edge-subtle bg-surface-raised px-4 py-3 shadow-lg lg:hidden">
          <p className="mb-3 px-3 text-xs font-semibold text-content-secondary">{municipality?.nome || 'Gestão municipal'}{locationLabel ? ` · ${locationLabel}` : ''}</p>
          <nav id="municipality-mobile-nav" aria-label="Painel da prefeitura" className="grid gap-1">
            {renderNavigation(true)}
            <button type="button" onClick={handleSignOut} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand hover:bg-brand-subtleBg">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </nav>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-r border-edge-subtle bg-surface-raised lg:block">
          <div className="flex h-full min-h-0 flex-col p-4">
            <div className="mb-5 shrink-0 rounded-2xl border border-edge-subtle bg-surface-subtle p-4">
              <Building2 className="mb-3 h-5 w-5 text-brand" />
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">Gestão municipal</p>
              <p className="mt-2 break-words text-sm font-bold">{municipality?.nome || 'Painel da Prefeitura'}</p>
              <p className="mt-1 text-xs leading-5 text-content-secondary">{locationLabel || 'Atendimento às demandas da cidade'}</p>
            </div>
            <nav aria-label="Painel da prefeitura" className="grid min-h-0 content-start gap-1 overflow-y-auto">
              {renderNavigation()}
            </nav>
            <div className="mt-auto shrink-0 border-t border-edge-subtle pt-4">
              <button type="button" onClick={handleSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand hover:bg-brand-subtleBg">
                <LogOut className="h-4 w-4" /> Sair do painel
              </button>
            </div>
          </div>
        </aside>
        <main ref={contentRef} className="min-h-0 min-w-0 overflow-y-auto overscroll-contain">
          <ErrorBoundary key={pathname}><Outlet /></ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
