import React from 'react';

const VARIANT = {
  hot:    'bg-signal-hotBg text-signal-hotFg',
  rising: 'bg-signal-risingBg text-signal-risingFg',
  fresh:  'bg-signal-freshBg text-signal-freshFg',
  urgent: 'bg-status-pendingBg text-status-pendingFg border border-status-pendingBorder',
};

const SignalChip = ({ variant = 'hot', label, className = '' }) => (
  <span
    className={`inline-flex items-center text-2xs font-bold tracking-tight px-2 py-1 rounded-full shadow-elevation-1 ${VARIANT[variant] || VARIANT.hot} ${className}`}
  >
    {label}
  </span>
);

export default SignalChip;
