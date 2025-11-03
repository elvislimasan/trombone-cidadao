import React, { useState, useEffect, useCallback } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as LucideIcons from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { defaultMenuSettings } from '@/config/menuConfig';
import Avatar from 'react-nice-avatar';
import Notifications from '@/components/Notifications';
import { Switch } from './ui/switch';
import { useNotifications } from '../contexts/NotificationContext';

const Header = () => {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [siteName, setSiteName] = useState('Trombone Cidadão');
  const [logoUrl, setLogoUrl] = useState('logo.webp');
  const [menuSettings, setMenuSettings] = useState(defaultMenuSettings);
  const location = useLocation();
  const { 
    notificationsEnabled, 
    toggleNotifications,
    pushEnabled,
    loading
  } = useNotifications();

  const fetchSiteSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from('site_config')
      .select('site_name, logo_url, menu_settings')
      .eq('id', 1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("Error fetching site settings:", error);
    } else if (data) {
      setSiteName(data.site_name || 'Trombone Cidadão');
      setLogoUrl(data.logo_url || 'logo.webp');
      setMenuSettings(data.menu_settings || defaultMenuSettings);
    }
  }, []);

  // Função para lidar com a mudança do switch
  const handleToggleNotifications = async () => {
    try {
      await toggleNotifications();
    } catch (error) {
      console.error('Erro ao alternar notificações:', error);
    }
  };

  useEffect(() => {
    fetchSiteSettings();
    
    window.addEventListener('site-settings-updated', fetchSiteSettings);
    
    return () => {
      window.removeEventListener('site-settings-updated', fetchSiteSettings);
    };
  }, [fetchSiteSettings]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  const navLinkClass = ({ isActive }) =>
    `relative font-semibold transition-colors duration-300 ${isActive ? 'text-tc-red' : 'hover:text-tc-red'}`;

  const mobileNavLinkClass = ({ isActive }) =>
    `block py-3 text-2xl font-semibold transition-colors duration-300 ${isActive ? 'text-tc-red' : 'hover:text-tc-red'}`;

  const visibleMenuItems = menuSettings.items.filter(item => item.isVisible);
  const headerStyle = {
    backgroundColor: menuSettings.colors.background,
    color: menuSettings.colors.text,
  };

  const getAvatarComponent = (user) => {
    if (!user) return <Avatar className="w-full h-full" />;

    if (user.avatar_type === 'url' && user.avatar_url) {
      return <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" />;
    }
    
    if (user.avatar_type === 'generated' && user.avatar_config) {
      let config = user.avatar_config;
      if (typeof config === 'string') {
        try {
          config = JSON.parse(config);
        } catch (e) {
          config = {};
        }
      }
      return <Avatar className="w-full h-full" {...config} />;
    }
    
    return <Avatar className="w-full h-full" />;
  };

  return (
    <header style={headerStyle} className="fixed top-0 left-0 right-0 z-[1001] border-b pt-safe mt-safe">
      <div className="container mx-auto px-4 h-16 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-3">
          <img src={logoUrl || 'logo.webp'} alt={siteName} className="h-10 w-auto" />
          <span className="font-bold text-xl">{siteName}</span>
        </Link>

        <nav className="hidden lg:flex items-center gap-6">
          {visibleMenuItems.map(item => (
            <NavLink key={item.path} to={item.path} className={navLinkClass} style={({isActive}) => isActive ? {color: '#dc2626'} : {}}>
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-4">
          {user ? (
            <>
              <Notifications />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 overflow-hidden">
                    {getAvatarComponent(user)}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/perfil" className="flex items-center"><LucideIcons.User className="mr-2 h-4 w-4" /><span>Meu Perfil</span></Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/painel-usuario" className="flex items-center"><LucideIcons.LayoutDashboard className="mr-2 h-4 w-4" /><span>Meu Painel</span></Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/favoritos" className="flex items-center"><LucideIcons.Star className="mr-2 h-4 w-4" /><span>Broncas Favoritas</span></Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/obras-favoritas" className="flex items-center"><LucideIcons.HardHat className="mr-2 h-4 w-4" /><span>Obras Favoritas</span></Link>
                  </DropdownMenuItem>
                  {user.is_admin && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="flex items-center"><LucideIcons.Shield className="mr-2 h-4 w-4" /><span>Admin</span></Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="flex items-center justify-between"
                    onSelect={(e) => {
                      e.preventDefault();
                      handleToggleNotifications();
                    }}
                    disabled={loading}
                  >
                    <div className="flex flex-col">
                      <span>Notificações do Site</span>
                      <span className="text-xs text-muted-foreground">
                        {notificationsEnabled ? 'Ativadas' : 'Desativadas'}
                      </span>
                    </div>
                    <Switch
                      checked={notificationsEnabled}
                      onCheckedChange={handleToggleNotifications}
                      size="sm"
                      disabled={loading}
                    />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="flex items-center text-red-500 focus:text-red-500 focus:bg-red-500/10">
                    <LucideIcons.LogOut className="mr-2 h-4 w-4" />
                    <span>Sair</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="hidden lg:flex items-center gap-2">
              <Button asChild variant="ghost"><Link to="/login">Entrar</Link></Button>
              <Button asChild><Link to="/cadastro">Cadastre-se</Link></Button>
            </div>
          )}

          <button
            className="lg:hidden z-[1001]"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Abrir menu"
          >
            {isOpen ? <LucideIcons.X size={28} /> : <LucideIcons.Menu size={28} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{backgroundColor: menuSettings.colors.background}}
            className="fixed inset-0 z-[1000] lg:hidden"
          >
            <motion.div
              initial={{ y: '-100%' }}
              animate={{ y: 0 }}
              exit={{ y: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="container mx-auto px-4 pt-24 pb-8 flex flex-col h-full"
            >
              <nav className="flex flex-col items-center justify-center flex-grow gap-6 text-center">
                {visibleMenuItems.map(item => (
                  <NavLink key={item.path} to={item.path} className={mobileNavLinkClass} style={({isActive}) => isActive ? {color: '#dc2626'} : {color: menuSettings.colors.text}}>
                    {item.name}
                  </NavLink>
                ))}
              </nav>
              <div className="flex flex-col items-center gap-4 mt-8">
                {user ? (
                  <>
                    <div className="flex items-center justify-between w-full px-4 py-2">
                      <span>Notificações do Site</span>
                      <Switch
                        checked={notificationsEnabled}
                        onCheckedChange={handleToggleNotifications}
                        disabled={loading}
                      />
                    </div>
                    <Button onClick={signOut} variant="outline" className="w-full">Sair</Button>
                  </>
                ) : (
                  <>
                    <Button asChild variant="outline" className="w-full"><Link to="/login">Entrar</Link></Button>
                    <Button asChild className="w-full"><Link to="/cadastro">Cadastre-se</Link></Button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;