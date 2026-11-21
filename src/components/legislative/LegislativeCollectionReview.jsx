import React, { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function LegislativeCollectionReview({ run, disabled, onReview }) {
  const [note, setNote] = useState('');const quality = run.summary?.quality;
  if (!quality?.blocked) return null;
  return <div className="legislative-notice" role={quality.reviewed ? 'status' : 'alert'}>
    <strong>{quality.reviewed ? 'Alterações conferidas' : 'Publicação bloqueada para conferência'}</strong>
    <ul className="mt-3 grid gap-2">{quality.issues.map((issue, i) => <li key={i}>{issue.kind}: {issue.reason === 'mass_change' ? `${issue.changed} de ${issue.before} documentos foram alterados.` : `${issue.missing} registros anteriores ausentes; total passou de ${issue.before} para ${issue.after}.`}</li>)}</ul>
    {quality.reviewed ? <p className="mt-3">A conferência foi registrada. Publique o acervo manualmente após revisar.</p> : <form className="legislative-review-form" onSubmit={event => { event.preventDefault();onReview(note); }}><label>O que foi conferido na fonte oficial?<textarea required minLength={20} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></label><Button disabled={disabled} variant="outline" className="w-fit">Registrar conferência</Button></form>}
  </div>;
}
