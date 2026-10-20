import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { loadReportMapTrees, treeRequestCounts } from '@/lib/treeInventory';

export function useReportMapTrees(category, bounds, cityId) {
  const [state, setState] = useState({ trees: [], loading: false, error: '' });
  const [requests, setRequests] = useState({ counts: null, error: '' });
  const [revision, setRevision] = useState(0);
  const enabled = category === 'poda';
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('reports-updated', refresh);
    return () => window.removeEventListener('reports-updated', refresh);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setRequests({ counts: null, error: '' });
    if (!enabled) return;
    treeRequestCounts(supabase, cityId).then(counts => {
      if (!cancelled) setRequests({ counts, error: '' });
    }).catch(() => {
      if (!cancelled) setRequests({ counts: null, error: 'Não foi possível atualizar os vínculos das árvores.' });
    });
    return () => { cancelled = true; };
  }, [enabled, cityId, revision]);
  useEffect(() => {
    let cancelled = false;
    if (!enabled || !bounds) {
      setState({ trees: [], loading: false, error: '' });
      return;
    }
    setState(current => ({ ...current, loading: true, error: '' }));
    const timer = setTimeout(() => {
      loadReportMapTrees(supabase, bounds, cityId).then(trees => {
        if (!cancelled) setState({ trees, loading: false, error: '' });
      }).catch(() => {
        if (!cancelled) setState({ trees: [], loading: false, error: 'Não foi possível carregar as árvores desta área do mapa.' });
      });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, bounds?.south, bounds?.north, bounds?.west, bounds?.east, cityId, revision]);
  const trees = useMemo(() => state.trees.map(tree => ({ ...tree,
    service_requests: requests.counts ? Number(requests.counts.get(tree.id)?.total || 0) : null,
  })), [state.trees, requests.counts]);
  return { ...state, trees: enabled ? trees : [], error: state.error || requests.error, retry: () => setRevision(value => value + 1) };
}
