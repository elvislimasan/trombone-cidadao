import React from 'react';

export function TimeAgo({ date, className = '' }) {
  if (!date) return null;

  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;

  if (isNaN(diffMs)) return null;

  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  const weeks = Math.floor(days / 7);

  let text;
  if (mins < 1) text = 'agora';
  else if (mins < 60) text = `há ${mins}min`;
  else if (hours < 24) text = `há ${hours}h`;
  else if (days < 7) text = `há ${days}d`;
  else if (weeks < 4) text = `há ${weeks}sem`;
  else text = then.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

  return <span className={className}>{text}</span>;
}

export default TimeAgo;
