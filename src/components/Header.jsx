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
  const [logoUrl, setLogoUrl] = useState('/logo.png');
  const [logoError, setLogoError] = useState(false);
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
      setLogoUrl(data.logo_url || '/logo.png');
      setMenuSettings(data.menu_settings || defaultMenuSettings);
      // Resetar logoError quando buscar nova configuração
      setLogoError(false);
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
    <header 
      style={{
        ...headerStyle, 
        top: 0,
        paddingTop: 'calc(var(--safe-area-top))',
        height: 'calc(4rem + var(--safe-area-top))',
        marginTop: 0
      }} 
      className="fixed left-0 right-0 z-[1001] border-b"
    >
      <div className="container mx-auto px-4 h-16 flex justify-between items-center" style={{ marginTop: 0 }}>
        <Link to="/" className="flex items-center gap-3">
          <img 
            src={logoError ? '/logo.png' : (logoUrl || '/logo.png')} 
            alt={siteName} 
            className="h-10 w-auto"
            onError={(e) => {
              if (!logoError) {
                setLogoError(true);
                // Tentar logo.png como fallback
                e.target.src = '/logo.png';
              } else {
                // Se logo.png também falhar, usar um placeholder ou deixar vazio
                e.target.style.display = 'none';
              }
            }}
          />
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
                  <DropdownMenuItem asChild>
                    <Link to="/settings/notifications" className="flex items-center"><LucideIcons.Settings className="mr-2 h-4 w-4" /><span>Preferências de Notificações</span></Link>
                  </DropdownMenuItem>
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
            style={{
              backgroundColor: menuSettings.colors.background,
              paddingTop: 'var(--safe-area-top)',
              paddingBottom: 'var(--safe-area-bottom)'
            }}
            className="fixed inset-0 z-[1000] lg:hidden"
          >
            <motion.div
              initial={{ y: '-100%' }}
              animate={{ y: 0 }}
              exit={{ y: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="container mx-auto px-4 pt-12 pb-8 flex flex-col h-full overflow-y-auto"
            >
              <div className="flex flex-col items-center gap-4 mb-4 w-full shrink-0 relative z-50">
                {user ? (
                  <div className="w-full max-w-sm mx-auto bg-white/5 rounded-xl p-4 border border-white/10 backdrop-blur-sm flex flex-col gap-3">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 ring-2 ring-white/20">
                        {getAvatarComponent(user)}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="font-bold text-lg truncate text-foreground">{user.name || 'Usuário'}</span>
                        <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                      </div>
                    </div>
                    
                    {/* <div className="h-px w-full bg-white/10 my-1" /> */}
                    
                    {/* <Button asChild variant="ghost" className="w-full justify-start hover:bg-white/10">
                      <Link to="/settings/notifications" className="flex items-center gap-3">
                        <div className="p-1.5 bg-white/10 rounded-md">
                          <LucideIcons.Settings className="h-4 w-4" />
                        </div>
                        <span>Configurar Notificações</span>
                      </Link>
                    </Button> */}
                    
                    {/* <div className="flex items-center justify-between w-full px-4 py-2 rounded-md bg-black/20">
                      <span className="text-sm font-medium">Notificações do Site</span>
                      <Switch
                        checked={notificationsEnabled}
                        onCheckedChange={handleToggleNotifications}
                        disabled={loading}
                      />
                    </div> */}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 w-full max-w-sm mx-auto p-4 rounded-xl -blur-sm">
                    <div className="text-center space-y-0.5 mb-2">
                      <h3 className="text-base font-bold">Bem-vindo(a)!</h3>
                      <p className="text-xs text-muted-foreground">Acesse sua conta para interagir</p>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <Button asChild variant="secondary" className="w-full h-10 bg-white text-black hover:bg-gray-100 font-semibold border-0 transition-all hover:translate-y-[-1px] shadow-sm text-sm">
                        <Link to="/login" className="flex items-center justify-center gap-2">
                          <LucideIcons.LogIn className="w-4 h-4" />
                          <span>Entrar</span>
                        </Link>
                      </Button>
                      
                      <Button asChild className="w-full h-10 font-bold shadow-lg transition-all hover:translate-y-[-1px] hover:shadow-xl text-sm">
                        <Link to="/cadastro" className="flex items-center justify-center gap-2">
                          <LucideIcons.UserPlus className="w-4 h-4" />
                          <span>Criar Conta</span>
                        </Link>
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <nav className="flex flex-col items-center justify-start flex-grow gap-4 text-center w-full">
                {visibleMenuItems.map(item => (
                  <NavLink 
                    key={item.path} 
                    to={item.path} 
                    className={({ isActive }) => 
                      `w-full max-w-sm py-3 px-4 rounded-xl text-xl font-medium transition-all duration-300 flex items-center justify-center gap-3 ${
                        isActive 
                          ? 'bg-white/10 text-white font-bold shadow-inner' 
                          : 'text-white/80 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    {/* Optional: Add icons mapping based on item.name if available, or just text */}
                    {item.name}
                  </NavLink>
                ))}
              </nav>

              {user && (
                <div className="mt-8 w-full">
                  <Button onClick={signOut} variant="destructive" className="w-full">Sair</Button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;