import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';

import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { avancosEntre } from '@/lib/missions';
import MissionProgressToast from '@/components/missions/MissionProgressToast';

// Comemoração de progresso, global.
//
// POR QUE UM CONTEXTO, E NÃO UM AVISO EM CADA TELA
//
// A mesma ação conta para missões que a tela onde ela aconteceu não conhece:
// registrar uma bronca mexe em "Registre broncas" e pode fechar uma etapa de
// "Investigue buracos". Se cada tela decidisse o que comemorar, cada uma
// precisaria carregar o catálogo inteiro — e a que esquecesse simplesmente não
// comemoraria, sem ninguém notar.
//
// Aqui a tela só avisa QUE algo aconteceu. Quem descobre o que mudou é a
// comparação entre os contadores de antes e os de agora.
//
// A FOTO ANTERIOR É O QUE TORNA ISSO POSSÍVEL
//
// Sem ela não há diferença a calcular, e a primeira carga celebraria o que a
// pessoa fez semana passada. Por isso a primeira busca só guarda o retrato e
// não mostra nada.
//
// SILENCIOSO QUANDO FALHA
//
// Registrar a bronca é a ação; comemorar é consequência. Um erro de rede aqui
// não pode virar alerta na cara de quem acabou de publicar.

const MissionProgressContext = createContext({ celebrar: () => {} });

export const useMissionProgress = () => useContext(MissionProgressContext);

export function MissionProgressProvider({ children }) {
  const { user } = useAuth();

  const contadoresRef = useRef(null);
  const buscandoRef = useRef(false);
  const [avanco, setAvanco] = useState(null);

  const buscarContadores = useCallback(async () => {
    if (!user) return null;
    const { data, error } = await supabase.rpc('get_mission_counters', {
      target_user_id: user.id,
    });
    if (error) throw error;

    const linha = data?.[0];
    if (!linha) return null;

    return {
      ...linha,
      confirmadasPorCategoria: linha.confirmed_by_category ?? {},
      registradasPorCategoria: linha.reported_by_category ?? {},
    };
  }, [user]);

  // Retrato inicial, sem comemorar. Trocar de conta zera: os contadores da
  // pessoa anterior não têm nada a ver com os desta.
  useEffect(() => {
    contadoresRef.current = null;
    if (!user) return;

    let cancelado = false;
    buscarContadores()
      .then((c) => { if (!cancelado) contadoresRef.current = c; })
      .catch(() => {});
    return () => { cancelado = true; };
  }, [user, buscarContadores]);

  /**
   * "Fiz algo que pode ter mexido numa missão."
   *
   * A tela não diz o quê nem quanto — só que aconteceu. O resto é diferença.
   *
   * O atraso existe porque quem chama costuma acabar de gravar: a bronca sobe,
   * o trigger de moderação roda, e só então a contagem reflete. Sem a folga, a
   * consulta chegaria antes do próprio efeito e não veria avanço nenhum.
   */
  const celebrar = useCallback(async ({ atrasoMs = 900 } = {}) => {
    if (!user || buscandoRef.current) return;
    buscandoRef.current = true;

    try {
      await new Promise((r) => setTimeout(r, atrasoMs));
      const agora = await buscarContadores();
      if (!agora) return;

      const antes = contadoresRef.current;
      contadoresRef.current = agora;

      // Sem retrato anterior não há avanço a afirmar — ver o topo.
      if (!antes) return;

      const [principal] = avancosEntre(antes, agora);
      if (principal) setAvanco({ ...principal, chave: Date.now() });
    } catch {
      // Ver o comentário do topo.
    } finally {
      buscandoRef.current = false;
    }
  }, [user, buscarContadores]);

  return (
    <MissionProgressContext.Provider value={{ celebrar }}>
      {children}
      <MissionProgressToast avanco={avanco} onFechar={() => setAvanco(null)} />
    </MissionProgressContext.Provider>
  );
}
