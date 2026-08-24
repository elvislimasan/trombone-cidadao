import React from 'react';
import Icon from '@/design-system/icons';

const EmptyState = ({ icon = 'trombone', title, description, action, className = '' }) => (
  <div className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}>
    <div className="w-20 h-20 rounded-full bg-surface-sunken flex items-center justify-center mb-4 text-content-tertiary">
      <Icon name={icon} size={36} />
    </div>
    <h3 className="font-display font-bold text-lg text-content-primary mb-2">{title}</h3>
    {description && (
      <p className="text-sm text-content-secondary max-w-xs mb-6">{description}</p>
    )}
    {action}
  </div>
);

export default EmptyState;
