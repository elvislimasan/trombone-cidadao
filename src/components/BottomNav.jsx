import React, { useCallback, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Map, PlusCircle, BarChart3, User } from 'lucide-react';
import Avatar from 'react-nice-avatar';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import ReportModal from '@/components/ReportModal';
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

const throwIfAborted = (signal) => {
  if (!signal?.aborted) return;
  const error = new Error('Envio cancelado.');
  error.name = 'AbortError';
  throw error;
};

const PUBLIC_NAV_ITEMS = [
  { path: '/', icon: Home, label: 'Início' },
  { path: '/mapa', icon: Map, label: 'Mapa' },
  { path: 'modal', icon: PlusCircle, label: 'Reportar' },
  { path: '/estatisticas', icon: BarChart3, label: 'Estatísticas' },
  { path: '/perfil', icon: User, label: 'Perfil' },
];

// Mesma resolucao de avatar do Header/ProfilePage: 'upload' e 'url' apontam
// para uma imagem; 'generated' guarda a config do react-nice-avatar.
const getAvatarComponent = (profile) => {
  if (!profile) return <Avatar className="w-full h-full" />;

  if ((profile.avatar_type === 'url' || profile.avatar_type === 'upload') && profile.avatar_url) {
    return <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />;
  }

  if (profile.avatar_type === 'generated' && profile.avatar_config) {
    let config = profile.avatar_config;
    if (typeof config === 'string') {
      try {
        config = JSON.parse(config);
      } catch {
        config = {};
      }
    }
    return <Avatar className="w-full h-full" {...config} />;
  }

  return <Avatar className="w-full h-full" />;
};

const BottomNav = () => {
  const location = useLocation();
  const { user } = useAuth();
  const [showReportModal, setShowReportModal] = useState(false);
  // A PRIMEIRA ABA É "INÍCIO" PARA TODO MUNDO, INCLUSIVE ADMIN
  //
  // Ela chegou a virar o painel do papel — /admin, /embaixador, /painel-usuario.
  // O efeito era o botão de casa da barra de baixo deixar de levar para casa:
  // quem administra a cidade abre o app dezenas de vezes por dia para ver o que
  // está acontecendo nela, e caía numa central de moderação.
  //
  // O painel continua a um toque, na aba Perfil — ProfilePage tem "Painel
  // Administrativo", "Painel Embaixador" e "Meu Painel", cada um conforme o
  // papel. Trabalho tem entrada própria; a casa é do feed.
  const navItems = PUBLIC_NAV_ITEMS;

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
    async (newReportData, uploadMediaCallback, { signal } = {}) => {
      throwIfAborted(signal);
      if (!user) throw new Error('Sua sessão expirou. Entre novamente para enviar a bronca.');

      const {
        title, description, category, address, location,
        pole_number, pole_id, reported_pole_distance_m,
        issue_type, reported_post_identifier, reported_plate,
        is_from_water_utility,
        is_anonymous,
        city_id,
      } = newReportData;

      const normPole = (raw) =>
        String(raw || '').trim().replace(/^\s*\d+\s*[-–—]\s*/u, '').trim();
      const normalizedPole = normPole(pole_number);

      let insertQuery = supabase
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
          city_id: city_id ?? null,
          status: 'pending',
          moderation_status: user?.is_admin || user?.is_master ? 'approved' : 'pending_approval',
        })
        .select('id')
        .single();

      if (signal && typeof insertQuery.abortSignal === 'function') {
        insertQuery = insertQuery.abortSignal(signal);
      }

      const { data, error } = await insertQuery;

      if (error) {
        throw error;
      }

      try {
        throwIfAborted(signal);
        if (uploadMediaCallback) {
          await uploadMediaCallback(data.id, { signal });
          throwIfAborted(signal);
        }
      } catch (submitError) {
        await supabase.from('reports').delete().eq('id', data.id);
        throw submitError;
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

      setShowReportModal(false);
      window.dispatchEvent(new CustomEvent('reports-updated', { detail: { id: data.id } }));
    },
    [user]
  );

  const navLinkClass = useCallback(
    (path) => {
      const isActive =
        path === '/'
          ? location.pathname === '/' || location.pathname === '/feed'
          : location.pathname.startsWith(path);
      return `flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
        isActive
          ? 'text-brand scale-105 font-bold'
          : 'text-content-tertiary hover:text-content-primary'
      }`;
    },
    [location.pathname]
  );

  return (
    <>
      <div
        className="fixed left-0 right-0 bg-surface-raised border-t border-edge-subtle z-[1000] lg:hidden"
        /* Sem minHeight: a altura vem do conteudo (h-16) mais a safe area. O
           4.5rem antigo deixava meia rem de fundo sobrando abaixo dos itens,
           que aparecia como uma faixa clara acima da barra. */
        style={{
          bottom: 0,
          paddingBottom: 'max(env(safe-area-inset-bottom), 0px)',
          marginBottom: 0,
        }}
      >
        <div className="container mx-auto h-16">
          <div className="grid grid-cols-5 items-center h-full">
            {navItems.map((item) => {
              // Centre FAB
              if (item.path === 'modal') {
                return (
                  <button
                    key="modal"
                    onClick={handleNewReportClick}
                    className="justify-self-center flex flex-col items-center justify-center gap-1 -mt-8"
                    aria-label="Reportar nova bronca"
                  >
                    {/* O anel usa a cor da propria barra para o FAB parecer
                        recortado nela, e nao colado por cima. */}
                    <div className="w-14 h-14 rounded-full bg-brand flex items-center justify-center text-content-onBrand shadow-elevation-3 ring-4 ring-surface-raised active:scale-95 transition-transform">
                      <PlusCircle size={32} />
                    </div>
                  </button>
                );
              }

              // Aba Perfil: mostra a foto do usuario em vez do icone generico,
              // no lugar onde o avatar do header ficava. Deslogado continua com
              // o icone, que e o convite a entrar.
              const isProfile = item.path === '/perfil';
              const showAvatar = isProfile && !!user;

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={triggerHaptic}
                  className={`${navLinkClass(item.path)} justify-self-center`}
                  aria-label={item.label}
                >
                  {showAvatar ? (
                    <span
                      className={`w-[26px] h-[26px] rounded-full overflow-hidden bg-surface-subtle flex items-center justify-center ${
                        location.pathname.startsWith('/perfil')
                          ? 'ring-2 ring-brand'
                          : 'ring-1 ring-edge-subtle'
                      }`}
                    >
                      {getAvatarComponent(user)}
                    </span>
                  ) : (
                    <item.icon size={22} />
                  )}
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
