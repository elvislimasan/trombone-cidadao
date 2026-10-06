import React from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, ClipboardList, LogOut, Map as MapIcon, MapPin, Moon, Sun, UserCircle, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { selectMunicipalityWorkspace } from '@/hooks/useMunicipalityWorkspace';
import { Button } from '@/components/ui/button';
import { useIsDesktopViewport } from '@/hooks/useIsDesktopViewport';
import { useNativeUIMode } from '@/contexts/NativeUIModeContext';
import ElectricianDesktopUnavailable from '@/components/municipality/ElectricianDesktopUnavailable';
import Notifications from '@/components/Notifications';
import { useTheme } from '@/design-system/theme/ThemeProvider';

const panelPath = '/prefeitura/eletricista';

export default function ElectricianLayout({ context, branding }) {
  const { user, signOut } = useAuth();
  const { resolved: theme, setPreference } = useTheme();
  const { isNative } = useNativeUIMode();
  const desktopUnavailable = useIsDesktopViewport() && !isNative;
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const activeTab = params.get('aba') === 'disponiveis' ? 'disponiveis' : 'minhas';
  const mapActive = location.pathname === panelPath && params.get('vista') === 'mapa';
  const profileActive = location.pathname === panelPath + '/perfil';
  const statsActive = location.pathname.startsWith(panelPath + '/estatisticas');
  const ordersActive = location.pathname.startsWith(panelPath + '/ordem/') || (location.pathname === panelPath && activeTab === 'minhas' && !mapActive);
  const city = context.municipality?.cidade;
  const cityName = [city?.name, city?.states?.uf].filter(Boolean).join(' · ');

  const logout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const patrolActive = location.pathname === panelPath + '/patrulha' || location.pathname.startsWith(panelPath + '/patrulha/');
  if (patrolActive && !desktopUnavailable) return <Outlet context={context} />;
  return <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-surface-base text-content-primary">
    <header className="shrink-0 border-b border-edge-subtle bg-header-bg text-header-fg shadow-sm" style={{ paddingTop: 'var(--header-safe-top, 0px)', paddingLeft: 'var(--safe-area-left, 0px)', paddingRight: 'var(--safe-area-right, 0px)' }}>
      <div className="page-shell-fluid flex min-h-16 flex-wrap items-center justify-between gap-3 py-2">
        <Link to={panelPath} className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <img src={branding?.logo || '/logo.png'} alt="" className="h-9 w-9 shrink-0 object-contain" onError={(event) => { if (!event.currentTarget.src.endsWith('/logo.png')) event.currentTarget.src = '/logo.png'; }} />
          <span className="min-w-0"><strong className="block truncate font-display text-sm font-extrabold tracking-tight sm:text-lg">{branding?.name || 'Trombone Cidadão'}</strong><span className="block truncate text-[11px] font-medium opacity-75">Painel do eletricista</span></span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1 text-xs font-semibold text-content-secondary xl:flex"><MapPin className="h-3.5 w-3.5" />{cityName || 'Iluminação pública'}</span>
          {context.memberships.length > 1 && <select aria-label="Prefeitura ativa" className="h-10 max-w-28 rounded-lg border border-edge-default bg-surface-raised px-2 text-xs text-content-primary sm:max-w-40" value={context.municipality?.id || ''} onChange={(event) => selectMunicipalityWorkspace(user.id, event.target.value)}>{context.memberships.map((member) => <option key={member.prefeitura.id} value={member.prefeitura.id}>{member.prefeitura.nome}</option>)}</select>}
          <Button type="button" variant="ghost" size="icon" onClick={() => setPreference(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'} title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Notifications scope="electrician" />
          <Button type="button" variant="ghost" size="icon" onClick={logout} aria-label="Sair do painel"><LogOut className="h-4 w-4" /></Button>
        </div>
      </div>
    </header>
    <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
      {desktopUnavailable ? <ElectricianDesktopUnavailable /> : <Outlet context={context} />}
    </main>
    {!desktopUnavailable && <nav aria-label="Painel do eletricista" className="relative z-40 shrink-0 border-t border-edge-subtle bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-elevation-2">
      <div className="mx-auto grid h-16 w-full max-w-2xl grid-cols-5 items-center gap-0.5 px-2 sm:gap-1 sm:px-4">
        <Link to={panelPath} aria-label="Minhas ordens" aria-current={ordersActive ? 'page' : undefined} className={'flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors sm:text-[11px] ' + (ordersActive ? 'font-bold text-brand' : 'font-medium text-content-tertiary hover:text-content-primary')}><ClipboardList className="h-[22px] w-[22px]" />Ordens</Link>
        <Link to={panelPath + '?aba=disponiveis&vista=lista'} aria-label="Serviços disponíveis" aria-current={location.pathname === panelPath && activeTab === 'disponiveis' && !mapActive ? 'page' : undefined} className={'flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors sm:text-[11px] ' + (location.pathname === panelPath && activeTab === 'disponiveis' && !mapActive ? 'font-bold text-brand' : 'font-medium text-content-tertiary hover:text-content-primary')}><Zap className="h-[22px] w-[22px]" />Disponíveis</Link>
        <Link to={panelPath + '?vista=mapa'} aria-label="Mapa de iluminação" aria-current={mapActive ? 'page' : undefined} className="-mt-7 flex flex-col items-center justify-center gap-1 text-xs font-semibold text-content-primary"><span className={'flex h-14 w-14 items-center justify-center rounded-full text-content-onBrand shadow-elevation-3 ring-4 ring-surface-raised transition-transform active:scale-95 ' + (mapActive ? 'bg-brand ring-brand-subtleBg' : 'bg-brand')}><MapIcon className="h-7 w-7" /></span>Mapa</Link>
        <Link to={panelPath + '/estatisticas'} aria-label="Minhas estatísticas" aria-current={statsActive ? 'page' : undefined} className={'flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors sm:text-[11px] ' + (statsActive ? 'font-bold text-brand' : 'font-medium text-content-tertiary hover:text-content-primary')}><BarChart3 className="h-[22px] w-[22px]" />Estatísticas</Link>
        <Link to={panelPath + '/perfil'} aria-label="Meu perfil" aria-current={profileActive ? 'page' : undefined} className={'flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 text-[10px] transition-colors sm:text-[11px] ' + (profileActive ? 'font-bold text-brand' : 'font-medium text-content-tertiary hover:text-content-primary')}><UserCircle className="h-[22px] w-[22px]" />Perfil</Link>
      </div>
    </nav>}
  </div>;
}
