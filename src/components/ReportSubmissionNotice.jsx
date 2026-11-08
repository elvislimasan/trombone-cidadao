import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, Clock, X } from 'lucide-react';

export default function ReportSubmissionNotice() {
  const [submission, setSubmission] = useState(null);
  useEffect(() => {
    const received = event => setSubmission(event.detail);
    window.addEventListener('report-submitted', received);
    return () => window.removeEventListener('report-submitted', received);
  }, []);
  // O painel municipal já apresenta seu comprovante e suas regras de visibilidade.
  if (!submission || submission.municipal) return null;
  const title = submission.published ? 'Bronca publicada' : 'Bronca recebida';
  const description = submission.published
    ? 'Seu relato já está visível para a comunidade.'
    : 'Recebemos seu relato. Agora ele aguarda análise.';
  const StatusIcon = submission.published ? CheckCircle2 : Clock;
  return <aside aria-label="Confirmação de envio" className="report-submission-notice" data-published={!!submission.published}>
    <div className="report-notice-heading">
      <span className="report-notice-icon"><StatusIcon size={21} aria-hidden="true" /></span>
      <div role="status" className="report-notice-message"><h2>{title}</h2><p>{description}</p></div>
      <button type="button" aria-label="Fechar confirmação de envio" onClick={() => setSubmission(null)} className="report-notice-close"><X size={18} aria-hidden="true" /></button>
    </div>
    <div className="report-notice-footer">
      <div className="report-notice-details">
        {submission.title && <p className="report-notice-report" title={submission.title}>{submission.title}</p>}
        {submission.protocol && <p className="report-notice-protocol">Protocolo <strong>{submission.protocol}</strong></p>}
      </div>
      {!submission.anonymous && <Link to={submission.published ? `/bronca/${submission.id}` : '/perfil'} onClick={() => setSubmission(null)} className="report-notice-link">{submission.published ? 'Ver bronca' : 'Minhas broncas'}<ArrowUpRight size={17} aria-hidden="true" /></Link>}
    </div>
    {submission.anonymous && <p className="report-notice-anonymous">Guarde o protocolo. O envio sem conta não aparece nas suas broncas do Perfil.</p>}
  </aside>;
}
