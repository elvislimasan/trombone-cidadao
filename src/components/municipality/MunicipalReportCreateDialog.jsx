import React, { useRef, useState } from 'react';
import ReportModal from '@/components/ReportModal';
import ReportReceipt from '@/components/report/ReportReceipt';
import { useCreateReport } from '@/hooks/useCreateReport';
import { supabase } from '@/lib/customSupabaseClient';
import { saveMunicipalReportReceipt } from '@/lib/municipalReportReceipt';

export default function MunicipalReportCreateDialog({ open, onClose, onCreated, onReceiptClose, municipalityId }) {
  const [receipt, setReceipt] = useState(null);
  const [receiptImageStatus, setReceiptImageStatus] = useState('');
  const pendingReceipt = useRef(null);
  const { createReport } = useCreateReport({
    municipalMode: true,
    municipalityId,
    onCreated: (_id, report) => {
      pendingReceipt.current = report;
      setReceiptImageStatus('saving');
      saveMunicipalReportReceipt(supabase, report).then(() => {
        setReceiptImageStatus('saved');
        window.dispatchEvent(new CustomEvent('municipal-report-receipt-saved', { detail: { id: report.id } }));
      }).catch(() => setReceiptImageStatus('error'));
      onCreated?.(report);
    },
  });

  const closeForm = () => {
    onClose();
    if (pendingReceipt.current) {
      setReceipt(pendingReceipt.current);
      pendingReceipt.current = null;
    }
  };

  return <>
    {open && <ReportModal onClose={closeForm} onSubmit={createReport} municipalMode />}
    <ReportReceipt report={receipt} imageStatus={receiptImageStatus} onClose={() => { setReceipt(null); onReceiptClose?.(receipt); }} />
  </>;
}
