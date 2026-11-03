import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { setCommunityTreeLike } from '@/lib/communityTreeLikes';

const initialState = (tree, scope) => ({ scope, liked: Boolean(tree.liked), count: Number.isSafeInteger(tree.like_count) && tree.like_count >= 0 ? tree.like_count : null, busy: false, error: '' });

export default function useCommunityTreeLike(tree, userId) {
  const scope = `${tree.id}:${userId || 'guest'}`;
  const [state, setState] = useState(() => initialState(tree, scope));
  const operation = useRef(0), busy = useRef(false);
  useEffect(() => {
    operation.current++; busy.current = false; setState(initialState(tree, scope));
    return () => { operation.current++; };
  }, [scope, tree.like_count, tree.liked]);
  const current = state.scope === scope ? state : initialState(tree, scope);
  const toggle = async () => {
    if (!userId || busy.current || tree.status !== 'approved' || !tree.public_profile) return;
    const token = ++operation.current;
    busy.current = true; setState({ ...current, busy: true, error: '' });
    try {
      const result = await setCommunityTreeLike(supabase, tree.id, !current.liked);
      if (token === operation.current) setState({ scope, ...result, busy: false, error: '' });
    } catch (failure) {
      if (token === operation.current) setState({ ...current, busy: false, error: failure.message });
    } finally { if (token === operation.current) busy.current = false; }
  };
  return { ...current, toggle };
}
