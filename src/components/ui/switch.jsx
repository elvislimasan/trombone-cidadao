import React from 'react';
import { cn } from '@/lib/utils';

const Switch = React.forwardRef(({ className, checked, onCheckedChange, size = "default", ...props }, ref) => {
  const sizeClasses = {
    default: "h-6 w-11",
    sm: "h-5 w-9"
  };

  const knobClasses = {
    default: "h-5 w-5",
    sm: "h-4 w-4"
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      className={cn(
        "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted",
        sizeClasses[size],
        className
      )}
      onClick={() => onCheckedChange?.(!checked)}
      ref={ref}
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
          knobClasses[size]
        )}
      />
    </button>
  );
});

Switch.displayName = "Switch";

export { Switch };