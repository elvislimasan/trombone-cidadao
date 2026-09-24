import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  Inbox,
  LogOut,
  Menu,
  Settings2,
  Users,
  X,
  Moon,
  Sun,
  Map,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useTheme } from '@/design-system/theme/ThemeProvider';

const navigation = [
  { to: '/prefeitura/broncas', label: 'Broncas', icon: Inbox, adminOnly: false },
  { to: '/prefeitura/mapa', label: 'Mapa de broncas', icon: Map, adminOnly: false },
  { to: '/prefeitura/secretarias', label: 'Secretarias', icon: Settings2, adminOnly: true },
  { to: '/prefeitura/equipe', label: 'Equipe', icon: Users, adminOnly: true },
];

const navClass = ({ isActive }) => [
  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
  isActive
    ? 'bg-brand-subtleBg text-brand-subtleFg ring-1 ring-inset ring-brand/20'
    : 'text-content-secondary hover:bg-surface-subtle hover:text-content-primary',
].join(' ');

export default function MunicipalityLayout({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const contentRef = useRef(null);
  const [memberships, setMemberships] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [branding, setBranding] = useState({ name: 'Trombone Cidadão', logo: '/logo.png' });
  const { resolved: theme, setPreference } = useTheme();

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    setMenuOpen(false);
  }, [pathname]);

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

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    supabase
      .from('prefeitura_membros')
      .select('papel, prefeitura:prefeituras!prefeitura_membros_prefeitura_id_fkey(nome, status, cidade:cities(name, states(uf)))')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .then(({ data }) => {
        if (active) setMemberships(data || []);
      });
    return () => { active = false; };
  }, [user?.id]);

  const isAdministrator = memberships.some((item) => item.papel === 'administrador' && item.prefeitura?.status === 'ativa');
  const municipality = memberships.find((item) => item.papel === 'administrador')?.prefeitura
    || memberships[0]?.prefeitura;
  const city = municipality?.cidade;
  const locationLabel = [city?.name, city?.states?.uf].filter(Boolean).join(' - ');
  const visibleNavigation = useMemo(
    () => navigation.filter((item) => !item.adminOnly || isAdministrator),
    [isAdministrator]
  );
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
            <Link to="/prefeitura/broncas" className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <img src={branding.logo} alt="" className="h-9 w-9 shrink-0 object-contain" onError={() => setBranding((current) => current.logo === '/logo.png' ? current : { ...current, logo: '/logo.png' })} />
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-extrabold tracking-tight sm:text-lg">{branding.name}</p>
                <p className="truncate text-[11px] font-medium opacity-75">Painel da Prefeitura</p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="icon" onClick={() => setPreference(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <div className="hidden text-right md:block">
              <p className="max-w-48 truncate text-xs font-bold">{user?.name || user?.email || 'Servidor municipal'}</p>
              <p className="text-[10px] opacity-75">{isAdministrator ? 'Administrador municipal' : 'Equipe municipal'}</p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-black text-content-onBrand">{initials || 'SM'}</div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="absolute inset-x-0 top-16 z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-edge-subtle bg-surface-raised px-4 py-3 shadow-lg lg:hidden">
          <p className="mb-3 px-3 text-xs font-semibold text-content-secondary">{municipality?.nome || 'Gestão municipal'}{locationLabel ? ` · ${locationLabel}` : ''}</p>
          <nav id="municipality-mobile-nav" aria-label="Painel da prefeitura" className="grid gap-1">
            {visibleNavigation.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={navClass} onClick={() => setMenuOpen(false)}>
                <Icon className="h-4 w-4" /> {label}
              </NavLink>
            ))}
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
              {visibleNavigation.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={navClass}>
                  <Icon className="h-4 w-4" /> {label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-auto shrink-0 border-t border-edge-subtle pt-4">
              <button type="button" onClick={handleSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand hover:bg-brand-subtleBg">
                <LogOut className="h-4 w-4" /> Sair do painel
              </button>
            </div>
          </div>
        </aside>
        <main ref={contentRef} className="min-h-0 min-w-0 overflow-y-auto overscroll-contain">{children}</main>
      </div>
    </div>
  );
}
