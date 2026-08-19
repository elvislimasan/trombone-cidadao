import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { calcularSequencia, avaliarConquistas, conquistasNovas } from '@/lib/patrolGame';

// Estado de jogo do patrulheiro: nível, sequência, conquistas e ranking.
//
// Tudo é derivado de RPCs que agregam as tabelas existentes — não há coluna de
// streak nem tabela de conquistas para manter em sincronia.
//
// A foto é tirada em dois momentos: ao ABRIR o modo (antes) e ao encerrar
// (depois). É a diferença entre as duas que diz quais medalhas comemorar; sem a
// foto inicial, toda patrulha reapresentaria as medalhas antigas como novidade.

const vazio = {
  patrols_count: 0,
  total_passed: 0,
  total_confirmed: 0,
  total_distance_meters: 0,
  total_duration_seconds: 0,
};

export function usePatrolGame({ cityId = null } = {}) {
  const { user } = useAuth();

  const [nivel, setNivel] = useState(null);
  const [stats, setStats] = useState(vazio);
  const [sequencia, setSequencia] = useState(0);
  const [ranking, setRanking] = useState([]);
  const [carregando, setCarregando] = useState(false);

  // Foto inicial, para comparar no fim.
  const statsAntesRef = useRef(null);

  const buscar = useCallback(async () => {
    if (!user) return null;

    const [totais, dias, niveis] = await Promise.all([
      supabase.rpc('get_patrol_stats', { target_user_id: user.id }),
      supabase.rpc('get_patrol_days', { target_user_id: user.id, dias: 90 }),
      supabase.rpc('get_user_level', { target_user_id: user.id }),
    ]);

    const t = totais.data?.[0] ?? vazio;
    const seq = calcularSequencia((dias.data || []).map((d) => d.dia));

    setStats(t);
    setSequencia(seq);
    setNivel(niveis.data?.[0] ?? null);
    return { ...t, sequencia: seq };
  }, [user]);

  // Foto inicial, uma vez, ao montar.
  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    setCarregando(true);
    buscar()
      .then((s) => { if (!cancelado && s) statsAntesRef.current = s; })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [user, buscar]);

  // Ranking do mês corrente. Só patrulhas compartilhadas entram — a RPC filtra
  // por is_public, então aparecer no placar é ato explícito de quem patrulha.
  useEffect(() => {
    const inicioDoMes = new Date();
    inicioDoMes.setDate(1);
    inicioDoMes.setHours(0, 0, 0, 0);

    supabase
      .rpc('patrol_ranking', {
        target_city_id: cityId ? Number(cityId) : null,
        desde: inicioDoMes.toISOString(),
        limite: 10,
      })
      .then(({ data }) => setRanking(data || []));
  }, [cityId]);

  /**
   * Relê os totais depois de gravar a patrulha e devolve o que mudou.
   * @returns {Promise<{novas: Array, stats: object}>}
   */
  const apurar = useCallback(async () => {
    const depois = await buscar();
    if (!depois) return { novas: [], stats: { ...vazio, sequencia: 0 } };
    const novas = conquistasNovas(statsAntesRef.current, depois);
    statsAntesRef.current = depois;
    return { novas, stats: depois };
  }, [buscar]);

  const conquistas = useMemo(
    () => avaliarConquistas({ ...stats, sequencia }),
    [stats, sequencia]
  );

  const minhaPosicao = useMemo(() => {
    if (!user) return null;
    const i = ranking.findIndex((r) => r.user_id === user.id);
    return i >= 0 ? i + 1 : null;
  }, [ranking, user]);

  return { nivel, stats, sequencia, conquistas, ranking, minhaPosicao, carregando, apurar };
}
