import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  calcularSequencia,
  avaliarConquistas,
  conquistasNovas,
  resumoDeBairros,
  titulosDeBairro,
} from '@/lib/patrolGame';
import { placar } from '@/lib/scoring';
import { normalizarContadoresDeMissao } from '@/lib/missionCounters';

// Estado de jogo do patrulheiro: nível, sequência, conquistas, títulos de
// bairro e ranking.
//
// Tudo é derivado de RPCs que agregam as tabelas existentes — não há coluna de
// streak nem tabela de conquistas para manter em sincronia.
//
// A foto é tirada em dois momentos: ao ABRIR o modo (antes) e ao encerrar
// (depois). É a diferença entre as duas que diz quais medalhas comemorar; sem a
// foto inicial, toda patrulha reapresentaria as medalhas antigas como novidade.
//
// Pontos e nível vêm dos MESMOS contadores usados no Perfil e na central de
// missões. `get_user_level` não conhece bônus de etapas nem diárias e, por isso,
// fazia o resumo da Patrulha mostrar um total menor para a mesma pessoa.

const vazio = {
  patrols_count: 0,
  total_passed: 0,
  total_confirmed: 0,
  total_distance_meters: 0,
  total_duration_seconds: 0,
  signals_count: 0,
  missions_count: 0,
  bairros_ativos: 0,
  bairros_liderados: 0,
  acoes_no_melhor: 0,
};

export function usePatrolGame({ cityId = null } = {}) {
  const { user } = useAuth();

  const [nivel, setNivel] = useState(null);
  const [stats, setStats] = useState(vazio);
  const [sequencia, setSequencia] = useState(0);
  const [ranking, setRanking] = useState([]);
  const [bairros, setBairros] = useState([]);
  const [carregando, setCarregando] = useState(false);

  // Foto inicial, para comparar no fim.
  const statsAntesRef = useRef(null);

  const buscar = useCallback(async () => {
    if (!user) return null;

    const [totais, contadores, lugares] = await Promise.all([
      supabase.rpc('get_patrol_stats', { target_user_id: user.id }),
      supabase.rpc('get_mission_counters', { target_user_id: user.id }),
      supabase.rpc('get_neighborhood_standing', {
        target_user_id: user.id,
        // Sem cidade, o placar do usuário mistura bairros homônimos de
        // municípios diferentes — e "Centro" existe em todas.
        target_city_id: cityId ? Number(cityId) : null,
        dias: 90,
      }),
    ]);

    const t = totais.data?.[0] ?? {};
    const c = normalizarContadoresDeMissao(contadores.data?.[0]);
    const seq = calcularSequencia(c.patrol_days || []);
    const meusBairros = lugares.data || [];

    const combinado = {
      ...vazio,
      ...t,
      // Sobrescreve os totais comuns de `get_patrol_stats`: estes contadores
      // aplicam `patrulha_conta`, igual à central de missões, e descartam saídas
      // acidentais de poucos segundos.
      ...c,
      sequencia: seq,
      ...resumoDeBairros(meusBairros),
    };

    setStats(combinado);
    setSequencia(seq);
    setNivel(placar(c));
    setBairros(meusBairros);
    return combinado;
  }, [user, cityId]);

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

  // Títulos ordenados como o banco devolveu: bairro mais forte primeiro.
  const titulos = useMemo(() => titulosDeBairro(bairros), [bairros]);

  const minhaPosicao = useMemo(() => {
    if (!user) return null;
    const i = ranking.findIndex((r) => r.user_id === user.id);
    return i >= 0 ? i + 1 : null;
  }, [ranking, user]);

  return {
    nivel, stats, sequencia, conquistas, ranking, minhaPosicao,
    bairros, titulos, carregando, apurar,
  };
}
