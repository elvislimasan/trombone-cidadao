import React from 'react';
import { ChevronDown, Clock3, MapPin, TrendingUp } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FEED_TABS } from '@/components/feed/FeedTabs';

const details = {
  recent: { icon: Clock3, description: 'Os relatos mais novos da cidade' },
  nearby: { icon: MapPin, description: 'Até 15 km de onde você está' },
  trending: { icon: TrendingUp, description: 'Broncas com mais apoio recente' },
};

export default function FeedSortMenu({ activeTab, onChange }) {
  const selected = FEED_TABS.find(item => item.key === activeTab) || FEED_TABS[0];
  return (
    <div className="feed-sort-row">
      <h2 id="feed-content-title">Na comunidade</h2>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="feed-sort-trigger" aria-label={`Organizar broncas: ${selected.label}`} data-testid="feed-sort-trigger">
            <span>{selected.label}</span><ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} collisionPadding={12} className="w-72 max-w-[calc(100vw-2rem)] rounded-2xl border-edge-subtle bg-surface-raised p-2 shadow-elevation-2">
          <DropdownMenuLabel className="px-3 py-2 text-xs text-content-secondary">O que você quer ver?</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-edge-subtle" />
          <DropdownMenuRadioGroup value={selected.key} onValueChange={onChange}>
            {FEED_TABS.map(({ key, label }) => {
              const { icon: Icon, description } = details[key];
              return (
                <DropdownMenuRadioItem key={key} value={key} aria-label={label} className="min-h-16 cursor-pointer gap-3 rounded-xl py-3 pr-3 text-content-primary focus:bg-surface-subtle data-[state=checked]:text-brand-subtleFg">
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0"><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 block text-xs leading-5 text-content-secondary">{description}</span></span>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
