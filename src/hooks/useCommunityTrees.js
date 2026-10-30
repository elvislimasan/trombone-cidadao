import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { communityApiError, communityRpc, hydrateCommunityPhotos } from '@/lib/communityTrees';

export function useCommunityTreeList({ cityId, mode = 'public', status = null, page = 0, enabled = true, identity }) {
  const scope = JSON.stringify([cityId, mode, status, page, enabled, identity]);
  const [state, setState] = useState({ rows: [], loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setState({ scope, rows: [], loading: enabled, error: '' });
    if (!enabled) return;
    communityRpc(supabase, 'list_community_trees', { p_city: cityId || null, p_mode: mode, p_status: status, p_limit: 24, p_offset: page * 24 })
      .then(rows => hydrateCommunityPhotos(supabase, rows || []))
      .then(rows => { if (active) setState({ scope, rows, loading: false, error: '' }); })
      .catch(error => { if (active) setState({ scope, rows: [], loading: false, error: communityApiError(error) }); });
    return () => { active = false; };
  }, [cityId, mode, status, page, enabled, identity, revision]);
  return { ...(state.scope === scope ? state : { rows: [], loading: enabled, error: '' }), refresh };
}

export function useCommunityTree(id, identity) {
  const scope = JSON.stringify([id, identity]);
  const [state, setState] = useState({ tree: null, care: [], loading: true, error: '', more: false });
  const [revision, setRevision] = useState(0), [limit, setLimit] = useState(30);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => { setLimit(30); }, [id]);
  useEffect(() => {
    let active = true;
    setState(current => ({ ...current, scope, tree: null, care: [], loading: true, error: '' }));
    (async () => {
      const tree = await communityRpc(supabase, 'get_community_tree', { p_id: id });
      if (!tree) { if (active) setState({ scope, tree: null, care: [], loading: false, error: '', more: false }); return; }
      const care = [];
      for (let offset = 0; offset < limit; offset += 100) {
        const batch = await communityRpc(supabase, 'list_community_tree_care', { p_tree: id, p_limit: Math.min(100, limit - offset), p_offset: offset });
        care.push(...(batch || []));
        if (!batch || batch.length < Math.min(100, limit - offset)) break;
      }
      const [withPhoto, ...entries] = await hydrateCommunityPhotos(supabase, [tree, ...care]);
      if (active) setState({ scope, tree: withPhoto, care: entries, loading: false, error: '', more: limit < Number(tree.care_count) });
    })().catch(error => { if (active) setState({ scope, tree: null, care: [], loading: false, error: communityApiError(error), more: false }); });
    return () => { active = false; };
  }, [id, identity, revision, limit]);
  return { ...(state.scope === scope ? state : { tree: null, care: [], loading: true, error: '', more: false }), refresh, loadMore: () => setLimit(current => current + 30) };
}
