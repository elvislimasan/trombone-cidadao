import { useCallback, useEffect, useRef, useState } from 'react';

export function useGuideDirectory(client, cityId, onError) {
  const cityKey = cityId == null ? null : String(cityId);
  const requestId = useRef(0);
  const [snapshot, setSnapshot] = useState({ cityKey, directory: [], categories: [], loading: true, dataReady: false });

  const fetchData = useCallback(async () => {
    const request = ++requestId.current;
    setSnapshot((previous) => ({ ...previous, loading: true, dataReady: false }));
    try {
      let query = client.from('directory').select('*').eq('status', 'approved');
      if (cityKey != null) query = query.eq('city_id', cityKey);
      const [directory, categories] = await Promise.all([
        query,
        client.from('directory_categories').select('*').eq('active', true).order('sort_order').order('name'),
      ]);
      if (request !== requestId.current) return;
      if (directory.error) onError?.({ title: 'Erro ao buscar Guia da Cidade', description: directory.error.message, variant: 'destructive' });
      if (categories.error) onError?.({ title: 'Erro ao buscar categorias do Guia', description: categories.error.message, variant: 'destructive' });
      setSnapshot({ cityKey, directory: directory.data || [], categories: categories.data || [], loading: false, dataReady: !directory.error && !categories.error });
    } catch (error) {
      if (request !== requestId.current) return;
      onError?.({ title: 'Erro ao buscar Guia da Cidade', description: error.message, variant: 'destructive' });
      setSnapshot({ cityKey, directory: [], categories: [], loading: false, dataReady: false });
    }
  }, [client, cityKey, onError]);

  useEffect(() => {
    fetchData();
    return () => { requestId.current += 1; };
  }, [fetchData]);

  // Uma mudança de cidade invalida os dados já no render, antes do próximo efeito.
  const current = snapshot.cityKey === cityKey;
  return {
    directory: current ? snapshot.directory : [],
    directoryCategories: current ? snapshot.categories : [],
    loading: !current || snapshot.loading,
    dataReady: current && snapshot.dataReady,
    fetchData,
  };
}
