import React from 'react';
import { Landmark, Shield } from 'lucide-react';
import { PIPA_PROVIDERS } from '@/lib/pipa';

export default function PipaProviderBadge({ provider }) {
  const Icon = provider === 'exercito' ? Shield : Landmark;
  return <span className="pipa-provider-badge" data-provider={provider}><Icon size={12} aria-hidden="true" />{PIPA_PROVIDERS[provider]}</span>;
}
