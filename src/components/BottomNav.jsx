import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, BarChart3, PlusCircle, Star, User } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import ReportModal from '@/components/ReportModal';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Capacitor } from '@capacitor/core';

const BottomNav = () => {
  const location = useLocation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showReportModal, setShowReportModal] = useState(false);

  const isAndroidNative = typeof Capacitor !== 'undefined'
    && Capacitor.isNativePlatform()
    && Capacitor.getPlatform() === 'android';

  // Remove check that hides BottomNav on Android when not logged in
  // if (isAndroidNative && !user) {
  //   return null;
  // }

  const handleNewReportClick = () => {
    if (user) {
      setShowReportModal(true);
    } else {
      toast({
        title: "Acesso restrito",
        description: "Você precisa fazer login para criar uma nova bronca.",
        variant: "destructive",
      });
      navigate('/login');
    }
  };

  const handleCreateReport = async (newReportData, uploadMediaCallback) => {
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
        
        // Rollback: remover a bronca criada se o upload falhar
        await supabase.from('reports').delete().eq('id', data.id);
        
        // Repassar o erro para ser tratado no modal
        throw uploadError;
      }
    }

    toast({ title: "Upload iniciado! 🚀", description: "Você será notificado quando concluir." });
    setShowReportModal(false);
    // Optionally, trigger a global refetch event
    window.dispatchEvent(new CustomEvent('reports-updated'));
  };

  const navItems = [
    { path: '/', icon: Home, label: 'Início' },
    { path: '/estatisticas', icon: BarChart3, label: 'Estatísticas' },
    { path: 'modal', icon: PlusCircle, label: 'Adicionar' },
    { path: '/favoritos', icon: Star, label: 'Favoritos' },
    { path: '/perfil', icon: User, label: 'Perfil' },
  ];

  const navLinkClass = (path) => {
    const isActive = location.pathname === path;
    return `flex flex-col items-center justify-center gap-1 transition-colors duration-200 ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`;
  };

  return (
    <>
      <div 
        className="fixed left-0 right-0 bg-card border-t border-border z-[900] lg:hidden" 
        style={{ 
          bottom: 0,
          paddingBottom: 'var(--safe-area-bottom)',
          height: 'calc(4rem + var(--safe-area-bottom))',
          marginBottom: 0
        }}
      >
        <div className="container mx-auto h-full">
          <div className="flex justify-around items-center h-full">
            {navItems.map((item) => {
              if (item.path === 'modal') {
                return (
                  <button key={item.label} onClick={handleNewReportClick} className="flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-primary -mt-6">
                    <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg">
                      <item.icon size={32} />
                    </div>
                  </button>
                );
              }
              return (
                <NavLink key={item.label} to={item.path} className={navLinkClass(item.path)}>
                  <item.icon size={24} />
                  <span className="text-xs font-medium">{item.label}</span>
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
