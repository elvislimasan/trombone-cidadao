import { useMemo, useState } from 'react';
import { AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { useNativeCamera } from '@/hooks/useNativeCamera';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Metadados de cada tipo de atualização, incluindo o status que a bronca
// assume quando a atualização é confirmada.
export const getUpdateTypeInfo = (updateType) => {
  const map = {
    still_here: {
      label: 'O problema ainda está aqui',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      cardBg: 'bg-red-50/70',
      cardBorder: 'border-red-100',
      iconBg: 'bg-red-100',
      dotColor: 'bg-red-500',
      Icon: AlertCircle,
      reportStatus: 'pending',
    },
    being_solved: {
      label: 'O problema está sendo resolvido',
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      cardBg: 'bg-amber-50/70',
      cardBorder: 'border-amber-100',
      iconBg: 'bg-amber-100',
      dotColor: 'bg-amber-500',
      Icon: Clock,
      reportStatus: 'in-progress',
    },
    solved: {
      label: 'O problema foi resolvido',
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      cardBg: 'bg-emerald-50/70',
      cardBorder: 'border-emerald-100',
      iconBg: 'bg-emerald-100',
      dotColor: 'bg-emerald-500',
      Icon: CheckCircle,
      reportStatus: 'pending_resolution',
    },
  };
  return map[updateType] || map.still_here;
};

// Rate limit por tipo: mapeia tipo → Date de liberação (se bloqueado).
// Cada usuário só pode enviar o mesmo tipo de atualização a cada 7 dias.
export const computeDisabledUpdateTypes = (reportUpdates, user) => {
  if (!user) return {};
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const result = {};
  (reportUpdates || []).forEach((u) => {
    if (u.author_id === user.id && new Date(u.created_at) > cutoff) {
      const unlockDate = new Date(new Date(u.created_at).getTime() + SEVEN_DAYS_MS);
      if (!result[u.update_type] || unlockDate > result[u.update_type]) {
        result[u.update_type] = unlockDate;
      }
    }
  });
  return result;
};

/**
 * Lógica compartilhada de "enviar atualização de bronca".
 *
 * Extraído de ReportPage para permitir enviar a atualização de outros lugares
 * (ex: popup do mapa) sem duplicar as regras: moderação por perfil, upload de
 * fotos com rollback, auto-confirmação para autor/admin e mudança de status
 * derivada do tipo escolhido.
 *
 * @param {object|null} report      bronca alvo
 * @param {Array}  reportUpdates    atualizações já existentes (para o rate limit)
 * @param {object} callbacks        { onSuccess, onOptimisticInsert }
 */
export function useReportUpdate(report, reportUpdates = [], { onSuccess, onOptimisticInsert } = {}) {
  const { user } = useAuth();
  const { toast } = useToast();

  const cam = useNativeCamera({ maxPhotos: 5 });
  const [updateType, setUpdateType] = useState(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const disabledTypes = useMemo(
    () => computeDisabledUpdateTypes(reportUpdates, user),
    [reportUpdates, user]
  );

  const canSendAnyUpdate = useMemo(() => {
    if (!user) return false;
    return ['still_here', 'being_solved', 'solved'].some((t) => !disabledTypes[t]);
  }, [user, disabledTypes]);

  const reset = () => {
    cam.clearPhotos();
    setUpdateType(null);
    setMessage('');
  };

  const submit = async () => {
    if (!user || !report || !updateType) return;
    const photos = await cam.resolveForUpload();
    setSubmitting(true);
    const isAuthorOrAdmin = user.is_admin || user.id === report.author_id;

    try {
      const { data: newUpdate, error: insertError } = await supabase
        .from('report_updates')
        .insert({
          report_id: report.id,
          author_id: user.id,
          update_type: updateType,
          message: message || null,
          // Autor e admin auto-confirmam; outros entram em moderação
          status: isAuthorOrAdmin ? 'pending' : 'pending_moderation',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (photos && photos.length > 0) {
        try {
          const mediaRecords = await Promise.all(
            photos.map(async (photo) => {
              const filePath = `${user.id}/${report.id}/updates/${newUpdate.id}/${Date.now()}-${photo.name}`;
              const { error: uploadError } = await supabase.storage
                .from('reports-media')
                .upload(filePath, photo);
              if (uploadError) throw uploadError;
              const {
                data: { publicUrl },
              } = supabase.storage.from('reports-media').getPublicUrl(filePath);
              return { report_update_id: newUpdate.id, url: publicUrl, type: 'photo' };
            })
          );
          await supabase.from('report_update_media').insert(mediaRecords);
        } catch (uploadErr) {
          // Rollback: exclui o update para não deixar registro órfão
          await supabase.from('report_updates').delete().eq('id', newUpdate.id);
          throw new Error(
            'Falha no upload das fotos. A atualização não foi enviada. Tente novamente ou envie sem fotos.'
          );
        }
      }

      onOptimisticInsert?.({
        id: newUpdate.id,
        report_id: report.id,
        author_id: user.id,
        update_type: updateType,
        message: message || null,
        status: isAuthorOrAdmin ? 'pending' : 'pending_moderation',
        created_at: new Date().toISOString(),
        media: [],
        author: { name: user.name || 'Você' },
      });

      let newStatus = null;
      if (isAuthorOrAdmin) {
        const typeInfo = getUpdateTypeInfo(updateType);
        newStatus =
          updateType === 'solved' && user.is_admin ? 'resolved' : typeInfo.reportStatus;

        await supabase
          .from('report_updates')
          .update({
            status: 'confirmed',
            confirmed_by: user.id,
            confirmed_at: new Date().toISOString(),
          })
          .eq('id', newUpdate.id);

        await supabase.from('reports').update({ status: newStatus }).eq('id', report.id);
      }

      reset();
      onSuccess?.({ isAuthorOrAdmin, newStatus, updateId: newUpdate.id });
      return { ok: true, isAuthorOrAdmin, newStatus };
    } catch (err) {
      const isRlsError =
        err.message?.includes('row-level security') || err.code === '42501';
      toast({
        title: isRlsError ? 'Limite semanal atingido' : 'Erro ao enviar atualização',
        description: isRlsError
          ? 'Você já enviou este tipo de atualização esta semana. Tente outro tipo ou aguarde.'
          : err.message,
        variant: 'destructive',
      });
      return { ok: false };
    } finally {
      setSubmitting(false);
    }
  };

  return {
    cam,
    updateType,
    setUpdateType,
    message,
    setMessage,
    submitting,
    disabledTypes,
    canSendAnyUpdate,
    submit,
    reset,
  };
}
