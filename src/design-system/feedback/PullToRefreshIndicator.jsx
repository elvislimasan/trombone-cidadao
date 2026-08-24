import React from 'react';

// progress: 0..1 durante o arrasto. refreshing: true enquanto recarrega.
const PullToRefreshIndicator = ({ progress = 0, refreshing = false, size = 32 }) => {
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div
      className="flex items-center justify-center"
      style={{ height: size, opacity: refreshing ? 1 : p }}
      role="status"
      aria-label={refreshing ? 'Atualizando' : 'Puxe para atualizar'}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true" className="text-brand">
        <circle cx="7" cy="12" r="1.6" fill="currentColor" />
        <path
          d="M11.5 8.6a4.6 4.6 0 0 1 0 6.8"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          className={refreshing ? 'tc-spin-arc' : ''}
          style={refreshing ? { animationDelay: '140ms' } : { opacity: p >= 0.5 ? 1 : 0.2 }}
        />
        <path
          d="M15.4 6a8.2 8.2 0 0 1 0 12"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          className={refreshing ? 'tc-spin-arc' : ''}
          style={refreshing ? { animationDelay: '280ms' } : { opacity: p >= 0.9 ? 1 : 0.2 }}
        />
      </svg>
    </div>
  );
};

export default PullToRefreshIndicator;
