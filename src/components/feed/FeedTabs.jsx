import React from 'react';

// "Resolvidas" saiu do feed e virou filtro na busca: o feed e sobre o que
// precisa de atencao agora. A ordem segue o uso esperado — o padrao primeiro,
// proximidade no meio (exige GPS), popularidade por ultimo.
export const FEED_TABS = [
  { key: 'recent', label: 'Recentes' },
  { key: 'nearby', label: 'Perto de mim' },
  { key: 'trending', label: 'Em alta' },
];

const FeedTabs = ({ tabs = FEED_TABS, activeTab, onChange, idPrefix = 'feed' }) => (
  <div role="tablist" aria-label="Ordenar broncas" className="flex min-w-0 gap-1 rounded-2xl bg-surface-subtle p-1">
    {tabs.map((tab) => {
      const active = activeTab === tab.key;
      return (
        <button
          key={tab.key}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${tab.key}`}
          aria-controls={`${idPrefix}-panel`}
          aria-selected={active}
          tabIndex={active ? 0 : -1}
          onClick={() => onChange(tab.key)}
          onKeyDown={event => {
            const index = tabs.findIndex(item => item.key === tab.key);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : null;
            if (next === null) return;
            event.preventDefault();
            event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
            onChange(tabs[next].key);
          }}
          className={`relative min-h-12 min-w-0 flex-1 rounded-xl px-1.5 py-3 text-center text-sm font-semibold leading-5 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            active ? 'bg-surface-raised text-brand shadow-sm' : 'text-content-secondary hover:text-content-primary'
          }`}
        >
          {tab.label}
        </button>
      );
    })}
  </div>
);

export default FeedTabs;
