import React, { useState } from 'react';
import { FileText, Play } from 'lucide-react';
import { useVideoThumbnail } from '@/hooks/useVideoThumbnail';

function reportState(report) {
  if (report.moderation_status === 'pending_approval') return { label: 'Em análise', tone: 'pending' };
  if (report.moderation_status === 'rejected') return { label: 'Não publicada', tone: 'rejected' };
  if (report.moderation_status === 'internal') return { label: 'Interna', tone: 'pending' };
  if (report.status === 'resolved') return { label: 'Resolvida', tone: 'resolved' };
  if (report.status === 'in-progress') return { label: 'Em andamento', tone: 'progress' };
  if (report.status === 'duplicate') return { label: 'Duplicada', tone: 'pending' };
  return { label: 'Pendente', tone: 'pending' };
}

function ReportTile({ report, onOpen }) {
  const photo = report.photos?.[0]?.url;
  const video = report.videos?.[0]?.url;
  const { thumbnailUrl } = useVideoThumbnail(photo ? null : video);
  const cover = photo || thumbnailUrl;
  const [failedCover, setFailedCover] = useState(null);
  const state = reportState(report);
  return <article className="profile-report-tile">
    <button type="button" className="profile-report-open" aria-label={`Abrir bronca: ${report.title}`} onClick={() => onOpen(report)}>
      <span className="profile-report-image">
        {cover && cover !== failedCover ? <img src={cover} alt="" loading="lazy" onError={() => setFailedCover(cover)} /> : <span className="profile-report-fallback" aria-hidden="true">{report.categoryIcon || <FileText size={26} />}</span>}
        {video && !photo && <span className="profile-report-video"><Play size={16} aria-hidden="true" /></span>}
      </span>
      <strong>{report.title}</strong><span className="profile-report-state" data-tone={state.tone}>{state.label}</span>
    </button>
  </article>;
}

export default function ProfileReportGallery({ reports, onOpen }) {
  return <div className="profile-report-gallery" aria-label="Minhas broncas em miniaturas">{reports.map(report => <ReportTile key={report.id} report={report} onOpen={onOpen} />)}</div>;
}
