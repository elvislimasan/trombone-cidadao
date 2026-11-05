import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ChevronLeft, Search, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import Notifications from '@/components/Notifications';
import { useMobileHeader } from '@/contexts/MobileHeaderContext';
import { useNativeUIMode } from '@/contexts/NativeUIModeContext';
import { getMobileBackTarget, getMobileRoute } from '@/lib/mobileNavigation';

const MobileHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { title, actions, showBack, onBack } = useMobileHeader();
  const { isInteractive } = useNativeUIMode();
  const [branding, setBranding] = useState({ name: 'Trombone Cidadão', logo: '/logo.png' });
  const route = getMobileRoute(location.pathname);
  const headerTitle = title || route.title || branding.name;
  const shouldShowBack = showBack ?? !route.root;
  const hasActions = actions.length > 0;
  const iconButtonClass = 'h-12 w-12 shrink-0 rounded-full';
  const headerStyle = {
    backgroundColor: 'rgb(var(--header-bg))',
    color: 'rgb(var(--header-fg))',
  };

  useEffect(() => {
    if (!isInteractive) return undefined;
    let active = true;
    const loadBranding = async () => {
      try {
        const { data } = await supabase.from('site_config').select('site_name, logo_url').eq('id', 1).single();
        if (active && data) setBranding({ name: data.site_name || 'Trombone Cidadão', logo: data.logo_url || '/logo.png' });
      } catch { /* A marca local mantém o cabeçalho disponível sem conexão. */ }
    };
    void loadBranding();
    window.addEventListener('site-settings-updated', loadBranding);
    return () => { active = false; window.removeEventListener('site-settings-updated', loadBranding); };
  }, [isInteractive]);

  if (!isInteractive) return null;

  const goBack = () => {
    if (onBack) return onBack();
    const target = getMobileBackTarget(route, window.history.state);
    navigate(target, typeof target === 'number' ? undefined : { replace: true });
  };

  return (
    <header
      className="fixed inset-x-0 top-0 z-[1001] border-b border-edge-subtle"
      style={{ ...headerStyle, paddingTop: 'var(--header-safe-top)', height: 'calc(var(--header-bar-height) + var(--header-safe-top))' }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-full h-screen" style={{ backgroundColor: headerStyle.backgroundColor }} />
      <div className="flex w-full min-w-0 items-center justify-between gap-1 px-2" style={{ height: 'var(--header-bar-height)', paddingLeft: 'max(8px, var(--safe-area-left, 0px))', paddingRight: 'max(8px, var(--safe-area-right, 0px))' }}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {shouldShowBack ? (
            <Button type="button" variant="ghost" size="icon" onClick={goBack} className={iconButtonClass} aria-label="Voltar">
              <ChevronLeft size={26} aria-hidden="true" />
            </Button>
          ) : (
            <Link to="/" aria-label="Ir para o início" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <img src={branding.logo} alt="" className="h-7 w-7 object-contain" onError={() => setBranding(current => current.logo === '/logo.png' ? current : { ...current, logo: '/logo.png' })} />
            </Link>
          )}
          <span className="min-w-0 truncate text-sm font-bold sm:text-base" title={headerTitle}>{headerTitle}</span>
        </div>
        <div className="flex shrink-0 items-center">
          {route.root && !hasActions && (
            <Button type="button" variant="ghost" size="icon" onClick={() => navigate('/buscar')} className={iconButtonClass} aria-label="Buscar na cidade">
              <Search size={22} aria-hidden="true" />
            </Button>
          )}
          {hasActions ? actions.map(action => (
            <Button key={action.key} type="button" variant="ghost" size="icon"
              className={`${iconButtonClass} ${action.isActive ? (action.activeClassName || 'bg-brand-subtleBg') : ''}`}
              onClick={action.onPress} aria-label={action.ariaLabel || action.key} title={action.ariaLabel || action.key}>
              <action.icon size={22} aria-hidden="true" className={action.iconClassName || (action.isActive ? 'text-brand' : '')} />
            </Button>
          )) : (
            <>
              <Notifications />
              {route.share && typeof navigator.share === 'function' && (
                <Button type="button" variant="ghost" size="icon" className={iconButtonClass} aria-label="Compartilhar"
                  onClick={() => { navigator.share({ title: headerTitle, url: window.location.href }).catch(() => {}); }}>
                  <Share2 size={22} aria-hidden="true" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default MobileHeader;
