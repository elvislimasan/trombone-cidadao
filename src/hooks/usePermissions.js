import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

// Módulos controlados pelo painel de permissões (/admin/permissoes).
export const MODULES = {
  works: 'Obras',
  rentals: 'Imóveis Alugados',
  pavement: 'Pavimentação',
  services: 'Serviços',
  moderation: 'Moderação',
};

export const MODULE_KEYS = Object.keys(MODULES);

/**
 * Espelha public.can_write() do banco: master → regra de usuário → regra do
 * cargo mais forte → liberado.
 *
 * Serve só para a interface (esconder botões/rotas). A autoridade continua
 * sendo a RLS: mesmo contornando a UI, a gravação é barrada no banco.
 */
export function usePermissions() {
  const { user } = useAuth();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setRules([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from('permission_rules')
      .select('scope, role_name, user_id, module, allowed')
      .then(({ data }) => {
        if (cancelled) return;
        setRules(data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const canWrite = useMemo(() => (module) => {
    if (!user) return false;
    if (user.is_master) return true;

    // 1) Regra específica do usuário vence qualquer coisa.
    const userRule = rules.find(
      (r) => r.scope === 'user' && r.user_id === user.id && r.module === module
    );
    if (userRule) return userRule.allowed;

    // 2) Regra do cargo mais forte (admin > ambassador). Sem regra para esse
    //    cargo, cai no padrão liberado — mesmo que um cargo inferior esteja
    //    bloqueado.
    const strongestRole = user.is_admin ? 'admin' : (user.is_ambassador ? 'ambassador' : null);
    if (strongestRole) {
      const roleRule = rules.find(
        (r) => r.scope === 'role' && r.role_name === strongestRole && r.module === module
      );
      if (roleRule) return roleRule.allowed;
    }

    // 3) Padrão: liberado.
    return true;
  }, [rules, user]);

  return { canWrite, loading, rules, MODULES, MODULE_KEYS };
}
