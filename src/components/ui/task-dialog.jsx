import React from 'react';
import { DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// Shared task geometry: fixed heading/actions and one flexible scrolling body.
export const TaskDialogContent = React.forwardRef(({ className, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  const returnFocus = React.useRef(null);
  return <DialogContent ref={ref} className={cn('task-dialog', className)}
    onOpenAutoFocus={event => { returnFocus.current = document.activeElement; onOpenAutoFocus?.(event); }}
    onCloseAutoFocus={event => { onCloseAutoFocus?.(event); if (!event.defaultPrevented && returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus({ preventScroll: true }); } }} {...props} />;
});
TaskDialogContent.displayName = 'TaskDialogContent';

export function TaskDialogBody({ className, ...props }) {
  return <div className={cn('task-dialog-body', className)} data-task-scroll {...props} />;
}

export function TaskDialogFooter({ className, ...props }) {
  return <footer className={cn('task-dialog-footer', className)} {...props} />;
}
