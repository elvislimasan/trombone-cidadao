import React from 'react';

const TromboneSplash = ({ message = 'Carregando...' }) => (
  <div
    role="status"
    aria-label={message}
    className="flex flex-col items-center justify-center gap-4 py-16"
  >
    <svg viewBox="0 0 24 24" width={72} height={72} fill="none" aria-hidden="true" className="text-brand">
      <path
        d="M3 10.2v3.6a1.4 1.4 0 0 0 1.4 1.4h2.1l6.6 3.9a.9.9 0 0 0 1.4-.78V5.68a.9.9 0 0 0-1.4-.78L6.5 8.8H4.4A1.4 1.4 0 0 0 3 10.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="tc-splash-draw"
        style={{ '--tc-draw-length': 70 }}
      />
      <path
        d="M6.5 15.2v3.1a1.6 1.6 0 0 0 1.6 1.6h.6a1.6 1.6 0 0 0 1.6-1.6v-1.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="tc-splash-draw"
        style={{ '--tc-draw-length': 20, animationDelay: '260ms' }}
      />
      <path
        d="M17.6 9.4a3.6 3.6 0 0 1 0 5.2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        className="tc-splash-wave"
        style={{ animationDelay: '0ms' }}
      />
      <path
        d="M20.1 7.2a7 7 0 0 1 0 9.6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        className="tc-splash-wave"
        style={{ animationDelay: '220ms' }}
      />
    </svg>
    <p className="text-sm text-content-secondary">{message}</p>
  </div>
);

export default TromboneSplash;
