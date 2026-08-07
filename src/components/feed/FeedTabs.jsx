import React from 'react';

export const FEED_TABS = [
  { key: 'recent', label: 'Recentes' },
  { key: 'trending', label: 'Em alta' },
  { key: 'resolved', label: 'Resolvidas' },
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
          className={`relative flex-1 py-3 px-3 text-sm font-semibold transition-colors ${
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
