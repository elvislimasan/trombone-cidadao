import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';

// Extraido de src/pages/ReportPage.jsx (refatoracao pura, task 1 da fase 2).
// Cada condicao abaixo foi copiada literalmente do arquivo original -- nao
// simplificar nem reordenar alternativas de OR/AND.
export function useReportPermissions(report) {
  const { user } = useAuth();
  const location = useLocation();

  // ── Moderacao (embaixador vindo do painel) ──
  // Ativa quando navegamos com state.moderation=true a partir do Painel do Embaixador.
  const cameFromModeration = !!location.state?.moderation;
  const [canModerate, setCanModerate] = useState(false);

  const isAdmin = !!user?.is_admin;
  const isMaster = !!user?.is_master;
  const isPublicOfficial = user?.user_type === 'public_official';
  const isAuthor = !!user && !!report && user.id === report.author_id;

  // Autor da bronca ou admin: usado para decidir pending vs pending_moderation
  // ao enviar uma atualizacao (handleSubmitUpdate).
  const isAuthorOrAdmin =
    !!user && !!report && (user.is_admin || user.id === report.author_id);

  const canChangeStatus =
    !!user &&
    !!report &&
    (user.is_admin || user.user_type === 'public_official');
  const canEditCategory = !!user && !!report && user.is_admin;
  const canEditWaterUtility =
    !!report && report.category === 'buracos' && canEditCategory;
  const canMarkResolved = canChangeStatus;

  // Confirmar uma atualizacao pendente. Nao existe "editar atualizacao" no app.
  const canConfirmUpdate = (upd) =>
    !!upd &&
    upd.status === 'pending' &&
    !!user &&
    (user.is_admin || report?.author_id === user?.id);

  // Admin: exclui qualquer status. Autor: so se ainda nao confirmada.
  const canDeleteUpdate = (upd) =>
    !!upd &&
    (user?.is_admin ||
      (upd.author_id === user?.id &&
        ['pending_moderation', 'pending'].includes(upd.status)));

  // Verifica se o usuario pode moderar esta bronca (admin/master, ou embaixador
  // ativo da cidade dela). So roda quando viemos do painel de moderacao e a
  // bronca ainda esta aguardando aprovacao.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (
        !cameFromModeration ||
        !user ||
        !report ||
        report.moderation_status !== 'pending_approval'
      ) {
        if (!cancelled) setCanModerate(false);
        return;
      }
      if (user.is_admin || user.is_master) {
        if (!cancelled) setCanModerate(true);
        return;
      }
      if (!user.is_ambassador || !report.city_id) {
        if (!cancelled) setCanModerate(false);
        return;
      }
      const { data, error } = await supabase.rpc('is_ambassador_of', {
        p_user: user.id,
        p_city_id: report.city_id,
      });
      if (!cancelled) setCanModerate(!error && data === true);
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [cameFromModeration, user, report?.moderation_status, report?.city_id]);

  return {
    isAdmin,
    isMaster,
    isPublicOfficial,
    isAuthor,
    isAuthorOrAdmin,
    canModerate,
    canEditCategory,
    canEditWaterUtility,
    canMarkResolved,
    canConfirmUpdate,
    canDeleteUpdate,
  };
}

export default useReportPermissions;
