import React from 'react';
import { legislativeDate } from '@/lib/legislative';

export default function LegislativeDateBadge({ value }) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return <span className="legislative-date-badge">—</span>;
  return <time className="legislative-date-badge" dateTime={value} aria-label={legislativeDate(value)}><strong>{new Intl.DateTimeFormat('pt-BR',{day:'2-digit',timeZone:'UTC'}).format(date)}</strong><span>{new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'}).format(date).replace('.','')}</span><small>{date.getUTCFullYear()}</small></time>;
}
