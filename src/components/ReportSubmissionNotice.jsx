import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, X } from 'lucide-react';

export default function ReportSubmissionNotice() {
  const [submission, setSubmission] = useState(null);
  useEffect(() => {
    const received = event => setSubmission(event.detail);
    window.addEventListener('report-submitted', received);
    return () => window.removeEventListener('report-submitted', received);
  }, []);
  if (!submission) return null;
  return <aside role="status" className="fixed inset-x-4 bottom-24 z-[1050] mx-auto max-w-lg rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-elevation-3 lg:bottom-6">
    <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" /><div className="flex-1"><p className="font-bold text-content-primary">{submission.published ? 'Bronca publicada' : 'Enviada para análise'}</p><p className="mt-1 text-sm text-content-secondary">{submission.published ? 'A comunidade já pode ver e apoiar sua bronca.' : 'Sua contribuição foi recebida. Ela aparecerá para a comunidade após a aprovação.'}</p><Link to={submission.published ? `/bronca/${submission.id}` : '/perfil'} onClick={() => setSubmission(null)} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-brand">{submission.published ? 'Ver bronca →' : 'Ver minhas broncas →'}</Link></div><button type="button" aria-label="Fechar confirmação de envio" onClick={() => setSubmission(null)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-content-secondary hover:bg-surface-subtle"><X className="h-5 w-5" /></button></div>
  </aside>;
}
