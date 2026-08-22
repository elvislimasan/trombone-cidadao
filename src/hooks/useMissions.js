import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { missoesPorTrilha, etapasConcluidas } from '@/lib/missions';
import { placar } from '@/lib/scoring';
import { calcularSequencia, avaliarConquistas } from '@/lib/patrolGame';

// Progresso das missões, pontos e conquistas.
//
// UMA consulta: os contadores brutos. Catálogo, escadas, progresso, pontuação,
// nível e conquistas são função pura — nada disso vem do servidor, e é o que
// permite mudar uma meta sem migração.
//
// Os nomes das colunas mudam de `snake_case` para o que o catálogo espera num
// lugar só, aqui. Espalhar essa tradução pelas funções `valor` obrigaria cada
// missão nova a lembrar do formato do banco.

const normalizar = (linha) => ({
  reports_count: linha?.reports_count ?? 0,
  updates_count: linha?.updates_count ?? 0,
  total_passed: linha?.total_passed ?? 0,
  bairros_ativos: linha?.bairros_ativos ?? 0,
  bairros_liderados: linha?.bairros_liderados ?? 0,
  acoes_no_melhor: linha?.acoes_no_melhor ?? 0,
  patrol_days: linha?.patrol_days ?? [],
  comments_count: linha?.comments_count ?? 0,
  upvotes_given: linha?.upvotes_given ?? 0,
  signals_count: linha?.signals_count ?? 0,
  missions_count: linha?.missions_count ?? 0,
  patrols_count: linha?.patrols_count ?? 0,
  total_confirmed: linha?.total_confirmed ?? 0,
  total_distance_meters: linha?.total_distance_meters ?? 0,
  shares_count: linha?.shares_count ?? 0,
  confirmadasPorCategoria: linha?.confirmed_by_category ?? {},
  registradasPorCategoria: linha?.reported_by_category ?? {},
});

export function useMissions() {
  const { user } = useAuth();

  const [contadores, setContadores] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const buscar = useCallback(async () => {
    if (!user) {
      setCarregando(false);
      return;
    }
    try {
      // Uma consulta só. O nível saiu do `get_user_level` e passou a ser
      // calculado aqui (src/lib/scoring.js) porque as missões agora valem
      // pontos — e o catálogo delas é JavaScript. Buscar o nível no banco daria
      // um total menor que o mostrado, e duas verdades para o mesmo usuário.
      const { data, error } = await supabase.rpc('get_mission_counters', {
        target_user_id: user.id,
      });
      if (error) throw error;
      setContadores(normalizar(data?.[0]));
    } catch (err) {
      console.error('[useMissions] falha ao carregar:', err);
    } finally {
      setCarregando(false);
    }
  }, [user]);

  useEffect(() => { buscar(); }, [buscar]);

  // Ações + bônus das etapas vencidas.
  const pontuacao = useMemo(() => placar(contadores), [contadores]);
  const nivel = pontuacao;
  const nivelAtual = pontuacao.level;

  // Conquistas usam os mesmos contadores, mais a sequência de dias — que é
  // função pura sobre as datas que a RPC devolve.
  const conquistas = useMemo(() => {
    if (!contadores) return [];
    return avaliarConquistas({
      ...contadores,
      sequencia: calcularSequencia(contadores.patrol_days || []),
    });
  }, [contadores]);

  const trilhas = useMemo(
    () => missoesPorTrilha(contadores, nivelAtual),
    [contadores, nivelAtual]
  );

  const concluidas = useMemo(
    () => etapasConcluidas(contadores, nivelAtual),
    [contadores, nivelAtual]
  );

  // Quantas estão ao alcance agora — é o número que diz se a central tem o que
  // oferecer, e o que a tela mostra no topo.
  const disponiveis = useMemo(
    () =>
      trilhas.reduce(
        (n, t) => n + t.missoes.filter((m) => !m.bloqueada && !m.completa).length,
        0
      ),
    [trilhas]
  );

  return {
    trilhas, nivel, pontuacao, conquistas, contadores,
    concluidas, disponiveis, carregando, recarregar: buscar,
  };
}
