import { useEffect, useRef, useState } from 'react';
import { applyTreeBatchAddress, lookupTreeBatchLocation, treeBatchPointKey } from '@/lib/treeBatchLocations';
import { reverseGeocodePin } from '@/lib/reverseGeocodePin';
import { supabase } from '@/lib/customSupabaseClient';

export default function useTreeBatchAddresses({ enabled, points, setPoints, cityId, neighborhoods, streets, cache }) {
  const latest = useRef({ neighborhoods, streets });
  latest.current = { neighborhoods, streets };
  const lifecycle = useRef(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const state = { controller: new AbortController(), running: false };
    lifecycle.current = state;
    return () => state.controller.abort();
  }, [cityId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    // Catálogos podem chegar depois da consulta; reaplica somente sugestões,
    // preservando inclusive uma seleção manual vazia.
    setPoints(current => {
      let changed = false;
      const next = current.map(point => {
        const location = cache.get(treeBatchPointKey(point, cityId));
        if (!location) return point;
        const resolved = applyTreeBatchAddress(point, location, cityId, { neighborhoods, streets });
        if (['address', 'street_id', 'street_name', 'bairro_id', 'neighborhood'].every(key => point[key] === resolved[key])) return point;
        changed = true;
        return resolved;
      });
      return changed ? next : current;
    });
  }, [enabled, cityId, neighborhoods, streets, cache, setPoints]);

  useEffect(() => {
    const state = lifecycle.current;
    if (!enabled || !state || state.running || state.controller.signal.aborted) return;
    const point = points.find(item => !item.addressStatus || item.addressStatus === 'queued');
    if (!point) return;
    state.running = true;
    const signal = state.controller.signal;
    const update = transform => {
      if (!signal.aborted) setPoints(current => current.map(item => item.draftId === point.draftId ? transform(item) : item));
    };
    update(item => ({ ...item, addressStatus: 'loading' }));
    (async () => {
      try {
        const key = treeBatchPointKey(point, cityId);
        const location = cache.get(key) || await lookupTreeBatchLocation(
          position => reverseGeocodePin(position, { invoke: (...args) => supabase.functions.invoke(...args) }),
          { lat: point.latitude, lng: point.longitude }, signal,
        );
        if (signal.aborted) return;
        if (!location?.address?.trim() && !location?.suburb?.trim()) throw new Error('Endereço indisponível.');
        cache.set(key, location);
        update(item => {
          const resolved = applyTreeBatchAddress(item, location, cityId, latest.current);
          return { ...resolved, addressStatus: resolved.address && resolved.bairro_id ? 'success' : 'partial' };
        });
      } catch {
        update(item => ({ ...item, addressStatus: 'failed' }));
      } finally {
        state.running = false;
        if (!signal.aborted) setRevision(value => value + 1);
      }
    })();
  }, [enabled, points, cityId, cache, setPoints, revision]);
}
