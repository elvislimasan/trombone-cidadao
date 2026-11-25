import { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { legislativeRpc } from '@/lib/legislative';

export default function useLegislativeData(cityId, view = 'overview', filters = {}, revision = 0) {
  const key = JSON.stringify([cityId, view, filters, revision]);
  const [state, setState] = useState({ key: '', loading: true, data: null, error: null });
  useEffect(() => {
    let active = true;
    if (!Number.isSafeInteger(Number(cityId)) || Number(cityId) <= 0) { setState({ key, loading: false, data: { state: 'unconfigured' }, error: null });return; }
    setState({ key, loading: true, data: null, error: null });
    const [, queryView, queryFilters] = JSON.parse(key);
    const request = ['attendance_summary', 'profile_highlights'].includes(queryView)
      ? legislativeRpc(supabase, queryView === 'attendance_summary' ? 'legislative_attendance' : 'legislative_profile_highlights', { p_city: Number(cityId), p_start: queryFilters.start, p_end: queryFilters.end, p_person: queryFilters.parliamentarian_id || null, p_councilor: queryFilters.councilor_id || null })
      : queryView === 'parliamentarian_activity'
      ? legislativeRpc(supabase, 'legislative_parliamentarian_activity', { p_city: Number(cityId), p_person: queryFilters.parliamentarian_id, p_start: queryFilters.start, p_end: queryFilters.end })
      : queryView === 'activity'
      ? legislativeRpc(supabase, 'legislative_activity', { p_city: Number(cityId), p_councilor: queryFilters.councilor_id, p_start: queryFilters.start, p_end: queryFilters.end })
      : legislativeRpc(supabase, 'legislative_public', { p_city: Number(cityId), p_view: queryView, p_filters: queryFilters });
    request
      .then(data => { if (active) setState({ key, loading: false, data, error: null }); })
      .catch(error => { if (active) setState({ key, loading: false, data: null, error }); });
    return () => { active = false; };
  }, [key]);
  return state.key === key ? state : { loading: true, data: null, error: null };
}
