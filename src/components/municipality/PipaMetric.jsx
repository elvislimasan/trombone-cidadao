import React from 'react';

export default function PipaMetric({ icon: Icon, label, value, detail, tone = 'brand' }) {
  return <div className="pipa-metric" data-tone={tone}>
    <div className="pipa-metric-icon" aria-hidden="true"><Icon size={20} /></div>
    <span>{label}</span>
    <strong>{value}</strong>
    {detail && <small>{detail}</small>}
  </div>;
}
