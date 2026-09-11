import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { normalizeUsername } from '@/lib/username';

export function usePublicProfile(rawUsername) {
  const username = normalizeUsername(rawUsername);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsTotal, setReportsTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchProfile = useCallback(async () => {
    if (!username) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc('get_public_profile', {
        p_username: username,
      });

      if (rpcError) {
        throw rpcError;
      }

      setProfile(data || null);
    } catch (err) {
      console.error('Erro ao carregar perfil público:', err);
      setError(err.message || 'Não foi possível carregar o perfil público.');
      setProfile(null);
    } finally {
      setLoading(false);
    }
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
  }, [fetchProfile]);

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

  return {
    profile,
    loading,
    error,
    reports,
    reportsLoading,
    reportsTotal,
    statusFilter,
    setStatusFilter: handleStatusFilterChange,
    refetchProfile: fetchProfile,
    refetchReports: () => fetchReports(statusFilter),
    reportProfile,
  };
}

