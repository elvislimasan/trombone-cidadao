import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/lib/customSupabaseClient';
import { summarizeElectricianWork } from '@/lib/electricianStats';
import ExecutorStatisticsView from '@/components/municipality/ExecutorStatisticsView';

const PAGE_SIZE = 500;

export default function ElectricianStatsPage() {
  const context = useOutletContext();
  const municipalityId = context.municipality?.id;
  const [orders, setOrders] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    if (!municipalityId || !context.userId) { setLoading(false); return undefined; }
    let active = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const all = [];
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const { data, error: failure } = await supabase.rpc('atendimentos_eletricista_iluminacao', {
            p_prefeitura: municipalityId,
          }).range(offset, offset + PAGE_SIZE - 1);
          if (failure) throw failure;
          all.push(...(data || []));
          if (!active) return;
          if ((data || []).length < PAGE_SIZE) break;
        }
        if (active) setOrders(all);
        const rankResult = await supabase.rpc('ranking_eletricistas_iluminacao', { p_prefeitura: municipalityId });
        if (rankResult.error) throw rankResult.error;
        if (active) setRanking(rankResult.data || []);
      } catch (failure) {
        if (active) setError(failure.message || 'Não foi possível carregar as estatísticas.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [municipalityId, context.userId, refreshKey]);

  const stats = useMemo(() => summarizeElectricianWork(orders), [orders]);
  return <ExecutorStatisticsView context={context} stats={stats} ranking={ranking} loading={loading} error={error} refresh={refresh} generalStatsPath="/prefeitura/eletricista/estatisticas/geral" />;
}
