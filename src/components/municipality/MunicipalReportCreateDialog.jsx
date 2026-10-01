import React, { useState } from 'react';
import ReportModal from '@/components/ReportModal';
import ReportReceipt from '@/components/report/ReportReceipt';
import { useCreateReport } from '@/hooks/useCreateReport';

export default function MunicipalReportCreateDialog({ open, onClose, onCreated, onReceiptClose, municipalityId }) {
  const [receipt, setReceipt] = useState(null);
  const { createReport } = useCreateReport({
    municipalMode: true,
    municipalityId,
    onCreated: (_id, report) => {
      setReceipt(report);
      onCreated?.(report);
    },
  });

  return <>
    {open && <ReportModal onClose={onClose} onSubmit={createReport} municipalMode />}
    <ReportReceipt report={receipt} onClose={() => { setReceipt(null); onReceiptClose?.(receipt); }} />
  </>;
}
