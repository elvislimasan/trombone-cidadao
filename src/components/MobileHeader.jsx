import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ChevronLeft, Search, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import Notifications from '@/components/Notifications';
import { Capacitor } from '@capacitor/core';
import { defaultMenuSettings } from '@/config/menuConfig';

const MobileHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [siteName, setSiteName] = useState('Trombone Cidadão');
  const [logoUrl, setLogoUrl] = useState('/logo.png');
  const [pageTitle, setPageTitle] = useState('');
  const [menuSettings, setMenuSettings] = useState(defaultMenuSettings);

  // Rotas que são consideradas "raízes" (mostram logo em vez de botão voltar)
  const rootRoutes = ['/', '/estatisticas', '/favoritos', '/perfil', '/buscar'];
  const isRoot = rootRoutes.includes(location.pathname);
  const authRoutes = ['/login', '/cadastro', '/recuperar-senha'];
  const isAuthRoute = authRoutes.includes(location.pathname);

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
    else if (path.startsWith('/obras-publicas/')) setPageTitle('Detalhes da Obra');
    else if (path === '/sobre') setPageTitle('Sobre o Projeto');
    else if (path === '/servicos') setPageTitle('Serviços');
    else if (path === '/contato') setPageTitle('Contato');
    else if (path === '/mapa-pavimentacao') setPageTitle('Pavimentação');
    else if (path === '/abaixo-assinados') setPageTitle('Abaixo-Assinados');
    else setPageTitle('');
  }, [location.pathname, fetchSiteSettings]);

  if (!Capacitor.isNativePlatform()) return null;

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
        <div className="flex items-center gap-2">
          {!isRoot ? (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => {
                if (isAuthRoute) {
                  navigate('/', { replace: true });
                  return;
                }
                navigate(-1);
              }}
              className="rounded-full"
            >
              <ChevronLeft size={28} />
            </Button>
          ) : (
            <Link to="/" className="flex items-center gap-2">
              <img src={logoUrl} alt="Logo" className="h-8 w-auto" />
              <span className="font-bold text-sm tracking-tight hidden sm:block">{siteName}</span>
            </Link>
          )}
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center">
          <span className="font-bold text-base truncate max-w-[180px]">
            {isRoot ? siteName : pageTitle}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isRoot && location.pathname !== '/buscar' && (
            <Button variant="ghost" size="icon" onClick={() => navigate('/buscar')} className="rounded-full">
              <Search size={22} />
            </Button>
          )}
          
          <Notifications />
          
          {/* Botão de compartilhar em páginas de detalhes */}
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
            >
              <Share2 size={22} />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default MobileHeader;
