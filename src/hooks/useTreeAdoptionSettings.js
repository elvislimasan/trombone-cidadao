import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { loadTreeAdoptionSettings } from '@/lib/treeAdoptionSettings';

export default function useTreeAdoptionSettings(cityId) {
  const [state, setState] = useState({ cityId: null, plantingEnabled: false, seedlingsEnabled: false, loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    window.addEventListener('focus', refresh);
    window.addEventListener('tree-adoption-settings-updated', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('tree-adoption-settings-updated', refresh);
    };
  }, [refresh]);
  useEffect(() => {
    let active = true;
    setState(current => ({ ...current, loading: true, error: '' }));
    loadTreeAdoptionSettings(supabase, cityId).then(settings => {
      if (active) setState({ ...settings, cityId, loading: false, error: '' });
    }).catch(() => {
      if (active) setState({ cityId, plantingEnabled: false, seedlingsEnabled: false, loading: false, error: 'Não foi possível consultar a disponibilidade de solicitações.' });
    });
    return () => { active = false; };
  }, [cityId, revision]);
  // Nunca reutiliza a configuração da cidade anterior durante a consulta.
  const current = String(state.cityId) === String(cityId) ? state : { plantingEnabled: false, seedlingsEnabled: false, loading: true, error: '' };
  return { ...current, refresh };
}
