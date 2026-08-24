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
  <div role="tablist" className="flex gap-1">
    {tabs.map((tab) => {
      const active = activeTab === tab.key;
      return (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active}
          onClick={() => onChange(tab.key)}
          className={`relative flex-1 py-3 px-1.5 text-sm font-semibold whitespace-nowrap transition-colors ${
            active ? 'text-brand' : 'text-content-secondary hover:text-content-primary'
          }`}
        >
          {tab.label}
          <span
            aria-hidden="true"
            className={`absolute bottom-0 left-2 right-2 h-0.5 rounded-full transition-opacity ${
              active ? 'bg-brand opacity-100' : 'opacity-0'
            }`}
          />
        </button>
      );
    })}
  </div>
);

export default FeedTabs;
