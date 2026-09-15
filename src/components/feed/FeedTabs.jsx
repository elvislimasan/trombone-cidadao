import React from 'react';

// "Resolvidas" saiu do feed e virou filtro na busca: o feed e sobre o que
// precisa de atencao agora. A ordem segue o uso esperado — o padrao primeiro,
// proximidade no meio (exige GPS), popularidade por ultimo.
export const FEED_TABS = [
  { key: 'recent', label: 'Recentes' },
  { key: 'nearby', label: 'Perto de mim' },
  { key: 'trending', label: 'Em alta' },
];

const FeedTabs = ({ tabs = FEED_TABS, activeTab, onChange }) => (
  <div role="tablist" className="flex gap-1 rounded-xl bg-surface-raised p-1">
    {tabs.map((tab) => {
      const active = activeTab === tab.key;
      return (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active}
          onClick={() => onChange(tab.key)}
          className={`relative flex-1 rounded-lg px-1.5 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${
            active ? 'border border-transparent bg-surface-raised text-brand' : 'border border-transparent text-content-secondary hover:text-content-primary'
          }`}
        >
          {tab.label}
          <span
            aria-hidden="true"
            className={`absolute bottom-1 left-3 right-3 h-0.5 rounded-full transition-opacity ${
              active ? 'bg-brand opacity-100' : 'opacity-0'
            }`}
          />
        </button>
      );
    })}
  </div>
);

export default FeedTabs;
