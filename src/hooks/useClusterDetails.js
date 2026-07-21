import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export function useClusterDetails() {
  const [loading, setLoading] = useState(false);

  const fetchDetails = useCallback(async (ids) => {
    if (!ids || ids.length === 0) return [];
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reports')
        .select(`
          id, title, description, status, created_at,
          category_id, location,
          category:categories(name),
          upvotes:signatures(count),
          report_media(url, type)
        `)
        .in('id', ids);
      if (error) throw error;
      return (data || [])
        .filter(r => r.location)
        .map(r => ({
          ...r,
          location: { lat: r.location.coordinates[1], lng: r.location.coordinates[0] },
          category: r.category_id,
          categoryName: r.category?.name || r.category_id,
          coverImage: (r.report_media || []).find(m => m.type === 'photo')?.url || null,
          upvotes: Number(r.upvotes?.[0]?.count ?? 0),
        }));
    } catch (err) {
      console.error('[useClusterDetails] fetch error:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchDetails, loading };
}
