import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ChevronLeft, Search, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import Notifications from '@/components/Notifications';
import { Capacitor } from '@capacitor/core';
import { defaultMenuSettings } from '@/config/menuConfig';
import { useMobileHeader } from '@/contexts/MobileHeaderContext';
import { useNativeUIMode } from '@/contexts/NativeUIModeContext';

const MobileHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { title: ctxTitle, actions: ctxActions, showBack: ctxShowBack, onBack: ctxOnBack } = useMobileHeader();
  const { isInteractive } = useNativeUIMode();
  const [siteName, setSiteName] = useState('Trombone Cidadão');
  const [logoUrl, setLogoUrl] = useState('/logo.png');
  const [pageTitle, setPageTitle] = useState('');
  const [menuSettings, setMenuSettings] = useState(defaultMenuSettings);

  // Rotas que são consideradas "raízes" (mostram logo em vez de botão voltar)
  const rootRoutes = ['/', '/estatisticas', '/favoritos', '/perfil', '/buscar'];
  const isRoot = rootRoutes.includes(location.pathname);
  const authRoutes = ['/login', '/cadastro', '/recuperar-senha'];
  const isAuthRoute = authRoutes.includes(location.pathname);
  const shouldShowBack = typeof ctxShowBack === 'boolean' ? ctxShowBack : !isRoot;
  
  const headerTitle = (() => {
    const path = location.pathname;
    if (path === '/') return siteName;

    if (path === '/obras-publicas') return 'Obras';
    if (path.startsWith('/obras-publicas/')) return 'Obras • Detalhes';

    if (path === '/noticias') return 'Notícias';
    if (path.startsWith('/noticias/')) return 'Notícias • Detalhes';

    if (path.startsWith('/bronca/')) return 'Broncas • Detalhes';

    if (path === '/abaixo-assinados') return 'Abaixo-assinados';
    if (path.startsWith('/abaixo-assinado/')) return 'Abaixo-assinados • Detalhes';

    if (path === '/estatisticas') return 'Estatísticas';
    if (path === '/favoritos') return 'Favoritos';
    if (path === '/perfil') return 'Perfil';
    if (path === '/buscar') return 'Buscar';
    if (path === '/settings/notifications') return 'Notificações';

    return ctxTitle || pageTitle || siteName;
  })();

  const headerStyle = {
    backgroundColor: menuSettings?.colors?.background || defaultMenuSettings.colors.background,
    color: menuSettings?.colors?.text || defaultMenuSettings.colors.text,
  };

  const fetchSiteSettings = useCallback(async () => {
    const { data } = await supabase
      .from('site_config')
      .select('site_name, logo_url, menu_settings')
      .eq('id', 1)
      .single();

    if (data) {
      setSiteName(data.site_name || 'Trombone Cidadão');
      setLogoUrl(data.logo_url || '/logo.png');
      if (data.menu_settings) {
        setMenuSettings({
          ...defaultMenuSettings,
          ...data.menu_settings,
          colors: {
            ...defaultMenuSettings.colors,
            ...(data.menu_settings.colors || {}),
          },
        });
      } else {
        setMenuSettings(defaultMenuSettings);
      }
    }
  }, []);

  useEffect(() => {
    fetchSiteSettings();
    
    // Mapeamento simples de títulos para páginas conhecidas
    const path = location.pathname;
    if (path.startsWith('/bronca/')) setPageTitle('Detalhes da Bronca');
    else if (path.startsWith('/noticias/')) setPageTitle('Notícia');
    else if (path === '/noticias') setPageTitle('Notícias');
    else if (path.startsWith('/obras-publicas/')) setPageTitle('Detalhes da Obra');
    else if (path === '/obras-publicas') setPageTitle('Obras');
    else if (path === '/sobre') setPageTitle('Sobre o Projeto');
    else if (path === '/servicos') setPageTitle('Serviços');
    else if (path === '/contato') setPageTitle('Contato');
    else if (path === '/mapa-pavimentacao') setPageTitle('Pavimentação');
    else if (path === '/abaixo-assinados') setPageTitle('Abaixo-Assinados');
    else if (path === '/estatisticas') setPageTitle('Estatísticas');
    else if (path === '/favoritos') setPageTitle('Favoritos');
    else if (path === '/perfil') setPageTitle('Perfil');
    else if (path === '/buscar') setPageTitle('Buscar');
    else if (path === '/settings/notifications') setPageTitle('Notificações');
    else setPageTitle('');
  }, [location.pathname, fetchSiteSettings]);

  if (!Capacitor.isNativePlatform() || !isInteractive) return null;

  return (
    <header 
      className="fixed top-0 left-0 right-0 z-[1001] border-b transition-all duration-300"
      style={{
        ...headerStyle,
        paddingTop: 'max(env(safe-area-inset-top), 0px)',
        height: 'calc(4rem + max(env(safe-area-inset-top), 0px))'
      }}
    >
      <div className="container h-16 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {shouldShowBack ? (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => {
                if (ctxOnBack) {
                  ctxOnBack();
                  return;
                }
                if (isAuthRoute) {
                  navigate('/', { replace: true });
                  return;
                }
                if (window.history.length > 1) {
                  navigate(-1);
                } else {
                  navigate('/', { replace: true });
                }
              }}
              className="rounded-full"
            >
              <ChevronLeft size={28} />
            </Button>
          ) : (
            <Link to="/" className="flex items-center">
              <img src={logoUrl} alt="Logo" className="h-8 w-auto" />
            </Link>
          )}
          <span className="font-bold text-base truncate max-w-[56vw]">
            {headerTitle}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isRoot && location.pathname !== '/buscar' && (!ctxActions || ctxActions.length === 0) && (
            <Button variant="ghost" size="icon" onClick={() => navigate('/buscar')} className="rounded-full">
              <Search size={22} />
            </Button>
          )}
          {ctxActions && ctxActions.length > 0 ? (
            ctxActions.map((a) => (
              <Button
                key={a.key}
                variant="ghost"
                size="icon"
                className={`rounded-full ${a.isActive ? (a.activeClassName || 'bg-black/10') : ''}`}
                onClick={a.onPress}
                aria-label={a.ariaLabel || a.key}
                title={a.ariaLabel || a.key}
                type="button"
              >
                <a.icon size={22} className={a.iconClassName || (a.isActive ? 'text-yellow-300' : '')} />
              </Button>
            ))
          ) : (
            <>
              <Notifications />
              {!isRoot && (location.pathname.includes('/bronca/') || location.pathname.includes('/noticias/')) && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full"
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({
                        title: pageTitle,
                        url: window.location.href
                      }).catch(() => {});
                    }
                  }}
                  type="button"
                >
                  <Share2 size={22} />
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
