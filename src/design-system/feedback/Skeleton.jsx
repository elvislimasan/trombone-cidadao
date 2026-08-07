import React from 'react';

export const Skeleton = ({ className = '', rounded = 'rounded-lg', style }) => (
  <div
    aria-hidden="true"
    className={`tc-shimmer ${rounded} ${className}`}
    style={style}
  />
);

export const SkeletonText = ({ lines = 3, className = '' }) => (
  <div className={`space-y-2 ${className}`} aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        className="h-3.5"
        style={{ width: i === lines - 1 ? '65%' : '100%' }}
      />
    ))}
  </div>
);

export default Skeleton;
