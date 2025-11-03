import React from 'react';

export const Separator = ({ className, orientation = "horizontal", ...props }) => {
  const orientationClass = orientation === "horizontal" ? "h-px w-full" : "h-full w-px";
  
  return (
    <div
      className={`shrink-0 bg-border ${orientationClass} ${className}`}
      {...props}
    />
  );
};