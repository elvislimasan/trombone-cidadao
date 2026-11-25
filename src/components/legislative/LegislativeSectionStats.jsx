import React from 'react';

export default function LegislativeSectionStats({ items, label }) {
  return <dl className="legislative-section-stats" aria-label={label}>{items.map(({ key, label, value, icon: Icon, color }) => <div key={key} style={{ '--stat-color': color || 'rgb(var(--brand))' }}><dt><span className="legislative-stat-icon" aria-hidden="true"><Icon size={22} /></span>{label}</dt><dd>{value == null ? '—' : new Intl.NumberFormat('pt-BR').format(value)}</dd></div>)}</dl>;
}
