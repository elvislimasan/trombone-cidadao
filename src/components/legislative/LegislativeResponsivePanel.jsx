import React, { useId } from 'react';
import useIsMobile from '@/hooks/useIsMobile';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Drawer, DrawerTrigger, BottomSheetContent, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { X } from 'lucide-react';

// Mobile: a touch sheet with fixed actions. Desktop: an anchored, bounded panel.
// Only the active viewport variant is mounted, avoiding duplicate controls/IDs.
export default function LegislativeResponsivePanel({ trigger, title, open, onOpenChange, children, footer, className = '' }) {
  const mobile = useIsMobile(), titleId = useId();
  if (mobile) return <Drawer open={open} onOpenChange={onOpenChange} autoFocus>
    <DrawerTrigger asChild>{trigger}</DrawerTrigger>
    <BottomSheetContent className={`legislative-floating-panel legislative-sheet ${className}`} aria-describedby={undefined}>
      <header className="legislative-floating-heading"><DrawerTitle>{title}</DrawerTitle><DrawerClose asChild><button type="button" aria-label={`Fechar ${title}`} className="legislative-icon-button"><X size={20} /></button></DrawerClose></header>
      <div className="legislative-floating-body">{children}</div>{footer && <footer className="legislative-floating-actions">{footer}</footer>}
    </BottomSheetContent>
  </Drawer>;
  return <Popover open={open} onOpenChange={onOpenChange} modal>
    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
    <PopoverContent align="end" sideOffset={10} collisionPadding={16} className={`legislative-floating-panel ${className}`} aria-labelledby={titleId}>
      <header className="legislative-floating-heading"><h2 id={titleId}>{title}</h2><button type="button" onClick={() => onOpenChange(false)} aria-label={`Fechar ${title}`} className="legislative-icon-button"><X size={18} /></button></header>
      <div className="legislative-floating-body">{children}</div>{footer && <footer className="legislative-floating-actions">{footer}</footer>}
    </PopoverContent>
  </Popover>;
}
