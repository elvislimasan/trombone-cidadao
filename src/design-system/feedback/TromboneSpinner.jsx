import React from 'react';

const TromboneSpinner = ({ size = 24, className = '', label = 'Carregando' }) => (
  <span
    role="status"
    aria-label={label}
    className={`inline-flex items-center justify-center ${className}`}
    style={{ width: size, height: size }}
  >
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
      <circle cx="7" cy="12" r="1.6" fill="currentColor" className="tc-spin-dot" style={{ animationDelay: '0ms' }} />
      <path
        d="M11.5 8.6a4.6 4.6 0 0 1 0 6.8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        className="tc-spin-arc"
        style={{ animationDelay: '140ms' }}
      />
      <path
        d="M15.4 6a8.2 8.2 0 0 1 0 12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        className="tc-spin-arc"
        style={{ animationDelay: '280ms' }}
      />
    </svg>
  </span>
);

export default TromboneSpinner;
