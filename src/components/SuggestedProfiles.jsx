import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Avatar from 'react-nice-avatar';
import { ArrowRight, Check, Loader2, RefreshCw, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError } from '@/lib/appError';

function SuggestedAvatar({ profile }) {
  const [failedImage, setFailedImage] = useState(null);
  if ((profile.avatar_type === 'upload' || profile.avatar_type === 'url') && profile.avatar_url && profile.avatar_url !== failedImage) {
    return <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setFailedImage(profile.avatar_url)} />;
  }
  if (profile.avatar_type === 'generated' && profile.avatar_config) {
    let config = profile.avatar_config;
    if (typeof config === 'string') {
      try { config = JSON.parse(config); } catch { config = {}; }
    }
    return <Avatar className="h-full w-full" {...config} />;
  }
  return <span className="flex h-full w-full items-center justify-center bg-surface-sunken text-sm font-extrabold text-content-secondary">{String(profile.name || 'U').charAt(0).toUpperCase()}</span>;
}

const count = value => Math.max(0, Number(value) || 0).toLocaleString('pt-BR');

export default function SuggestedProfiles({ cityId = null, limit = 5, className = '', variant = 'list', id }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const headingId = useId();
  const discovery = variant === 'discovery';
  const pageSize = Math.min(12, Math.max(1, Math.trunc(Number(limit) || 5)));
  const userId = user?.id || null;
  const scope = JSON.stringify([cityId, pageSize, userId]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const inFlight = useRef(new Set());
  const mounted = useRef(true);
  const [snapshot, setSnapshot] = useState({ scope: null, profiles: [], loading: true, error: null });
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(new Set());
  const [followError, setFollowError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setSnapshot({ scope, profiles: [], loading: true, error: null });
    const load = async () => {
      try {
        const { data, error } = await supabase.rpc('get_suggested_public_profiles', {
          p_city_id: cityId ? Number(cityId) : null,
          p_limit: pageSize,
        });
        if (error) throw error;
        if (active) setSnapshot({ scope, profiles: (Array.isArray(data) ? data : []).filter(profile => profile?.id && profile.username && profile.id !== userId), loading: false, error: null });
      } catch (error) {
        if (active) setSnapshot({ scope, profiles: [], loading: false, error });
      }
    };
    load();
    return () => { active = false; };
  }, [cityId, pageSize, userId, scope, revision]);

  const profiles = snapshot.scope === scope ? snapshot.profiles : [];
  const loading = snapshot.scope !== scope || snapshot.loading;
  const error = snapshot.scope === scope ? snapshot.error : null;
  const busyHere = Array.from(pending).some(key => key.startsWith(`${scope}:`));
  const retry = () => {
    if (Array.from(inFlight.current).some(key => key.startsWith(`${scope}:`))) return;
    setNotice(null); setFollowError(null); setRevision(value => value + 1);
  };

  const follow = async profile => {
    if (!userId) {
      navigate('/login', { state: { from: { pathname: location.pathname, search: location.search, hash: discovery ? '#explore-public-profiles' : location.hash } } });
      return;
    }
    const key = `${scope}:${profile.id}`;
    if (profile.is_following || inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setPending(current => new Set(current).add(key));
    setFollowError(null); setNotice(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('set_public_profile_follow', { p_profile_id: profile.id, p_follow: true });
      if (rpcError) throw rpcError;
      if (!data?.is_following) throw new Error('Não foi possível confirmar o acompanhamento. Tente novamente.');
      if (!mounted.current || currentScope.current !== scope) return;
      setSnapshot(current => current.scope !== scope ? current : {
        ...current,
        profiles: discovery
          ? current.profiles.map(item => item.id === profile.id ? { ...item, is_following: true, followers_count: data.followers_count ?? item.followers_count } : item)
          : current.profiles.filter(item => item.id !== profile.id),
      });
      setNotice({ scope, text: `Você está seguindo ${profile.name || profile.username}. Veja as publicações em Quem acompanho.` });
    } catch (error) {
      if (!mounted.current || currentScope.current !== scope) return;
      setFollowError({ scope, id: profile.id });
      if (!discovery) showAppError({ title: 'Não foi possível seguir este perfil', description: error.message, variant: 'destructive' });
    } finally {
      inFlight.current.delete(key);
      setPending(current => { const next = new Set(current); next.delete(key); return next; });
    }
  };

  if (!discovery && !loading && !error && profiles.length === 0) return null;

  if (discovery) return (
    <section id={id} tabIndex={-1} className={`discovery-profiles ${className}`} aria-labelledby={headingId} data-testid="explore-public-profiles">
      <header className="discovery-profiles-heading">
        <div className="min-w-0"><h2 id={headingId}>Perfis para acompanhar</h2></div>
        <Link to="/seguindo?aba=pessoas" className="discovery-profiles-following">Quem acompanho<ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link>
      </header>
      {loading ? <div role="status"><span className="sr-only">Carregando perfis públicos…</span><div className="discovery-profiles-grid" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index} className="discovery-profile-skeleton animate-pulse motion-reduce:animate-none"><span /><div /><div /></div>)}</div></div>
        : error ? <div className="discovery-profiles-state" role="alert"><Users className="h-7 w-7 text-content-tertiary" aria-hidden="true" /><h3>Não foi possível carregar os perfis</h3><p>Tente novamente para conhecer pessoas da comunidade.</p><button type="button" onClick={retry}><RefreshCw className="h-4 w-4" aria-hidden="true" />Tentar novamente</button></div>
          : profiles.length === 0 ? <div className="discovery-profiles-state"><Users className="h-7 w-7 text-content-tertiary" aria-hidden="true" /><h3>Novos encontros vêm por aí</h3><p>Não há sugestões de perfis públicos neste momento. Você pode rever quem já acompanha.</p><button type="button" onClick={retry}><RefreshCw className="h-4 w-4" aria-hidden="true" />Atualizar sugestões</button></div>
            : <div className="discovery-profiles-grid">
              {profiles.map(profile => {
                const busy = pending.has(`${scope}:${profile.id}`);
                const failed = followError?.scope === scope && followError.id === profile.id;
                return <article key={profile.id} className="discovery-profile-card" data-profile-id={profile.id}>
                  <Link to={`/${profile.username}`} className="discovery-profile-identity" aria-label={`Ver perfil de ${profile.name || profile.username}`}>
                    <span className="discovery-profile-avatar"><SuggestedAvatar profile={profile} /></span>
                    <h3>{profile.name || profile.username}</h3><p className="discovery-profile-username">@{profile.username}</p>
                  </Link>
                  <p className="discovery-profile-bio">{profile.public_bio}</p>
                  <p className="discovery-profile-stats">{count(profile.reports_count)} {Number(profile.reports_count) === 1 ? 'bronca' : 'broncas'} · {count(profile.followers_count)} {Number(profile.followers_count) === 1 ? 'seguidor' : 'seguidores'}</p>
                  <button type="button" className="discovery-follow-button" data-following={Boolean(profile.is_following)} aria-label={`${profile.is_following ? 'Seguindo' : 'Seguir'} ${profile.name || profile.username}`} aria-busy={busy} disabled={busy || profile.is_following} onClick={() => follow(profile)}>
                    {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : profile.is_following ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />}<span>{busy ? 'Seguindo…' : profile.is_following ? 'Seguindo' : 'Seguir'}</span>
                  </button>
                  {failed && <p className="discovery-profile-error" role="alert">Não foi possível seguir. Tente novamente.</p>}
                </article>;
              })}
            </div>}
      <p className="sr-only" role="status">{notice?.scope === scope ? notice.text : ''}</p>
      {!loading && !error && profiles.length > 0 && <button type="button" className="discovery-profiles-refresh" onClick={retry} disabled={busyHere}><RefreshCw className="h-4 w-4" aria-hidden="true" />Atualizar sugestões</button>}
    </section>
  );

  return (
    <section className={`rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm ${className}`} aria-label="Sugestões de perfis para seguir">
      <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-subtleBg text-brand"><Users className="h-4 w-4" /></span><div><h2 className="text-sm font-extrabold text-content-primary">Perfis para acompanhar</h2><p className="text-[10px] text-content-tertiary">Pessoas que movimentam a cidade</p></div></div>
      {loading ? <div className="flex items-center justify-center py-8" role="status" aria-label="Carregando perfis"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>
        : error ? <div role="alert" className="mt-3 text-sm text-content-secondary">Não foi possível carregar os perfis.<button type="button" onClick={retry} className="mt-2 block min-h-12 text-brand">Tentar novamente</button></div>
          : <div className="mt-3 divide-y divide-edge-subtle">{profiles.map(profile => {
            const busy = pending.has(`${scope}:${profile.id}`);
            return <div key={profile.id} className="flex items-center gap-2.5 py-3 first:pt-1 last:pb-0">
              <Link to={`/${profile.username}`} className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-edge-subtle" aria-label={`Ver perfil de ${profile.name || profile.username}`}><SuggestedAvatar profile={profile} /></Link>
              <Link to={`/${profile.username}`} className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold text-content-primary">{profile.name || profile.username}</p><p className="truncate text-[10px] text-content-tertiary">@{profile.username}</p><p className="mt-0.5 text-[9px] text-content-secondary">{count(profile.reports_count)} broncas · {count(profile.followers_count)} seguidores</p></Link>
              <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0 rounded-full" disabled={busy} onClick={() => follow(profile)} aria-label={`Seguir ${profile.name || profile.username}`}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}</Button>
            </div>;
          })}</div>}
    </section>
  );
}
