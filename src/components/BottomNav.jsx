import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, BarChart3, PlusCircle, Star, User, MoreHorizontal, Info, Newspaper, Construction, Mail, Route, Briefcase, FileSignature, LayoutDashboard, Shield, Settings, FileText, HardHat } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import ReportModal from '@/components/ReportModal';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { defaultMenuSettings } from '@/config/menuConfig';
import { useNativeUIMode } from '@/contexts/NativeUIModeContext';

const BottomNav = () => {
  const location = useLocation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showReportModal, setShowReportModal] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [menuSettings, setMenuSettings] = useState(defaultMenuSettings);
  const isNative = Capacitor.isNativePlatform();
  const { isInteractive } = useNativeUIMode();
  const isInteractiveMode = isNative && isInteractive;

  const triggerHaptic = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch (e) {}
    }
  };

  const fetchSiteSettings = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('site_config')
        .select('menu_settings')
        .eq('id', 1)
        .single();

      if (data?.menu_settings) {
        const mergedItems = defaultMenuSettings.items.map((defaultItem) => {
          const savedItem = data.menu_settings.items?.find((item) => item.path === defaultItem.path);
          return savedItem ? { ...defaultItem, ...savedItem } : defaultItem;
        });

        setMenuSettings({
          ...defaultMenuSettings,
          ...data.menu_settings,
          items: mergedItems,
          colors: {
            ...defaultMenuSettings.colors,
            ...(data.menu_settings.colors || {}),
          },
        });
      } else {
        setMenuSettings(defaultMenuSettings);
      }
    } catch (e) {
      setMenuSettings(defaultMenuSettings);
    }
  }, []);

  useEffect(() => {
    if (!isInteractiveMode) return;
    fetchSiteSettings();
  }, [fetchSiteSettings, isInteractiveMode]);

  const handleNewReportClick = () => {
    triggerHaptic();
    if (user) {
      setShowReportModal(true);
    } else {
     
      navigate('/login');
    }
  };

  const handleCreateReport = async (newReportData, uploadMediaCallback) => {
    // ... existing logic ...
    if (!user) return;

    const { title, description, category, address, location, pole_number, is_from_water_utility } = newReportData;
    
    const { data, error } = await supabase
      .from('reports')
      .insert({
        title,
        description,
        category_id: category,
        address,
        location: `POINT(${location.lng} ${location.lat})`,
        author_id: user.id,
        protocol: `TROMB-${Date.now()}`,
        pole_number: category === 'iluminacao' ? pole_number : null,
        is_from_water_utility: category === 'buracos' ? !!is_from_water_utility : null,
        status: 'pending',
        moderation_status: user?.is_admin ? 'approved' : 'pending_approval'
      })
      .select('id')
      .single();

    if (error) {
      toast({ title: "Erro ao criar bronca", description: error.message, variant: "destructive" });
      return;
    }

    if (uploadMediaCallback) {
      try {
        await uploadMediaCallback(data.id);
      } catch (uploadError) {
        console.error("Erro no upload de mídia, removendo bronca:", uploadError);
        await supabase.from('reports').delete().eq('id', data.id);
        throw uploadError;
      }
    }

    toast({ title: "Upload iniciado! 🚀", description: "Você será notificado quando concluir." });
    setShowReportModal(false);
    window.dispatchEvent(new CustomEvent('reports-updated'));
  };

  const navItems = isInteractiveMode
    ? [
        { path: '/', icon: Home, label: 'Início' },
        { path: '/estatisticas', icon: BarChart3, label: 'Stats' },
        { path: 'modal', icon: PlusCircle, label: 'Adicionar' },
        { path: '/favoritos', icon: Star, label: 'Favoritos' },
        { path: 'more', icon: MoreHorizontal, label: 'Mais' },
      ]
    : [
        { path: '/', icon: Home, label: 'Início' },
        { path: '/estatisticas', icon: BarChart3, label: 'Stats' },
        { path: 'modal', icon: PlusCircle, label: 'Adicionar' },
        { path: '/favoritos', icon: Star, label: 'Favoritos' },
        { path: '/perfil', icon: User, label: 'Perfil' },
      ];

  const extraItems = useMemo(() => {
    if (!isInteractiveMode) return [];
    const visibleMenuItems = (menuSettings?.items || defaultMenuSettings.items).filter((item) => item.isVisible);

    const iconByPath = {
      '/': Home,
      '/sobre': Info,
      '/estatisticas': BarChart3,
      '/obras-publicas': Construction,
      '/mapa-pavimentacao': Route,
      '/servicos': Briefcase,
      '/abaixo-assinados': FileSignature,
      '/noticias': Newspaper,
      '/contato': Mail,
    };

    const base = visibleMenuItems.map((item) => {
      const Icon = iconByPath[item.path] || MoreHorizontal;
      return { path: item.path, icon: Icon, label: item.name };
    });

    const account = [];
    if (user) {
      account.push({ path: '/perfil', icon: User, label: 'Perfil' });
      account.push({ path: '/settings/notifications', icon: Settings, label: 'Notificações' });
      if (user.is_admin) {
        account.push({ path: '/admin', icon: Shield, label: 'Admin' });
      }
    } else {
      account.push({ path: '/login', icon: User, label: 'Entrar' });
    }

    const deduped = [];
    const seen = new Set();
    for (const item of [...base, ...account]) {
      if (item.path === '/') continue;
      if (item.path === '/estatisticas' || item.path === '/favoritos') continue;
      if (item.path === '/sobre') continue;
      if (seen.has(item.path)) continue;
      seen.add(item.path);
      deduped.push(item);
    }
    return deduped;
  }, [isInteractiveMode, menuSettings, user]);

  const navLinkClass = (path) => {
    const isActive = location.pathname === path;
    return `flex flex-col items-center justify-center gap-1 transition-all duration-200 ${isActive ? 'text-primary scale-110 font-bold' : 'text-muted-foreground hover:text-foreground'}`;
  };

  return (
    <>
      <div 
        className="fixed left-0 right-0 bg-background/80 backdrop-blur-lg border-t border-border z-[1000] lg:hidden" 
        style={{ 
          bottom: 0,
          paddingBottom: 'max(env(safe-area-inset-bottom), 0px)',
          minHeight: '4.5rem',
          marginBottom: 0
        }}
      >
        <div className="container mx-auto h-16">
          <div className="grid grid-cols-5 items-center h-full">
            {navItems.map((item) => {
              if (item.path === 'modal') {
                return (
                  <button 
                    key={item.label} 
                    onClick={handleNewReportClick} 
                    className="justify-self-center flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary -mt-8"
                  >
                    <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-xl ring-4 ring-background">
                      <PlusCircle size={32} />
                    </div>
                  </button>
                );
              }
              
              if (item.path === 'more') {
                return (
                  <div key={item.label} className="justify-self-center">
                    <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                      <DrawerTrigger asChild>
                        <button 
                          onClick={triggerHaptic}
                          className="flex flex-col items-center justify-center gap-1 text-muted-foreground"
                        >
                          <MoreHorizontal size={24} />
                          <span className="text-[10px] font-medium">{item.label}</span>
                        </button>
                      </DrawerTrigger>
                      <DrawerContent className="px-4 pb-12">
                        <DrawerHeader>
                          <DrawerTitle>Menu Principal</DrawerTitle>
                        </DrawerHeader>
                        <div className="grid grid-cols-3 gap-4 mt-4">
                          {extraItems.map((extra) => (
                            <button
                              key={extra.path}
                              onClick={() => {
                                triggerHaptic();
                                setIsDrawerOpen(false);
                                navigate(extra.path);
                              }}
                              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-accent/30 hover:bg-accent/50 transition-colors"
                            >
                              <extra.icon size={24} className="text-primary" />
                              <span className="text-xs font-medium">{extra.label}</span>
                            </button>
                          ))}
                        </div>
                      </DrawerContent>
                    </Drawer>
                  </div>
                );
              }

              return (
                <NavLink 
                  key={item.label} 
                  to={item.path} 
                  onClick={triggerHaptic}
                  className={`${navLinkClass(item.path)} justify-self-center`}
                >
                  <item.icon size={24} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>
      {showReportModal && <ReportModal onClose={() => setShowReportModal(false)} onSubmit={handleCreateReport} />}
    </>
  );
};

export default BottomNav;
