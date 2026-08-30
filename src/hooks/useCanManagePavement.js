import { useEffect, useState } from 'react';

import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * Quem pode criar e editar rua de pavimentação.
 *
 * A regra é a mesma da RLS das migrações 152 e 153: admin e master ("imperador")
 * em qualquer cidade; embaixador só nas cidades ativas dele. Por cima de tudo,
 * o painel de permissões (`can_write('pavement')`).
 *
 * Isto ESCONDE botão. Quem barra de verdade é a RLS — um botão que apareça por
 * engano resulta em erro do PostgREST, nunca em gravação indevida.
 *
 * @param {string|number|null} cityId cidade em foco; null quando a tela não tem uma
 */
export function useCanManagePavement(cityId) {
  const { user } = useAuth();
  const { canWrite } = usePermissions();
  const [myActiveCityIds, setMyActiveCityIds] = useState([]);

  const isPureAmbassador = Boolean(user?.is_ambassador && !user?.is_admin && !user?.is_master);

  useEffect(() => {
    if (!isPureAmbassador || !user?.id) { setMyActiveCityIds([]); return; }
    let cancelled = false;
    supabase
      .from('ambassador_cities')
      .select('city_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .then(({ data }) => {
        if (!cancelled) setMyActiveCityIds((data || []).map((r) => r.city_id));
      });
    return () => { cancelled = true; };
  }, [isPureAmbassador, user?.id]);

  const canManage = Boolean(
    (user?.is_admin || user?.is_master
      || (isPureAmbassador && cityId && myActiveCityIds.some((id) => String(id) === String(cityId))))
    && canWrite('pavement')
  );

  return { canManage, myActiveCityIds, isPureAmbassador };
}
