import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { normalizeUsername } from '@/lib/username';
import { fetchPublicDetail } from '@/lib/publicDetailResource';

export function usePublicProfile(rawUsername) {
  const username = normalizeUsername(rawUsername);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadedUsername, setLoadedUsername] = useState(null);
  const profileRequest = useRef(0);

  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsTotal, setReportsTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [followState, setFollowState] = useState({
    followers_count: 0,
    following_count: 0,
    is_following: false,
  });
  const [followLoading, setFollowLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    const request = ++profileRequest.current;
    if (!username) {
      setProfile(null);
      setError(null);
      setLoadedUsername(username);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await fetchPublicDetail(() => supabase.rpc('get_public_profile', {
        p_username: username,
      }));
    if (request !== profileRequest.current) return;
    setProfile(result.data || null);
    setError(result.status === 'error' ? result.error?.message || 'Não foi possível carregar o perfil público.' : null);
    setLoadedUsername(username);
    setLoading(false);
  }, [username]);

  const fetchReports = useCallback(async (status = 'all', limit = 20, offset = 0) => {
    if (!username) return;

    setReportsLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_public_profile_reports', {
        p_username: username,
        p_status: status,
        p_limit: limit,
        p_offset: offset,
      });

      if (rpcError) throw rpcError;

      const items = Array.isArray(data?.reports) ? data.reports : [];
      setReports(items);
      setReportsTotal(Number(data?.total || 0));
    } catch (err) {
      console.error('Erro ao buscar broncas do perfil público:', err);
      setReports([]);
      setReportsTotal(0);
    } finally {
      setReportsLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchProfile();
    return () => { profileRequest.current += 1; };
  }, [fetchProfile]);

  const fetchFollowState = useCallback(async () => {
    if (!profile?.id || !profile?.public_profile_enabled) {
      setFollowState({ followers_count: 0, following_count: 0, is_following: false });
      return;
    }

    const { data, error: rpcError } = await supabase.rpc('get_public_profile_follow_state', {
      p_profile_id: profile.id,
    });

    // A pagina continua utilizavel antes da migration 249 chegar ao ambiente.
    if (rpcError) {
      console.error('Erro ao carregar seguidores do perfil:', rpcError);
      return;
    }

    setFollowState({
      followers_count: Number(data?.followers_count || 0),
      following_count: Number(data?.following_count || 0),
      is_following: Boolean(data?.is_following),
    });
  }, [profile?.id, profile?.public_profile_enabled]);

  useEffect(() => {
    fetchFollowState();
  }, [fetchFollowState]);

  useEffect(() => {
    if (profile && profile.public_profile_enabled) {
      fetchReports(statusFilter);
    }
  }, [profile, statusFilter, fetchReports]);

  const handleStatusFilterChange = useCallback((newStatus) => {
    setStatusFilter(newStatus);
  }, []);

  const reportProfile = useCallback(async (reason, details = '') => {
    if (!profile?.id) throw new Error('Perfil não encontrado.');

    const { data, error: rpcError } = await supabase.rpc('report_public_profile', {
      p_profile_id: profile.id,
      p_reason: reason,
      p_details: details,
    });

    if (rpcError) throw rpcError;
    return data;
  }, [profile?.id]);

  const setFollowing = useCallback(async (shouldFollow) => {
    if (!profile?.id) throw new Error('Perfil não encontrado.');

    setFollowLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('set_public_profile_follow', {
        p_profile_id: profile.id,
        p_follow: Boolean(shouldFollow),
      });
      if (rpcError) throw rpcError;

      const nextState = {
        followers_count: Number(data?.followers_count || 0),
        following_count: Number(data?.following_count || 0),
        is_following: Boolean(data?.is_following),
      };
      setFollowState(nextState);
      return nextState;
    } finally {
      setFollowLoading(false);
    }
  }, [profile?.id]);

  return {
    profile: loadedUsername === username ? profile : null,
    loading: loading || loadedUsername !== username,
    error: loadedUsername === username ? error : null,
    reports,
    reportsLoading,
    reportsTotal,
    statusFilter,
    followState,
    followLoading,
    setStatusFilter: handleStatusFilterChange,
    setFollowing,
    refetchFollowState: fetchFollowState,
    refetchProfile: fetchProfile,
    refetchReports: () => fetchReports(statusFilter),
    reportProfile,
  };
}

