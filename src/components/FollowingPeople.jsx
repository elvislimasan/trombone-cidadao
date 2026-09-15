import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from 'react-nice-avatar';
import { Loader2, Search, Users, X } from 'lucide-react';
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

export default function FollowingPeople() {
  const { activeCityId } = useCity();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [profileSearch, setProfileSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const { data, error } = await supabase.rpc('get_following_activity', { p_limit: 40, p_offset: offset });
      if (error) throw error;
      const next = Array.isArray(data?.items) ? data.items : [];
      setItems(current => [...new Map([...current, ...next].map(item => [item.id, item])).values()]);
      setOffset(current => current + next.length);
      setTotal(next.length ? Number(data?.total || 0) : offset);
    } catch (err) { showAppError({ title: 'Não foi possível carregar mais publicações', description: err.message }); }
    finally { setLoadingMore(false); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
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
      setOffset(activityResult.data?.items?.length || 0);
    } catch (err) {
      setError(true);
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

  useEffect(() => {
    const term = profileSearch.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      const safeTerm = term.replace(/[%_]/g, '\\$&');
      const { data, error: searchError } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_type, avatar_url, avatar_config, city_id, public_profile_enabled, public_searchable')
        .eq('public_profile_enabled', true)
        .eq('public_searchable', true)
        .or(`name.ilike.%${safeTerm}%,username.ilike.%${safeTerm}%`)
        .neq('id', (await supabase.auth.getUser()).data.user?.id || '')
        .order('name')
        .limit(12);

      if (!active) return;
      setSearchResults(searchError ? [] : (data || []));
      setSearchLoading(false);
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [profileSearch]);

  const visibleProfiles = profileSearch.trim().length >= 2 ? searchResults : profiles;
  const showSearchResults = profileSearch.trim().length >= 2;

  return (
    <div className="space-y-5">
        {loading ? (
          <div className="flex min-h-[45vh] flex-col items-center justify-center text-content-secondary">
            <Loader2 className="mb-3 h-7 w-7 animate-spin text-brand" />
            <p className="text-sm">Carregando novidades...</p>
          </div>
        ) : error ? (<div role="alert" className="rounded-2xl border border-edge-subtle p-5"><p className="text-sm text-content-secondary">Não foi possível carregar os perfis e suas publicações.</p><Button variant="outline" className="mt-3" onClick={load}>Tentar novamente</Button></div>) : profiles.length === 0 ? (
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
                <h2 className="flex items-center gap-2 text-sm font-extrabold text-content-primary"><Users className="h-4 w-4 text-brand" />{showSearchResults ? 'Pesquisar perfis' : 'Perfis seguidos'}</h2>
                {!showSearchResults && <span className="text-xs font-semibold tabular-nums text-content-secondary">{profiles.length}</span>}
              </div>
              <label className="mb-3 flex min-w-0 items-center gap-2 rounded-xl border border-edge-subtle bg-surface-base px-3 py-2.5 focus-within:border-brand/50">
                <Search className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
                <input value={profileSearch} onChange={(event) => setProfileSearch(event.target.value)} placeholder="Pesquisar perfis por nome ou @usuário" className="min-w-0 flex-1 bg-transparent text-sm text-content-primary outline-none placeholder:text-content-tertiary" aria-label="Pesquisar perfis por nome ou usuário" />
                {profileSearch && <button type="button" onClick={() => setProfileSearch('')} className="shrink-0 text-content-tertiary hover:text-content-primary" aria-label="Limpar pesquisa"><X className="h-4 w-4" /></button>}
              </label>
              {searchLoading ? <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div> : showSearchResults && searchResults.length === 0 ? <p className="py-3 text-center text-xs text-content-secondary">Nenhum perfil público encontrado.</p> : <div className="flex gap-4 overflow-x-auto pb-1">
                {visibleProfiles.map((profile) => (
                  <Link key={profile.id} to={`/${profile.username}`} className="flex w-20 shrink-0 flex-col items-center gap-1.5 text-center">
                    <span className="rounded-full border-2 border-brand p-0.5"><ProfileAvatar profile={profile} /></span>
                    <span className="w-full truncate text-xs font-bold text-content-primary">{profile.name}</span>
                    <span className="w-full truncate text-xs text-content-tertiary">@{profile.username}</span>
                  </Link>
                ))}
              </div>}
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
                  <Link to={`/${item.author.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-subtleHover">
                    <ProfileAvatar profile={item.author} className="h-10 w-10" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-content-primary">{item.author.name}</p><p className="truncate text-xs text-content-secondary">@{item.author.username}</p></div>
                    <TimeAgo date={item.created_at} className="shrink-0 text-xs text-content-tertiary" />
                  </Link>
                  <Link to={`/bronca/${item.id}`} className="block border-t border-edge-subtle p-4 hover:bg-surface-subtleHover">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-2"><StatusBadge status={item.status} withIcon size="sm" />{item.category_name && <span className="truncate text-xs text-content-tertiary">{item.category_name}</span>}</div>
                        <h3 className="line-clamp-2 text-sm font-extrabold leading-snug text-content-primary sm:text-base">{item.title}</h3>
                        {item.address && <p className="flex items-center gap-1 truncate text-xs text-content-secondary"><Icon name="location" size={12} className="shrink-0 text-brand" />{item.address}</p>}
                      </div>
                      {item.media?.[0]?.url && <img src={item.media[0].url} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" loading="lazy" />}
                    </div>
                    <p className="mt-3 flex items-center gap-1 border-t border-edge-subtle pt-2.5 text-xs font-semibold text-brand"><Icon name="support" size={13} />{item.upvotes || 0} apoios</p>
                  </Link>
                </article>
              ))}
            </section>
          </>
        )}

        {!loading && !error && offset < total && <Button variant="outline" className="min-h-11 w-full" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Carregando…' : 'Carregar mais publicações'}</Button>}
        {!loading && !error && <SuggestedProfiles cityId={activeCityId} limit={6} />}
    </div>
  );
}
