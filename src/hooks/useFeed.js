import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const PAGE_SIZE = 10;

const CATEGORY_EMOJIS = {
  iluminacao: '💡',
  buracos: '🕳️',
  esgoto: '🚰',
  limpeza: '🧹',
  poda: '🌳',
  'vazamento-de-agua': '💧',
  outros: '📍',
};

export function useFeed(tab = 'recent') {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(0);
  const cancelRef = useRef(false);

  const buildPage = useCallback(
    async (page) => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from('reports')
        .select(
          `
          id, title, description, status, created_at, address,
          category_id, is_recurrent, author_id, views, is_anonymous,
          category:categories(name, icon),
          upvotes:signatures(count),
          comments_count:comments(count),
          report_media(url, type),
          author:profiles!author_id(name, avatar_url)
        `
        )
        .eq('moderation_status', 'approved')
        .neq('status', 'duplicate')
        .range(from, to);

      if (tab === 'resolved') {
        q = q.eq('status', 'resolved').order('created_at', { ascending: false });
      } else if (tab === 'trending') {
        q = q
          .in('status', ['pending', 'in-progress'])
          .order('views', { ascending: false })
          .order('created_at', { ascending: false });
      } else {
        // recent: all active broncas
        q = q
          .in('status', ['pending', 'in-progress'])
          .order('created_at', { ascending: false });
      }

      const { data, error } = await q;
      if (error) throw error;

      const items = data || [];
      const ids = items.map((r) => r.id);
      let upvoted = new Set();
      let favorites = new Set();

      if (user && ids.length > 0) {
        const [uRes, fRes] = await Promise.all([
          supabase
            .from('signatures')
            .select('report_id')
            .eq('user_id', user.id)
            .in('report_id', ids),
          supabase
            .from('favorite_reports')
            .select('report_id')
            .eq('user_id', user.id)
            .in('report_id', ids),
        ]);
        upvoted = new Set((uRes.data || []).map((r) => r.report_id));
        favorites = new Set((fRes.data || []).map((r) => r.report_id));
      }

      return items.map((r) => {
        const catName = r.category?.name || r.category_id || '';
        const isAnonymous = Boolean(r.is_anonymous);
        return {
          id: r.id,
          title: r.title,
          description: r.description,
          status: r.status,
          created_at: r.created_at,
          address: r.address,
          category_id: r.category_id,
          is_recurrent: r.is_recurrent,
          views: Number(r.views ?? 0),
          is_anonymous: isAnonymous,
          categoryName: catName,
          categoryIcon: r.category?.icon || '',
          categoryEmoji: CATEGORY_EMOJIS[catName] || '📍',
          coverImage:
            (r.report_media || []).find((m) => m.type === 'photo')?.url || null,
          upvotes: Number(r.upvotes?.[0]?.count ?? 0),
          comments_count: Number(r.comments_count?.[0]?.count ?? 0),
          user_has_upvoted: upvoted.has(r.id),
          is_favorited: favorites.has(r.id),
          authorName: isAnonymous ? 'Anônimo' : r.author?.name || 'Cidadão',
          authorAvatar: isAnonymous ? null : r.author?.avatar_url || null,
        };
      });
    },
    [tab, user]
  );

  const loadInitial = useCallback(() => {
    cancelRef.current = false;
    setLoading(true);
    setReports([]);
    setHasMore(true);
    pageRef.current = 0;

    buildPage(0)
      .then((items) => {
        if (cancelRef.current) return;
        const sorted =
          tab === 'trending'
            ? [...items].sort((a, b) => {
                const aScore = a.views || 0;
                const bScore = b.views || 0;
                if (bScore !== aScore) return bScore - aScore;
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              })
            : items;
        setReports(sorted);
        setHasMore(items.length === PAGE_SIZE);
        pageRef.current = 1;
      })
      .catch((err) => {
        if (!cancelRef.current) console.error('[useFeed] fetch error:', err);
      })
      .finally(() => {
        if (!cancelRef.current) setLoading(false);
      });
  }, [buildPage]);

  // Reload when tab or user changes
  useEffect(() => {
    cancelRef.current = false;
    loadInitial();
    return () => {
      cancelRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user?.id]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    buildPage(pageRef.current)
      .then((items) => {
        if (cancelRef.current) return;
        const next =
          tab === 'trending'
            ? [...items].sort((a, b) => {
                const aScore = a.views || 0;
                const bScore = b.views || 0;
                if (bScore !== aScore) return bScore - aScore;
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              })
            : items;
        setReports((prev) => [...prev, ...next]);
        setHasMore(items.length === PAGE_SIZE);
        pageRef.current += 1;
      })
      .catch((err) => {
        if (!cancelRef.current) console.error('[useFeed] loadMore error:', err);
      })
      .finally(() => {
        if (!cancelRef.current) setLoadingMore(false);
      });
  }, [buildPage, loadingMore, hasMore]);

  const toggleUpvote = useCallback(
    async (reportId) => {
      if (!user) return;

      let wasUpvoted = false;
      setReports((prev) =>
        prev.map((r) => {
          if (r.id !== reportId) return r;
          wasUpvoted = r.user_has_upvoted;
          return {
            ...r,
            user_has_upvoted: !wasUpvoted,
            upvotes: wasUpvoted
              ? Math.max(0, r.upvotes - 1)
              : r.upvotes + 1,
          };
        })
      );

      try {
        if (wasUpvoted) {
          await supabase
            .from('signatures')
            .delete()
            .eq('user_id', user.id)
            .eq('report_id', reportId);
        } else {
          await supabase.from('signatures').upsert(
            { user_id: user.id, report_id: reportId },
            { onConflict: 'user_id,report_id' }
          );
        }
      } catch {
        // Revert optimistic update
        setReports((prev) =>
          prev.map((r) =>
            r.id === reportId
              ? {
                  ...r,
                  user_has_upvoted: wasUpvoted,
                  upvotes: wasUpvoted
                    ? r.upvotes + 1
                    : Math.max(0, r.upvotes - 1),
                }
              : r
          )
        );
      }
    },
    [user]
  );

  return {
    reports,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refresh: loadInitial,
    toggleUpvote,
  };
}
