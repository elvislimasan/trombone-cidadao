import React from 'react';
import { Link } from 'react-router-dom';
import { ThumbsUp, Share2, Star, FileSignature } from 'lucide-react';

// A mesma participação no resumo mobile e na coluna lateral desktop.
// Salvar e apoiar continuam operações distintas, com os handlers da página.
export default function ReportParticipation({ report, onSupport, onShare, onSave }) {
  return <section className="report-participation" aria-label="Participar desta bronca">
    <div className="report-participation-heading">
      <div><h2>Faça parte da solução</h2><p>Apoie o relato e ajude a dar visibilidade.</p></div>
      <span className="report-support-count"><strong>{report.upvotes || 0}</strong><span>apoios</span></span>
    </div>
    <button type="button" className="report-support-button" aria-pressed={!!report.user_has_upvoted} onClick={onSupport}>
      <ThumbsUp size={20} aria-hidden="true" fill={report.user_has_upvoted ? 'currentColor' : 'none'} />
      {report.user_has_upvoted ? 'Apoiado' : 'Apoiar bronca'}
    </button>
    <div className="report-secondary-actions">
      <button type="button" aria-pressed={!!report.is_favorited} onClick={onSave}><Star size={18} aria-hidden="true" fill={report.is_favorited ? 'currentColor' : 'none'} />{report.is_favorited ? 'Salva' : 'Salvar'}</button>
      <button type="button" onClick={onShare}><Share2 size={18} aria-hidden="true" />Compartilhar</button>
    </div>
    {report.petitionId && <Link className="report-petition-link" to={`/abaixo-assinado/${report.petitionId}`}><FileSignature size={18} aria-hidden="true" />Ver abaixo-assinado ligado</Link>}
  </section>;
}
