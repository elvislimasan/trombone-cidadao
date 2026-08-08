import React, { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useReportUpdate, getUpdateTypeInfo } from '@/hooks/useReportUpdate';
import ReportUpdateModal from '@/components/report/ReportUpdateModal';

/**
 * "Esteve no local?" direto do feed, sem passar pela pagina de detalhes.
 *
 * Reusa `useReportUpdate` — as regras (rate limit semanal por tipo, upload com
 * rollback, auto-confirmacao de autor/admin) ficam num lugar so.
 *
 * As atualizacoes existentes sao buscadas ao abrir porque o rate limit depende
 * delas: sem essa lista, os tipos ja enviados na semana apareceriam liberados e
 * o envio so falharia no banco, com erro de RLS.
 */
const FeedUpdateModal = ({ open, onClose, report, onStatusChange }) => {
  const { toast } = useToast();
  const [reportUpdates, setReportUpdates] = useState([]);
  const [loadingUpdates, setLoadingUpdates] = useState(false);

  useEffect(() => {
    if (!open || !report?.id) return;
    let cancelled = false;

    setLoadingUpdates(true);
    supabase
      .from('report_updates')
      .select('id, author_id, update_type, created_at')
      .eq('report_id', report.id)
      .then(({ data }) => {
        if (!cancelled) {
          setReportUpdates(data || []);
          setLoadingUpdates(false);
        }
      });

    return () => { cancelled = true; };
  }, [open, report?.id]);

  const {
    cam, updateType, setUpdateType, message, setMessage,
    submitting, disabledTypes, submit, reset,
  } = useReportUpdate(report, reportUpdates, {
    onSuccess: ({ isAuthorOrAdmin, newStatus }) => {
      onClose();
      if (isAuthorOrAdmin && newStatus) {
        // O card do feed reflete o novo status na hora; sem isso a bronca
        // continuaria "pendente" na lista ate o proximo refresh.
        onStatusChange?.(newStatus);
        toast({
          title: 'Atualização confirmada! ✅',
          description: `A bronca foi marcada como "${getUpdateTypeInfo(updateType).label}".`,
        });
      } else {
        toast({
          title: 'Atualização enviada! 📢',
          description: 'Sua atualização será revisada antes de aparecer para todos.',
        });
      }
    },
  });

  if (!open || !report) return null;

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <AnimatePresence>
      <ReportUpdateModal
        onClose={handleClose}
        onSubmit={submit}
        submitting={submitting}
        disabledTypes={loadingUpdates ? {} : disabledTypes}
        cam={cam}
        selectedType={updateType}
        onSelectType={setUpdateType}
        message={message}
        onMessageChange={setMessage}
      />
    </AnimatePresence>
  );
};

export default FeedUpdateModal;
