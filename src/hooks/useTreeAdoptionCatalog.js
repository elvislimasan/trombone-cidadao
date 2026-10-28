import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { allTreeRows } from '@/lib/treeInventory';
import { availableAdoptionSpecies } from '@/lib/treeAdoption';

export default function useTreeAdoptionCatalog(cityId, availableOnly = false) {
  const [state, setState] = useState({ loading: true, species: [], availability: [], error: '' });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!availableOnly) return;
    window.addEventListener('focus', refresh);
    window.addEventListener('tree-adoption-updated', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('tree-adoption-updated', refresh); };
  }, [refresh, availableOnly]);
  useEffect(() => {
    let active = true;
    setState({ loading: Boolean(cityId), species: [], availability: [], error: '' });
    if (!cityId) return;
    (async () => {
      try {
        const species = await allTreeRows(supabase, 'city_tree_species', query => query.eq('city_id', cityId));
        // A junção limita a consulta de disponibilidade à cidade selecionada.
        const availability = [];
        for (let start = 0; ; start += 1000) {
          const { data, error } = await supabase.from('tree_species_availability').select('*,species:city_tree_species!inner(city_id)').eq('species.city_id', cityId).order('species_id').order('provider').range(start, start + 999);
          if (error) throw error;
          availability.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        const catalogSpecies = availableOnly ? availableAdoptionSpecies(species, availability) : species;
        if (active) setState({ loading: false, species: catalogSpecies.sort((a, b) => a.common_name.localeCompare(b.common_name, 'pt-BR')), availability, error: '' });
      } catch {
        if (active) setState({ loading: false, species: [], availability: [], error: 'Não foi possível carregar as espécies e a disponibilidade. Tente novamente em alguns instantes.' });
      }
    })();
    return () => { active = false; };
  }, [cityId, revision, availableOnly]);
  return { ...state, refresh };
}
