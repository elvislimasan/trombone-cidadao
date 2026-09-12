import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from 'react-nice-avatar';
import { Bell, ChevronLeft, Loader2, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/design-system/primitives/EmptyState';
import StatusBadge from '@/design-system/primitives/StatusBadge';
import Icon from '@/design-system/icons';
import TimeAgo from '@/components/TimeAgo';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError } from '@/lib/appError';
import { useCity } from '@/contexts/CityContext';
import SuggestedProfiles from '@/components/SuggestedProfiles';

function ProfileAvatar({ profile, className = 'h-12 w-12' }) {
  if ((profile.avatar_type === 'upload' || profile.avatar_type === 'url') && profile.avatar_url) {
    return <img src={profile.avatar_url} alt="" className={`${className} rounded-full object-cover`} />;
  }

  if (profile.avatar_type === 'generated' && profile.avatar_config) {
    let config = profile.avatar_config;
    if (typeof config === 'string') {
      try { config = JSON.parse(config); } catch { config = {}; }
    }
    return <Avatar className={`${className} rounded-full`} {...config} />;
  }

  return (
    <span className={`${className} flex items-center justify-center rounded-full bg-surface-sunken font-bold text-content-secondary`}>
      {(profile.name || 'U').charAt(0).toUpperCase()}
    </span>
  );
}

export default function FollowingActivityPage() {
  const navigate = useNavigate();
  const { activeCityId } = useCity();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesResult, activityResult] = await Promise.all([
        supabase.rpc('get_my_following_profiles'),
        supabase.rpc('get_following_activity', { p_limit: 40, p_offset: 0 }),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (activityResult.error) throw activityResult.error;

      setProfiles(Array.isArray(profilesResult.data) ? profilesResult.data : []);
      setItems(Array.isArray(activityResult.data?.items) ? activityResult.data.items : []);
      setTotal(Number(activityResult.data?.total || 0));
    } catch (err) {
      showAppError({
        title: 'Não foi possível carregar o acompanhamento',
        description: err?.message || 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <main className="min-h-screen bg-surface-base pb-20">
      <Helmet><title>Acompanhando — Trombone Cidadão</title></Helmet>

      <div className="sticky top-0 z-20 border-b border-edge-subtle bg-surface-raised/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center gap-3 px-4">
          <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl" onClick={() => navigate(-1)} aria-label="Voltar">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-extrabold text-content-primary">Acompanhando</h1>
            <p className="text-2xs text-content-secondary">Novidades dos perfis que você segue</p>
          </div>
          <Bell className="h-5 w-5 text-brand" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-5 sm:px-6">
        {loading ? (
          <div className="flex min-h-[45vh] flex-col items-center justify-center text-content-secondary">
            <Loader2 className="mb-3 h-7 w-7 animate-spin text-brand" />
            <p className="text-sm">Carregando novidades...</p>
          </div>
        ) : profiles.length === 0 ? (
          <EmptyState
            icon="profile"
            title="Você ainda não segue ninguém"
            description="Abra o perfil público de uma pessoa e toque em Seguir para acompanhar as broncas que ela publicar."
            action={<Button asChild className="mt-3 bg-brand text-brand-fg hover:bg-brand-hover"><Link to="/feed"><Search className="mr-2 h-4 w-4" />Explorar o feed</Link></Button>}
          />
        ) : (
          <>
            <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-elevation-1">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-content-primary"><Users className="h-4 w-4 text-brand" />Perfis seguidos</h2>
                <span className="text-xs font-semibold tabular-nums text-content-secondary">{profiles.length}</span>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-1">
                {profiles.map((profile) => (
                  <Link key={profile.id} to={`/u/${profile.username}`} className="flex w-20 shrink-0 flex-col items-center gap-1.5 text-center">
                    <span className="rounded-full border-2 border-brand p-0.5"><ProfileAvatar profile={profile} /></span>
                    <span className="w-full truncate text-xs font-bold text-content-primary">{profile.name}</span>
                    <span className="w-full truncate text-2xs text-content-tertiary">@{profile.username}</span>
                  </Link>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3 px-1">
                <div><h2 className="text-base font-extrabold text-content-primary">Publicações recentes</h2><p className="text-xs text-content-secondary">Broncas públicas e aprovadas</p></div>
                <span className="text-xs font-semibold tabular-nums text-content-tertiary">{total}</span>
              </div>

              {items.length === 0 ? (
                <EmptyState icon="trombone" title="Nenhuma novidade ainda" description="As próximas broncas publicadas por quem você segue aparecerão aqui." />
              ) : items.map((item) => (
                <article key={item.id} className="overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-elevation-1">
                  <Link to={`/u/${item.author.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-subtleHover">
                    <ProfileAvatar profile={item.author} className="h-10 w-10" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-content-primary">{item.author.name}</p><p className="truncate text-2xs text-content-secondary">@{item.author.username}</p></div>
                    <TimeAgo date={item.created_at} className="shrink-0 text-2xs text-content-tertiary" />
                  </Link>
                  <Link to={`/bronca/${item.id}`} className="block border-t border-edge-subtle p-4 hover:bg-surface-subtleHover">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2"><StatusBadge status={item.status} withIcon size="sm" />{item.category_name && <span className="truncate text-2xs text-content-tertiary">{item.category_name}</span>}</div>
                        <h3 className="line-clamp-2 text-sm font-extrabold leading-snug text-content-primary sm:text-base">{item.title}</h3>
                        {item.address && <p className="flex items-center gap-1 truncate text-2xs text-content-secondary"><Icon name="location" size={12} className="shrink-0 text-brand" />{item.address}</p>}
                      </div>
                      {item.media?.[0]?.url && <img src={item.media[0].url} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" loading="lazy" />}
                    </div>
                    <p className="mt-3 flex items-center gap-1 border-t border-edge-subtle pt-2.5 text-2xs font-semibold text-brand"><Icon name="support" size={13} />{item.upvotes || 0} apoios</p>
                  </Link>
                </article>
              ))}
            </section>
          </>
        )}

        {!loading && <SuggestedProfiles cityId={activeCityId} limit={6} />}
      </div>
    </main>
  );
}
