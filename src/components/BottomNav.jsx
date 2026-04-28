import React, { useCallback, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Map, PlusCircle, BarChart3, User } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import ReportModal from '@/components/ReportModal';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import confetti from 'canvas-confetti';

const STORAGE_KEYS = {
  reportsSubmitted: 'tc_reports_submitted_count',
};

const readInt = (value, fallback = 0) => {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.trunc(n);
  return fallback;
};

const NAV_ITEMS = [
  { path: '/', icon: Home, label: 'Feed' },
  { path: '/mapa', icon: Map, label: 'Mapa' },
  { path: 'modal', icon: PlusCircle, label: 'Reportar' },
  { path: '/estatisticas', icon: BarChart3, label: 'Estatísticas' },
  { path: '/perfil', icon: User, label: 'Perfil' },
];

const BottomNav = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [showReportModal, setShowReportModal] = useState(false);

  const triggerHaptic = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch {}
    }
  }, []);

  const handleNewReportClick = useCallback(() => {
    triggerHaptic();
    setShowReportModal(true);
  }, [triggerHaptic]);

  const handleCreateReport = useCallback(
    async (newReportData, uploadMediaCallback) => {
      if (!user) return;

      const {
        title, description, category, address, location,
        pole_number, pole_id, reported_pole_distance_m,
        issue_type, reported_post_identifier, reported_plate,
        is_from_water_utility,
        is_anonymous,
      } = newReportData;

      const normPole = (raw) =>
        String(raw || '').trim().replace(/^\s*\d+\s*[-–—]\s*/u, '').trim();
      const normalizedPole = normPole(pole_number);

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
          pole_id: category === 'iluminacao' ? pole_id : null,
          reported_post_identifier:
            category === 'iluminacao'
              ? normPole(reported_post_identifier) || normalizedPole || null
              : null,
          reported_plate:
            category === 'iluminacao'
              ? normPole(reported_plate) || normalizedPole || null
              : null,
          reported_pole_distance_m:
            category === 'iluminacao' ? reported_pole_distance_m : null,
          issue_type:
            category === 'iluminacao' ? (issue_type?.trim() || null) : null,
          is_from_water_utility:
            category === 'buracos' ? !!is_from_water_utility : null,
          is_anonymous: !!is_anonymous,
          status: 'pending',
          moderation_status: user?.is_admin ? 'approved' : 'pending_approval',
        })
        .select('id')
        .single();

      if (error) {
        toast({ title: 'Erro ao criar bronca', description: error.message, variant: 'destructive' });
        return;
      }

      if (uploadMediaCallback) {
        try {
          await uploadMediaCallback(data.id);
        } catch (uploadError) {
          await supabase.from('reports').delete().eq('id', data.id);
          throw uploadError;
        }
      }

      let nextSubmitted = 1;
      try {
        const current = readInt(localStorage.getItem(STORAGE_KEYS.reportsSubmitted), 0);
        nextSubmitted = current + 1;
        localStorage.setItem(STORAGE_KEYS.reportsSubmitted, String(nextSubmitted));
      } catch {}

      if (Capacitor.isNativePlatform()) {
        try {
          await Haptics.impact({ style: ImpactStyle.Medium });
        } catch {}
      }
      try {
        confetti({
          particleCount: 90,
          spread: 60,
          origin: { y: 0.25 },
          colors: ['#EF4444', '#F59E0B', '#10B981', '#3B82F6'],
        });
      } catch {}

      toast({
        title: 'Você acabou de ajudar sua cidade 🔥',
        description: `Bronca enviada. Total: ${nextSubmitted}`,
        duration: 4500,
      });
      setShowReportModal(false);
      window.dispatchEvent(new CustomEvent('reports-updated', { detail: { id: data.id } }));
    },
    [user, toast]
  );

  const navLinkClass = useCallback(
    (path) => {
      const isActive =
        path === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(path);
      return `flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
        isActive
          ? 'text-primary scale-105 font-bold'
          : 'text-muted-foreground hover:text-foreground'
      }`;
    },
    [location.pathname]
  );

  return (
    <>
      <div
        className="fixed left-0 right-0 bg-white border-t border-border z-[1000] lg:hidden"
        style={{
          bottom: 0,
          paddingBottom: 'max(env(safe-area-inset-bottom), 0px)',
          minHeight: '4.5rem',
          marginBottom: 0,
        }}
      >
        <div className="container mx-auto h-16">
          <div className="grid grid-cols-5 items-center h-full">
            {NAV_ITEMS.map((item) => {
              // Centre FAB
              if (item.path === 'modal') {
                return (
                  <button
                    key="modal"
                    onClick={handleNewReportClick}
                    className="justify-self-center flex flex-col items-center justify-center gap-1 -mt-8"
                    aria-label="Reportar nova bronca"
                  >
                    <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-xl ring-4 ring-background">
                      <PlusCircle size={32} />
                    </div>
                  </button>
                );
              }

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={triggerHaptic}
                  className={`${navLinkClass(item.path)} justify-self-center`}
                  aria-label={item.label}
                >
                  <item.icon size={22} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>

      {showReportModal && (
        <ReportModal
          onClose={() => setShowReportModal(false)}
          onSubmit={handleCreateReport}
        />
      )}
    </>
  );
};

export default BottomNav;
