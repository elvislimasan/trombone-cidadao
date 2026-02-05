
import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Card } from '@/components/ui/card';

const DraggableSidebarItem = ({ type, label, icon: Icon }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sidebar-${type}`,
    data: {
      type,
      isSidebar: true,
      label, // Pass label for overlay
    },
  });

  return (
    <div 
        ref={setNodeRef} 
        {...listeners} 
        {...attributes} 
        className={`cursor-grab active:cursor-grabbing touch-none ${isDragging ? 'opacity-50' : ''}`}
    >
      <Card className="p-3 flex flex-col items-center gap-2 hover:bg-accent hover:text-accent-foreground transition-colors">
        <Icon className="w-6 h-6" />
        <span className="text-xs font-medium">{label}</span>
      </Card>
    </div>
  );
};

export default DraggableSidebarItem;
