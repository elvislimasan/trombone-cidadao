import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import {
  Share2,
  MoreVertical,
  Calendar,
  ExternalLink,
  ShieldCheck,
  Flag,
  ChevronLeft,
  Copy,
  Check,
  Loader2,
  Sparkles,
  Landmark,
  UserPlus,
  UserCheck,
  Users,
  MapPin,
  Edit,
} from 'lucide-react';
import Avatar from 'react-nice-avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  FormDialogContent,
  FormDialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import StatusBadge from '@/design-system/primitives/StatusBadge';
import EmptyState from '@/design-system/primitives/EmptyState';
import Icon from '@/design-system/icons';
import TimeAgo from '@/components/TimeAgo';
import { usePublicProfile } from '@/hooks/usePublicProfile';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useCity } from '@/contexts/CityContext';
import { getPublicProfileShareUrl } from '@/lib/shareUtils';
import { PROFILE_TYPE_INFO, normalizeUsername } from '@/lib/username';
import { showAppError } from '@/lib/appError';
import { supabase } from '@/lib/customSupabaseClient';
import { rotaDoVereador } from '@/lib/pavementStreetHistory';

const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function formatMemberSince(createdAt) {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${MONTHS_PT[date.getMonth()]}/${date.getFullYear()}`;
}

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export default function PublicProfilePage() {
  const { username: routeUsername } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { cities } = useCity();
  const cleanUsername = normalizeUsername(routeUsername);

  const {
    profile,
    loading,
    error,
    reports,
    reportsLoading,
    statusFilter,
    setStatusFilter,
    reportProfile,
    followState,
    followLoading,
    setFollowing,
  } = usePublicProfile(cleanUsername);

  const [activeTab, setActiveTab] = useState('reports');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('impersonation');
  const [reportDetails, setReportDetails] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [verifiedCouncilorPages, setVerifiedCouncilorPages] = useState([]);

  const memberSince = useMemo(() => formatMemberSince(profile?.created_at), [profile?.created_at]);
  const safeWebsite = useMemo(() => sanitizeUrl(profile?.public_website), [profile?.public_website]);
  const profileTypeData = PROFILE_TYPE_INFO[profile?.public_profile_type] || PROFILE_TYPE_INFO.citizen;
  const isOwnProfile = currentUser?.id && profile?.id && currentUser.id === profile.id;
  const profileCity = useMemo(
    () => cities.find((city) => String(city.id) === String(profile?.city_id)) || null,
    [cities, profile?.city_id]
  );
  const categoryStats = useMemo(() => {
    const counts = new Map();
    reports.forEach((report) => {
      const name = report.category_name || 'Outras';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [reports]);

  useEffect(() => {
    if (!profile?.id) {
      setVerifiedCouncilorPages([]);
      return;
    }
    let active = true;
    supabase
      .from('councilors')
      .select('id, city_id, name, slug, party, claim_status')
      .eq('user_id', profile.id)
      .eq('claim_status', 'verified')
      .order('name')
      .then(({ data, error: pagesError }) => {
        if (!active) return;
        if (pagesError) {
          console.error('Erro ao carregar atuação pública verificada:', pagesError);
          setVerifiedCouncilorPages([]);
          return;
        }
        setVerifiedCouncilorPages(data || []);
      });
    return () => { active = false; };
  }, [profile?.id]);

  const handleShare = async () => {
    if (!profile) return;
    const shareUrl = getPublicProfileShareUrl(profile.username);
    const shareTitle = `${profile.name} (@${profile.username}) no Trombone Cidadão`;
    const shareText = `Veja as broncas, cobranças e conquistas de ${profile.name} (@${profile.username}) no Trombone Cidadão.`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      showAppError({
        title: 'Não foi possível copiar',
        description: `Copie manualmente: ${shareUrl}`,
      });
    }
  };

  const handleWhatsAppShare = () => {
    if (!profile) return;
    const shareUrl = getPublicProfileShareUrl(profile.username);
    const text = encodeURIComponent(
      `Conheça o perfil de ${profile.name} (@${profile.username}) no Trombone Cidadão: ${shareUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const handleFollow = async () => {
    if (!currentUser) {
      navigate('/login', { state: { from: { pathname: `/${cleanUsername}` } } });
      return;
    }

    try {
      await setFollowing(!followState.is_following);
    } catch (err) {
      showAppError({
        title: 'Não foi possível atualizar',
        description: err?.message || 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmitReport = async () => {
    if (!currentUser) {
      navigate('/login', { state: { from: { pathname: `/${cleanUsername}` } } });
      return;
    }

    setIsSubmittingReport(true);
    try {
      const result = await reportProfile(reportReason, reportDetails);
      if (result?.success) {
        setIsReportModalOpen(false);
        setReportDetails('');
        showAppError({
          title: 'Denúncia recebida',
          description: result.message || 'Sua denúncia será avaliada pela nossa moderação.',
          variant: 'default',
        });
      } else {
        showAppError({
          title: 'Erro ao denunciar',
          description: result?.message || 'Não foi possível registrar a denúncia.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      showAppError({
        title: 'Erro ao denunciar',
        description: err.message || 'Ocorreu um erro ao enviar sua denúncia.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const renderAvatar = () => {
    if (!profile) return <Avatar className="w-full h-full" />;

    if ((profile.avatar_type === 'url' || profile.avatar_type === 'upload') && profile.avatar_url) {
      return (
        <img
          src={profile.avatar_url}
          alt={profile.name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      );
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

    const initial = (profile.name || 'C')[0].toUpperCase();
    return (
      <div className="w-full h-full bg-surface-sunken text-content-secondary flex items-center justify-center text-xl font-bold select-none">
        {initial}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-8 h-8 text-brand animate-spin mb-3" />
        <p className="text-sm text-content-secondary">Carregando perfil público...</p>
      </div>
    );
  }

  if (error || !profile || !profile.public_profile_enabled) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-12">
        <Helmet>
          <title>Perfil não encontrado - Trombone Cidadão</title>
        </Helmet>
        <EmptyState
          icon="profile"
          title="Perfil indisponível ou privado"
          description="Este usuário não ativou o perfil público ou o endereço informado não existe."
          action={
            <div className="flex gap-2 mt-4">
              <Button onClick={() => navigate(-1)} variant="outline">
                Voltar
              </Button>
              <Link to="/">
                <Button className="bg-brand text-brand-fg hover:bg-brand-hover">
                  Ir para o início
                </Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const shareUrl = getPublicProfileShareUrl(profile.username);
  const pageTitle = `${profile.name} (@${profile.username}) | Trombone Cidadão`;
  const pageDesc = profile.public_bio
    ? `${profile.name} (@${profile.username}): ${profile.public_bio}`
    : `Siga ${profile.name} (@${profile.username}) e acompanhe suas broncas e conquistas no Trombone Cidadão.`;

  return (
    <div className="min-h-screen bg-surface-base pb-16">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDesc} />
        <link rel="canonical" href={shareUrl} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDesc} />
        <meta property="og:url" content={shareUrl} />
        <meta property="og:type" content="profile" />
        {profile.avatar_url && <meta property="og:image" content={profile.avatar_url} />}
      </Helmet>

      {/* Barra superior de navegação */}
      <div className="sticky top-0 z-20 bg-surface-raised/90 backdrop-blur-md border-b border-edge-subtle">
        <div className="mx-auto h-14 w-full max-w-[100rem] px-3 sm:px-5 lg:px-6 flex items-center justify-between gap-3">
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-xl bg-surface-subtle hover:bg-surface-subtleHover"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5 text-content-primary" />
          </Button>

          <div className="hidden min-w-0 flex-1 text-center lg:block">
            <h1 className="text-sm font-bold text-content-primary truncate">
              {profile.name}
            </h1>
            <p className="text-2xs font-mono text-content-secondary truncate">
              @{profile.username}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={handleShare}
              className="gap-1.5 rounded-full border-edge-default text-xs font-semibold text-content-primary hover:bg-surface-subtle"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Share2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copiedLink ? 'Copiado!' : 'Compartilhar'}</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-xl hover:bg-surface-subtle"
                  aria-label="Opções do perfil"
                >
                  <MoreVertical className="w-4 h-4 text-content-primary" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleShare} className="gap-2 cursor-pointer">
                  <Copy className="w-4 h-4" />
                  Copiar link do perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleWhatsAppShare} className="gap-2 cursor-pointer">
                  <Share2 className="w-4 h-4" />
                  Compartilhar no WhatsApp
                </DropdownMenuItem>
                {!isOwnProfile && (
                  <DropdownMenuItem
                    onClick={() => setIsReportModalOpen(true)}
                    className="gap-2 text-destructive focus:text-destructive cursor-pointer"
                  >
                    <Flag className="w-4 h-4" />
                    Denunciar perfil
                  </DropdownMenuItem>
                )}
                {isOwnProfile && (
                  <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                    <Link to="/perfil">
                      <Icon name="profile" size={16} />
                      Editar meu perfil
                    </Link>
                  </DropdownMenuItem>
                )}
                {isOwnProfile && (
                  <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                    <Link to="/seguindo?aba=pessoas">
                      <Users className="w-4 h-4" />
                      Acompanhar quem sigo
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[100rem] space-y-6 px-3 pt-5 sm:px-5 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-5 lg:space-y-0 lg:px-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-6">
        {/* Cartão de Cabeçalho do Perfil */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-elevation-1 sm:p-5 lg:flex lg:h-60 lg:items-center lg:p-6"
        >
          <div className="w-full lg:hidden">
            <div className="flex items-start gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-3 border-brand bg-surface-subtle shadow-elevation-1">
                {renderAvatar()}
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="truncate text-lg font-display font-extrabold text-content-primary">{profile.name}</h2>
                  {profile.verification_status === 'verified' && (
                    <ShieldCheck className="h-4 w-4 shrink-0 fill-brand/20 text-brand" aria-label="Perfil verificado" />
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  <span className="truncate font-mono font-semibold text-content-secondary">@{profile.username}</span>
                  {profile.city_name && (
                    <span className="inline-flex items-center gap-1 text-content-secondary">
                      <MapPin className="h-3 w-3 text-brand" />
                      {profile.city_name}
                    </span>
                  )}
                </div>

                {profile.public_bio && (
                  <p className="whitespace-pre-line break-words text-xs leading-relaxed text-content-primary">{profile.public_bio}</p>
                )}

                {memberSince && (
                  <p className="flex items-center gap-1.5 text-[11px] text-content-tertiary">
                    <Calendar className="h-3.5 w-3.5" />
                    Membro desde {memberSince}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 divide-x divide-edge-subtle text-center">
              <div className="px-2">
                <strong className="block text-xl font-black leading-none tabular-nums text-content-primary">{profile.stats?.total_reports || 0}</strong>
                <span className="mt-1 block text-[10px] leading-tight text-content-secondary">publicações</span>
              </div>
              <div className="px-2">
                <strong className="block text-xl font-black leading-none tabular-nums text-content-primary">{followState.followers_count}</strong>
                <span className="mt-1 block text-[10px] leading-tight text-content-secondary">seguidores</span>
              </div>
              <div className="px-2">
                <strong className="block text-xl font-black leading-none tabular-nums text-content-primary">{followState.following_count}</strong>
                <span className="mt-1 block text-[10px] leading-tight text-content-secondary">seguindo</span>
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              {!isOwnProfile && (
                <Button
                  type="button"
                  onClick={handleFollow}
                  disabled={followLoading}
                  variant={followState.is_following ? 'outline' : 'default'}
                  className={followState.is_following
                    ? 'h-10 w-full gap-2 rounded-xl border-brand/40 font-bold text-brand'
                    : 'h-10 w-full gap-2 rounded-xl bg-brand font-bold text-brand-fg hover:bg-brand-hover'}
                >
                  {followLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : followState.is_following ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  {followState.is_following ? 'Seguindo' : 'Seguir'}
                </Button>
              )}
              {isOwnProfile && (
                <Button asChild type="button" className="h-10 w-full gap-2 rounded-xl bg-brand font-bold text-brand-fg hover:bg-brand-hover">
                  <Link to="/perfil"><Edit className="h-4 w-4" /> Editar perfil</Link>
                </Button>
              )}
              {safeWebsite && (
                <Button asChild type="button" variant="outline" className="h-10 w-full gap-2 rounded-xl border-brand/35 font-bold text-brand">
                  <a href={safeWebsite} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Visitar site</a>
                </Button>
              )}
            </div>
          </div>

          <div className="hidden w-full items-center gap-6 lg:flex">
            <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-full border-3 border-brand bg-surface-subtle shadow-elevation-1">
              {renderAvatar()}
            </div>

            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-display font-extrabold text-content-primary truncate">
                  {profile.name}
                </h2>
                {profile.verification_status === 'verified' && (
                  <span
                    title="Perfil Verificado"
                    className="inline-flex items-center text-brand"
                  >
                    <ShieldCheck className="w-5 h-5 fill-brand/20 text-brand" />
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono font-semibold text-content-secondary">
                  @{profile.username}
                </span>
                {profile.verification_status === 'verified' && profile.public_profile_type !== 'citizen' && (
                  <>
                    <span className="text-content-tertiary">·</span>
                    <span className={`px-2 py-0.5 rounded-full border text-2xs font-semibold ${profileTypeData.badgeClass}`}>
                      {profileTypeData.label}
                    </span>
                  </>
                )}
                {profile.city_name && (
                  <>
                    <span className="text-content-tertiary">·</span>
                    <span className="inline-flex items-center gap-1 text-content-secondary">
                      <Icon name="location" size={12} className="text-brand" />
                      {profile.city_name}
                    </span>
                  </>
                )}
              </div>

              {profile.public_bio && (
                <p className="text-sm text-content-primary leading-relaxed pt-1 whitespace-pre-line">
                  {profile.public_bio}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-content-tertiary pt-1">
                {safeWebsite && (
                  <a
                    href={safeWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-brand hover:underline font-medium"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {profile.public_website.replace(/^https?:\/\//i, '')}
                  </a>
                )}
                {memberSince && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Membro desde {memberSince}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-xs text-content-secondary">
                <span><strong className="text-content-primary tabular-nums">{profile.stats?.total_reports || 0}</strong> publicações</span>
                <span><strong className="text-content-primary tabular-nums">{followState.followers_count}</strong> seguidores</span>
                <span><strong className="text-content-primary tabular-nums">{followState.following_count}</strong> seguindo</span>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {!isOwnProfile && (
                  <Button
                    type="button"
                    onClick={handleFollow}
                    disabled={followLoading}
                    variant={followState.is_following ? 'outline' : 'default'}
                    className={followState.is_following
                      ? 'h-9 gap-2 rounded-xl border-edge-default px-5 font-bold'
                      : 'h-9 gap-2 rounded-xl bg-brand px-5 font-bold text-brand-fg hover:bg-brand-hover'}
                  >
                    {followLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : followState.is_following ? (
                      <UserCheck className="h-4 w-4" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    {followState.is_following ? 'Seguindo' : 'Seguir'}
                  </Button>
                )}
                {isOwnProfile && (
                  <Button asChild type="button" variant="outline" className="h-9 gap-2 rounded-xl px-5 font-bold">
                    <Link to="/perfil">Editar perfil</Link>
                  </Button>
                )}
                {isOwnProfile && followState.following_count > 0 && (
                  <Button asChild type="button" variant="outline" className="h-9 gap-2 rounded-xl px-5 font-bold">
                    <Link to="/seguindo?aba=pessoas"><Users className="h-4 w-4" /> Acompanhando</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {verifiedCouncilorPages.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-brand/25 bg-brand-subtleBg p-4 shadow-elevation-1"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-brand"><Landmark className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5"><h2 className="text-sm font-extrabold text-content-primary">Atuação pública verificada</h2><ShieldCheck className="h-4 w-4 text-brand" /></div>
                <p className="mt-0.5 text-xs text-content-secondary">Esta conta foi vinculada pela equipe a uma página legislativa.</p>
                <div className="mt-3 grid gap-2">
                  {verifiedCouncilorPages.map((page) => (
                    <Link key={page.id} to={rotaDoVereador(page.city_id, page.slug)} className="flex items-center justify-between gap-3 rounded-xl bg-surface-raised px-3 py-2.5 text-sm font-bold text-content-primary hover:text-brand">
                      <span className="truncate">{page.name}{page.party ? ` · ${page.party}` : ''}</span>
                      <Icon name="chevronright" size={16} className="shrink-0" />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* Abas Públicas */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-surface-subtle p-1 rounded-xl">
            <TabsTrigger value="reports" className="rounded-lg text-xs font-semibold">
              Broncas ({profile.stats?.total_reports || 0})
            </TabsTrigger>
            <TabsTrigger value="resolved" className="rounded-lg text-xs font-semibold">
              Resolvidas ({profile.stats?.resolved_reports || 0})
            </TabsTrigger>
            <TabsTrigger value="about" className="rounded-lg text-xs font-semibold">
              Sobre
            </TabsTrigger>
          </TabsList>

          {/* Aba: Broncas */}
          <TabsContent value="reports" className="pt-4 space-y-4">
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant={statusFilter === 'all' ? 'default' : 'ghost'}
                  onClick={() => setStatusFilter('all')}
                  className={`h-7 px-3 text-xs rounded-full ${
                    statusFilter === 'all' ? 'bg-brand text-brand-fg' : 'text-content-secondary'
                  }`}
                >
                  Todas
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'in-progress' ? 'default' : 'ghost'}
                  onClick={() => setStatusFilter('in-progress')}
                  className={`h-7 px-3 text-xs rounded-full ${
                    statusFilter === 'in-progress' ? 'bg-brand text-brand-fg' : 'text-content-secondary'
                  }`}
                >
                  Em andamento
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'resolved' ? 'default' : 'ghost'}
                  onClick={() => setStatusFilter('resolved')}
                  className={`h-7 px-3 text-xs rounded-full ${
                    statusFilter === 'resolved' ? 'bg-brand text-brand-fg' : 'text-content-secondary'
                  }`}
                >
                  Resolvidas
                </Button>
              </div>
            </div>

            {reportsLoading ? (
              <div className="py-12 text-center text-content-secondary flex flex-col items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-brand mb-2" />
                <p className="text-xs">Carregando broncas...</p>
              </div>
            ) : reports.length === 0 ? (
              <EmptyState
                icon="trombone"
                title="Nenhuma bronca pública encontrada"
                description={
                  statusFilter === 'all'
                    ? 'Este perfil ainda não possui broncas públicas aprovadas.'
                    : 'Nenhuma bronca encontrada com a situação selecionada.'
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {reports.map((report) => (
                  <Link
                    key={report.id}
                    to={`/bronca/${report.id}`}
                    className="flex h-full flex-col overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-elevation-1 transition hover:-translate-y-0.5 hover:border-edge-default hover:shadow-elevation-2"
                  >
                    <div className="flex flex-col-reverse">
                      <div className="min-w-0 flex-1 space-y-1 p-4">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={report.status} withIcon size="sm" />
                          {report.category_name && (
                            <span className="text-2xs text-content-tertiary truncate">
                              {report.category_name}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-sm sm:text-base text-content-primary leading-snug line-clamp-2">
                          {report.title}
                        </h3>
                        {report.address && (
                          <p className="text-2xs text-content-secondary flex items-center gap-1 line-clamp-1">
                            <Icon name="location" size={11} className="text-brand flex-shrink-0" />
                            {report.address}
                          </p>
                        )}
                      </div>

                      <div className="aspect-[16/9] w-full overflow-hidden bg-surface-sunken">
                        {report.media?.[0]?.url ? (
                          <img
                            src={report.media[0].url}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-gradient-to-br from-brand/10 via-surface-sunken to-brand/5 text-4xl">{report.category_icon || '📣'}</div>
                        )}
                      </div>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-edge-subtle px-4 py-3 text-2xs text-content-tertiary">
                      <div className="flex items-center gap-1 text-brand font-semibold">
                        <Icon name="support" size={13} />
                        <span>{report.upvotes || 0} apoios</span>
                      </div>
                      <TimeAgo date={report.created_at} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Aba: Resolvidas */}
          <TabsContent value="resolved" className="pt-4 space-y-3">
            {reportsLoading ? (
              <div className="py-12 text-center text-content-secondary flex flex-col items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-brand mb-2" />
                <p className="text-xs">Carregando resoluções...</p>
              </div>
            ) : reports.filter((r) => r.status === 'resolved').length === 0 ? (
              <EmptyState
                icon="resolved"
                title="Nenhuma bronca resolvida ainda"
                description="Quando as demandas cobradas por este perfil forem resolvidas, elas aparecerão com destaque aqui."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {reports
                  .filter((r) => r.status === 'resolved')
                  .map((report) => (
                    <Link
                      key={report.id}
                      to={`/bronca/${report.id}`}
                      className="flex h-full flex-col overflow-hidden rounded-2xl border border-status-resolvedBorder/50 bg-surface-raised shadow-elevation-1 transition hover:-translate-y-0.5 hover:border-status-resolvedBorder hover:shadow-elevation-2"
                    >
                      <div className="flex flex-col-reverse">
                        <div className="min-w-0 flex-1 space-y-1.5 p-4">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-status-resolvedBg text-status-resolvedFg border border-status-resolvedBorder text-2xs font-bold uppercase tracking-wider">
                              <Sparkles className="w-3 h-3" />
                              Resolvida
                            </span>
                            {report.category_name && (
                              <span className="text-2xs text-content-tertiary truncate">
                                {report.category_name}
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-sm sm:text-base text-content-primary leading-snug line-clamp-2">
                            {report.title}
                          </h3>
                          {report.address && (
                            <p className="text-2xs text-content-secondary flex items-center gap-1 line-clamp-1">
                              <Icon name="location" size={11} className="text-brand flex-shrink-0" />
                              {report.address}
                            </p>
                          )}
                        </div>

                        <div className="aspect-[16/9] w-full overflow-hidden bg-surface-sunken">
                          {report.media?.[0]?.url ? (
                            <img
                              src={report.media[0].url}
                              alt=""
                              className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center bg-gradient-to-br from-success-bg via-surface-sunken to-brand/5 text-4xl">{report.category_icon || '✅'}</div>
                          )}
                        </div>
                      </div>

                      <div className="mt-auto flex items-center justify-between gap-2 border-t border-edge-subtle px-4 py-3 text-2xs text-content-tertiary">
                        <span className="text-brand font-semibold flex items-center gap-1">
                          <Icon name="support" size={13} />
                          {report.upvotes || 0} pessoas apoiaram
                        </span>
                        {report.resolved_at && (
                          <span>Resolvida em {new Date(report.resolved_at).toLocaleDateString('pt-BR')}</span>
                        )}
                      </div>
                    </Link>
                  ))}
              </div>
            )}
          </TabsContent>

          {/* Aba: Sobre */}
          <TabsContent value="about" className="pt-4">
            <div className="bg-surface-raised rounded-xl border border-edge-subtle p-5 space-y-4 shadow-elevation-1">
              <div>
                <h4 className="text-xs font-semibold text-content-tertiary uppercase tracking-wider mb-1">
                  Biografia
                </h4>
                <p className="text-sm text-content-primary leading-relaxed">
                  {profile.public_bio || 'Nenhuma biografia informada.'}
                </p>
              </div>

              <div className="border-t border-edge-subtle pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-content-tertiary block text-2xs uppercase tracking-wider mb-0.5">
                    Tipo de Perfil
                  </span>
                  <span className="font-semibold text-content-primary">
                    {profileTypeData.label} — {profileTypeData.description}
                  </span>
                </div>

                {profile.city_name && (
                  <div>
                    <span className="text-content-tertiary block text-2xs uppercase tracking-wider mb-0.5">
                      Cidade de Atuação
                    </span>
                    <span className="font-semibold text-content-primary">
                      {profile.city_name}
                    </span>
                  </div>
                )}

                {safeWebsite && (
                  <div>
                    <span className="text-content-tertiary block text-2xs uppercase tracking-wider mb-0.5">
                      Website / Link
                    </span>
                    <a
                      href={safeWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-brand hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {profile.public_website}
                    </a>
                  </div>
                )}

                {memberSince && (
                  <div>
                    <span className="text-content-tertiary block text-2xs uppercase tracking-wider mb-0.5">
                      Participação
                    </span>
                    <span className="font-semibold text-content-primary">
                      Na plataforma desde {memberSince}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        </div>

        <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:block">
          {profileCity && (
            <Link to="/agora" className="block overflow-hidden rounded-2xl border border-edge-subtle bg-surface-sunken shadow-elevation-1">
              <div className="relative h-60">
                {profileCity.civic_thumbnail_url ? (
                  <img src={profileCity.civic_thumbnail_url} alt={`Imagem de ${profileCity.name}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-[radial-gradient(circle_at_70%_30%,rgba(255,171,64,.45),transparent_30%),linear-gradient(135deg,#f8fafc,#fff0df)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
                <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-2 text-white">
                  <span><strong className="block text-sm">{profileCity.name}{profileCity.state?.uf ? ` · ${profileCity.state.uf}` : ''}</strong><small className="text-[10px] text-white/80">Acompanhe sua cidade</small></span>
                  <MapPin className="h-4 w-4" />
                </div>
              </div>
            </Link>
          )}

          <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-elevation-1">
            <h2 className="flex items-center gap-2 text-xs font-extrabold text-content-primary"><Icon name="statistics" size={15} className="text-brand" /> Resumo do impacto</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ['Broncas publicadas', profile.stats?.total_reports || 0, 'text-brand'],
                ['Resolvidas', profile.stats?.resolved_reports || 0, 'text-status-resolvedFg'],
                ['Apoios recebidos', profile.stats?.total_upvotes_received || 0, 'text-brand'],
                ['Cidades mencionadas', profile.stats?.cities_count || (profile.city_name ? 1 : 0), 'text-sky-600'],
              ].map(([label, value, tone]) => (
                <div key={label} className="rounded-xl bg-surface-subtle p-2.5">
                  <strong className={`block text-base font-black tabular-nums ${tone}`}>{value}</strong>
                  <span className="mt-0.5 block text-[9px] leading-3 text-content-tertiary">{label}</span>
                </div>
              ))}
            </div>
          </section>

          {categoryStats.length > 0 && (
            <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-elevation-1">
              <h2 className="text-xs font-extrabold text-content-primary">Categorias mais publicadas</h2>
              <div className="mt-3 space-y-2.5">
                {categoryStats.map(([name, total]) => (
                  <div key={name} className="grid grid-cols-[minmax(0,1fr)_5rem_1rem] items-center gap-2 text-[10px]">
                    <span className="truncate text-content-secondary">{name}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"><span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(18, (total / categoryStats[0][1]) * 100)}%` }} /></span>
                    <strong className="text-right text-content-primary">{total}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-elevation-1">
            <h2 className="text-xs font-extrabold text-content-primary">Sobre este perfil</h2>
            <p className="mt-2 text-[11px] leading-4 text-content-secondary">{profile.public_bio || 'Cidadão que utiliza o Trombone para registrar problemas e contribuir para uma cidade melhor.'}</p>
            {memberSince && <p className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-content-tertiary"><Calendar className="h-3.5 w-3.5" /> Membro desde {memberSince}</p>}
          </section>

          <section className="rounded-2xl border border-brand/20 bg-brand/5 p-4">
            <p className="text-xs font-extrabold text-brand">Juntos por uma cidade melhor</p>
            <p className="mt-1 text-[11px] leading-4 text-content-secondary">Cada bronca publicada ajuda a construir uma cidade mais justa e transparente.</p>
          </section>
        </aside>
      </div>

      {/* Modal de Denúncia de Perfil */}
      <Dialog open={isReportModalOpen} onOpenChange={setIsReportModalOpen}>
        <FormDialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Denunciar perfil</DialogTitle>
            <DialogDescription>
              Relate problemas com este perfil público. Nossa equipe de moderação revisará o caso.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="reason" className="text-xs font-semibold text-foreground">
                Motivo da denúncia
              </Label>
              <select
                id="reason"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground"
              >
                <option value="impersonation">Perfil falso ou fingindo ser órgão/mandato</option>
                <option value="spam">Spam, divulgação abusiva ou propaganda ilegal</option>
                <option value="offensive">Conteúdo ofensivo, assédio ou difamação</option>
                <option value="privacy">Exposição indevida de dados pessoais (doxxing)</option>
                <option value="other">Outro motivo</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="details" className="text-xs font-semibold text-foreground">
                Detalhes adicionais (opcional)
              </Label>
              <Textarea
                id="details"
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder="Explique o que motivou a denúncia..."
                rows={3}
                className="bg-background border-input text-xs resize-none"
              />
            </div>
          </div>

          <FormDialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsReportModalOpen(false)}
              disabled={isSubmittingReport}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitReport}
              disabled={isSubmittingReport}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmittingReport ? 'Enviando...' : 'Enviar denúncia'}
            </Button>
          </FormDialogFooter>
        </FormDialogContent>
      </Dialog>
    </div>
  );
}
