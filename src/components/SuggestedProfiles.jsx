import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Avatar from 'react-nice-avatar';
import { Loader2, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError } from '@/lib/appError';

function SuggestedAvatar({ profile }) {
  if ((profile.avatar_type === 'upload' || profile.avatar_type === 'url') && profile.avatar_url) {
    return <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />;
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

export default function SuggestedProfiles({ cityId = null, limit = 5, className = '' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followingId, setFollowingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_suggested_public_profiles', {
      p_city_id: cityId ? Number(cityId) : null,
      p_limit: limit,
    });
    if (error) {
      console.error('Erro ao carregar sugestões de perfis:', error);
      setProfiles([]);
    } else {
      setProfiles(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }, [cityId, limit]);

  useEffect(() => { load(); }, [load]);

  const follow = async (profile) => {
    if (!user) {
      navigate('/login', { state: { from: location } });
      return;
    }
    setFollowingId(profile.id);
    const { error } = await supabase.rpc('set_public_profile_follow', { p_profile_id: profile.id, p_follow: true });
    if (error) {
      showAppError({ title: 'Não foi possível seguir este perfil', description: error.message, variant: 'destructive' });
    } else {
      setProfiles((current) => current.filter((item) => item.id !== profile.id));
    }
    setFollowingId(null);
  };

  if (!loading && profiles.length === 0) return null;

  return (
    <section className={`rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm ${className}`} aria-label="Sugestões de perfis para seguir">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-subtleBg text-brand"><Users className="h-4 w-4" /></span>
        <div><h2 className="text-sm font-extrabold text-content-primary">Perfis para acompanhar</h2><p className="text-[10px] text-content-tertiary">Pessoas que movimentam a cidade</p></div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>
      ) : (
        <div className="mt-3 divide-y divide-edge-subtle">
          {profiles.map((profile) => (
            <div key={profile.id} className="flex items-center gap-2.5 py-3 first:pt-1 last:pb-0">
              <Link to={`/u/${profile.username}`} className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-edge-subtle"><SuggestedAvatar profile={profile} /></Link>
              <Link to={`/u/${profile.username}`} className="min-w-0 flex-1">
                <p className="truncate text-xs font-extrabold text-content-primary">{profile.name}</p>
                <p className="truncate text-[10px] text-content-tertiary">@{profile.username}{profile.city_name ? ` · ${profile.city_name}` : ''}</p>
                <p className="mt-0.5 text-[9px] text-content-secondary">{profile.reports_count || 0} broncas · {profile.followers_count || 0} seguidores</p>
              </Link>
              <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0 rounded-full" disabled={followingId === profile.id} onClick={() => follow(profile)} aria-label={`Seguir ${profile.name}`}>
                {followingId === profile.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
