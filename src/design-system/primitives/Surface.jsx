import React from 'react';

const ELEVATION = {
  0: '',
  1: 'shadow-elevation-1',
  2: 'shadow-elevation-2',
  3: 'shadow-elevation-3',
};

const Surface = React.forwardRef(function Surface(
  { as: Tag = 'div', elevation = 1, className = '', children, ...rest },
  ref
) {
  return (
    <Tag
      ref={ref}
      className={`bg-surface-raised border border-edge-subtle rounded-2xl ${ELEVATION[elevation] ?? ELEVATION[1]} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
});

export default Surface;
