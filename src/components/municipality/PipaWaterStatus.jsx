import React from 'react';
import { AlertCircle, Droplets } from 'lucide-react';
import { PIPA_LEVELS } from '@/lib/pipaWaterLevel';

export default function PipaWaterStatus({ level, compact = false }) {
  const state = level?.state || 'unknown', config = PIPA_LEVELS[state];
  const label = level?.reportedDry ? 'Vazia informada' : config.label;
  return <div className={`pipa-water-status${compact ? ' is-compact' : ''}`} data-level={state} title={level?.reason}>
    <span className="pipa-water-label">{level?.urgent ? <AlertCircle size={13} /> : <Droplets size={13} />}<span>{label}</span>{level?.percent != null && <strong>~{level.percent}%</strong>}</span>
    {!compact && level?.percent != null && <span className="pipa-water-gauge" aria-hidden="true"><i style={{ width: `${level.percent}%` }} /></span>}
  </div>;
}
