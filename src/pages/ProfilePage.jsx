import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import Avatar from 'react-nice-avatar';
import {
  Bell,
  Edit,
  ExternalLink,
  FileText,
  Landmark,
  Radar,
  Settings,
  Shield,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import EditProfileModal from '@/components/EditProfileModal';
import UserDashboardPage from '@/pages/UserDashboardPage';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { supabase } from '@/lib/customSupabaseClient';
import { placar } from '@/lib/scoring';
import { normalizarContadoresDeMissao } from '@/lib/missionCounters';
import { showAppError } from '@/lib/appError';
import Icon from '@/design-system/icons';
import SuggestedProfiles from '@/components/SuggestedProfiles';

function ProfileAvatar({ profile }) {
  if ((profile?.avatar_type === 'url' || profile?.avatar_type === 'upload') && profile.avatar_url) {
    return <img src={profile.avatar_url} alt={profile.name || 'Foto de perfil'} className="h-full w-full object-cover" />;
  }

  if (profile?.avatar_type === 'generated' && profile.avatar_config) {
    let config = profile.avatar_config;
    if (typeof config === 'string') {
      try { config = JSON.parse(config); } catch { config = {}; }
    }
    return <Avatar className="h-full w-full" {...config} />;
  }

  return <Avatar className="h-full w-full" />;
}

const ProfilePage = () => {
  const { user, refreshUserProfile } = useAuth();
  const { activeCityId, setActiveCity } = useCity();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [managedCouncilorPages, setManagedCouncilorPages] = useState([]);
  const [followState, setFollowState] = useState({ followers_count: 0, following_count: 0 });
  const [userLevel, setUserLevel] = useState(null);

  const hasPublicProfile = Boolean(user?.username);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    Promise.all([
      supabase
        .from('councilors')
        .select('id, city_id, name, slug, party, claim_status')
        .eq('user_id', user.id)
        .in('claim_status', ['linked', 'verified'])
        .order('name'),
      supabase.rpc('get_mission_counters', { target_user_id: user.id }),
      hasPublicProfile
        ? supabase.rpc('get_public_profile_follow_state', { p_profile_id: user.id })
        : Promise.resolve({ data: null, error: null }),
    ]).then(([councilorsResult, levelResult, followResult]) => {
      if (!active) return;

      if (councilorsResult.error) console.error('Erro ao carregar páginas legislativas:', councilorsResult.error);
      setManagedCouncilorPages(councilorsResult.data || []);

      if (!levelResult.error) {
        const row = Array.isArray(levelResult.data) ? levelResult.data[0] : levelResult.data;
        setUserLevel(row ? placar(normalizarContadoresDeMissao(row)) : null);
      }

      if (!followResult.error && followResult.data) {
        setFollowState({
          followers_count: Number(followResult.data.followers_count || 0),
          following_count: Number(followResult.data.following_count || 0),
        });
      }
    });

    return () => { active = false; };
  }, [hasPublicProfile, user?.id]);

  const handleProfileUpdate = useCallback(async (updatedData) => {
    const cityChanged = String(updatedData.city_id ?? '') !== String(user.city_id ?? '');
    const { error } = await supabase
      .from('profiles')
      .update({
        name: updatedData.name,
        avatar_type: updatedData.avatar_type,
        avatar_url: updatedData.avatar_url,
        avatar_config: updatedData.avatar_config,
        city_id: updatedData.city_id ?? null,
        city: updatedData.city ?? null,
        username: updatedData.username ?? null,
        public_profile_enabled: updatedData.public_profile_enabled ?? false,
        public_bio: updatedData.public_bio ?? null,
        public_website: updatedData.public_website ?? null,
        public_city_visible: updatedData.public_city_visible ?? true,
      })
      .eq('id', user.id);

    if (error) {
      showAppError({ title: 'Erro ao atualizar perfil', description: error.message, variant: 'destructive' });
      return;
    }

    await refreshUserProfile();
    if (cityChanged && updatedData.city_id) setActiveCity(updatedData.city_id);
  }, [refreshUserProfile, setActiveCity, user]);

  const quickLinks = useMemo(() => [
    { to: '/seguindo', label: 'Acompanhando', description: 'Novidades de quem você segue', Icon: Users },
    { to: '/missoes', label: 'Missões', description: 'Participe e veja suas conquistas', Icon: Trophy },
    { to: '/minhas-peticoes', label: 'Petições', description: 'Abaixo-assinados criados', Icon: FileText },
    { to: '/minhas-patrulhas', label: 'Patrulhas', description: 'Histórico de fiscalização', Icon: Radar },
  ], []);

  if (!user) return <div className="flex min-h-[60vh] items-center justify-center">Carregando...</div>;

  return (
    <>
      <Helmet>
        <title>{user.name || 'Meu perfil'} — Trombone Cidadão</title>
        <meta name="description" content="Seu perfil, suas broncas e sua participação na cidade." />
      </Helmet>

      <main className="min-h-screen bg-surface-base pb-20">
        <div className="mx-auto w-full max-w-[112rem] px-3 py-4 sm:px-5 lg:px-8">
          <div className="space-y-5 lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start lg:gap-4 lg:space-y-0">
            <aside className="space-y-5 lg:sticky lg:top-20">
          <motion.section
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-3xl border border-edge-subtle bg-surface-raised shadow-elevation-1"
          >
            <div className="relative bg-gradient-to-br from-brand-subtleBg via-surface-raised to-accentHighlight/30 p-4 sm:p-6 lg:p-4">
              <Button asChild size="icon" variant="outline" className="absolute right-4 top-4 z-10 h-10 w-10 rounded-full bg-surface-raised/90" aria-label="Configurações">
                <Link to="/configuracoes"><Settings className="h-5 w-5" /></Link>
              </Button>

              <div className="flex items-start gap-4 pr-12 sm:items-center sm:gap-6 lg:flex-col lg:items-center lg:gap-3 lg:pr-0 lg:text-center">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-surface-raised bg-surface-subtle shadow-elevation-1 sm:h-28 sm:w-28 lg:h-20 lg:w-20">
                  <ProfileAvatar profile={user} />
                </div>

                <div className="min-w-0 flex-1 lg:w-full">
                  <div className="flex flex-wrap items-center gap-2 lg:justify-center">
                    <h1 className="truncate text-xl font-black text-content-primary sm:text-3xl lg:text-lg">{user.name}</h1>
                    {user.verification_status === 'verified' && <ShieldCheck className="h-5 w-5 shrink-0 text-brand" aria-label="Perfil verificado" />}
                  </div>
                  {user.username && <p className="mt-0.5 truncate font-mono text-xs font-semibold text-content-secondary">@{user.username}</p>}
                  {user.public_bio && <p className="mt-2 line-clamp-3 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-content-primary lg:hidden">{user.public_bio}</p>}

                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-content-secondary lg:justify-center lg:gap-x-3">
                    <span><strong className="text-content-primary tabular-nums">{followState.followers_count}</strong> seguidores</span>
                    <Link to="/seguindo?aba=pessoas" className="hover:text-brand"><strong className="text-content-primary tabular-nums">{followState.following_count}</strong> seguindo</Link>
                    <Link to="/missoes#conquistas" className="inline-flex items-center gap-1 font-bold text-brand hover:underline">
                      <Trophy className="h-3.5 w-3.5" />
                      Minhas conquistas{userLevel ? ` · Nível ${userLevel.level}` : ''}
                    </Link>
                  </div>
                </div>
              </div>

            </div>

            <div className="grid gap-2 border-t border-edge-subtle p-3 sm:grid-cols-2 lg:grid-cols-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditModalOpen(true)} className="h-auto min-h-10 justify-start gap-2 rounded-xl border border-edge-subtle px-3 py-2.5 text-left text-xs font-extrabold text-content-primary hover:bg-surface-subtleHover">
                <Edit className="h-4 w-4 text-brand" />Editar perfil
              </Button>
              {hasPublicProfile ? (
                <Button asChild variant="ghost" size="sm" className="h-auto min-h-10 justify-start gap-2 rounded-xl border border-edge-subtle px-3 py-2.5 text-left text-xs font-extrabold text-content-primary hover:bg-surface-subtleHover">
                  <Link to={`/u/${user.username}`}><ExternalLink className="h-4 w-4 text-brand" />Ver como público</Link>
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditModalOpen(true)} className="h-auto min-h-10 justify-start gap-2 rounded-xl border border-edge-subtle px-3 py-2.5 text-left text-xs font-extrabold text-content-primary hover:bg-surface-subtleHover">
                  <ExternalLink className="h-4 w-4 text-brand" />Criar meu perfil público
                </Button>
              )}
                {managedCouncilorPages.map((page) => (
                  <Link key={page.id} to={`/perfil/pagina-legislativa/${page.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-brand/20 bg-brand-subtleBg px-3 py-2.5 hover:border-brand/40">
                    <span className="flex min-w-0 items-center gap-2"><Landmark className="h-4 w-4 shrink-0 text-brand" /><span className="min-w-0"><span className="block truncate text-xs font-extrabold text-content-primary">Gerenciar página legislativa</span><span className="block truncate text-2xs text-content-secondary">{page.name}{page.party ? ` · ${page.party}` : ''}</span></span></span>
                    <Icon name="chevronright" size={15} />
                  </Link>
                ))}
                {(user.is_admin || user.is_master) && (
                  <Link to="/admin" className="flex items-center justify-between rounded-xl border border-edge-subtle px-3 py-2.5 text-xs font-extrabold text-content-primary hover:bg-surface-subtleHover"><span className="flex items-center gap-2"><Shield className="h-4 w-4 text-brand" />Painel administrativo</span><Icon name="chevronright" size={15} /></Link>
                )}
                {(user.is_ambassador || user.is_master) && (
                  <Link to="/embaixador" className="flex items-center justify-between rounded-xl border border-edge-subtle px-3 py-2.5 text-xs font-extrabold text-content-primary hover:bg-surface-subtleHover"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand" />Área do embaixador</span><Icon name="chevronright" size={15} /></Link>
                )}
            </div>
          </motion.section>

          <section aria-label="Atalhos do perfil">
            <h2 className="mb-2 hidden px-1 text-xs font-extrabold text-content-primary lg:block">Acesso rápido</h2>
            <div className="grid grid-cols-2 gap-2">
              {quickLinks.map(({ to, label, description, Icon: LinkIcon }) => (
                <Link key={to} to={to} className="flex min-w-0 items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-raised p-3 shadow-sm transition hover:border-edge-default hover:bg-surface-subtleHover lg:flex-col lg:items-start lg:gap-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtleBg text-brand"><LinkIcon className="h-5 w-5" /></span>
                  <span className="min-w-0 lg:w-full"><span className="block truncate text-sm font-extrabold text-content-primary lg:whitespace-normal">{label}</span><span className="hidden truncate text-2xs text-content-secondary sm:block lg:whitespace-normal">{description}</span></span>
                </Link>
              ))}
            </div>
          </section>

          <SuggestedProfiles cityId={activeCityId} limit={4} />

            </aside>

            <div className="space-y-4">
          <section className="rounded-3xl border border-edge-subtle bg-surface-raised p-3 shadow-elevation-1 sm:p-5">
            <UserDashboardPage embedded profileMode />
          </section>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-content-secondary">
            <Bell className="h-3.5 w-3.5" />
            <span>Notificações, aparência, segurança e conta ficam em</span>
            <Link to="/configuracoes" className="font-bold text-brand hover:underline">Configurações</Link>
          </div>
            </div>
          </div>
        </div>
      </main>

      {isEditModalOpen && (
        <EditProfileModal user={user} onClose={() => setIsEditModalOpen(false)} onSave={handleProfileUpdate} />
      )}
    </>
  );
};

export default ProfilePage;
