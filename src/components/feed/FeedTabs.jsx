import React from 'react';

export const FEED_TABS = [
  { key: 'recent', label: 'Recentes' },
  { key: 'trending', label: 'Em alta' },
  { key: 'resolved', label: 'Resolvidas' },
];

const FeedTabs = ({ tabs = FEED_TABS, activeTab, onChange }) => (
  <div className="flex gap-1 py-2">
    {tabs.map((tab) => (
      <button
        key={tab.key}
        onClick={() => onChange(tab.key)}
        className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
          activeTab === tab.key
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

export default FeedTabs;
