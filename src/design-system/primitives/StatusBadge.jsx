import React from 'react';
import Icon from '@/design-system/icons';

export const STATUS_LABEL = {
  pending: 'Pendente',
  'in-progress': 'Em andamento',
  resolved: 'Resolvida',
  duplicate: 'Duplicada',
};

const STATUS_STYLE = {
  pending: 'bg-status-pendingBg text-status-pendingFg border-status-pendingBorder',
  'in-progress': 'bg-status-progressBg text-status-progressFg border-status-progressBorder',
  resolved: 'bg-status-resolvedBg text-status-resolvedFg border-status-resolvedBorder',
  duplicate: 'bg-status-duplicateBg text-status-duplicateFg border-status-duplicateBorder',
};

const STATUS_ICON = {
  pending: 'received',
  'in-progress': 'execution',
  resolved: 'resolved',
  duplicate: 'other',
};

const SIZE = {
  sm: 'text-2xs px-2 py-0.5 gap-1',
  md: 'text-xs px-2.5 py-1 gap-1.5',
};

const StatusBadge = ({ status = 'pending', size = 'sm', withIcon = false, className = '' }) => {
  const key = STATUS_STYLE[status] ? status : 'pending';
  return (
    <span
      className={`inline-flex items-center font-semibold uppercase tracking-wide rounded-full border whitespace-nowrap ${STATUS_STYLE[key]} ${SIZE[size] || SIZE.sm} ${className}`}
    >
      {withIcon && <Icon name={STATUS_ICON[key]} size={size === 'md' ? 14 : 12} />}
      {STATUS_LABEL[key]}
    </span>
  );
};

export default StatusBadge;
