
import React, { useState, useEffect } from 'react';
import { 
  DndContext, 
  closestCenter, 
  closestCorners,
  KeyboardSensor, 
  PointerSensor, 
  MouseSensor,
  TouchSensor,
  useSensor, 
  useSensors,
  DragOverlay,
  useDroppable
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy 
} from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  Type, Image as ImageIcon, Video, FileSignature, 
  Minus, MousePointerClick, LayoutTemplate, Plus 
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import SortableBlock from './SortableBlock';
import BlockProperties from './BlockProperties';
import DraggableSidebarItem from './DraggableSidebarItem';
import BlockRenderer from './BlockRenderer';
import { v4 as uuidv4 } from 'uuid';

const defaultBlocks = [
  { type: 'header', label: 'Título', icon: Type },
  { type: 'text', label: 'Texto', icon: LayoutTemplate },
  { type: 'image', label: 'Imagem', icon: ImageIcon },
  { type: 'video', label: 'Vídeo', icon: Video },
  { type: 'signature', label: 'Assinatura', icon: FileSignature },
  { type: 'separator', label: 'Divisor', icon: Minus },
  { type: 'button', label: 'Botão', icon: MousePointerClick },
];

const PetitionBuilder = ({ layout, onChange }) => {
  const [blocks, setBlocks] = useState(layout || []);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    if (layout) {
      setBlocks(layout);
    }
  }, [layout]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { setNodeRef: setCanvasRef, isOver } = useDroppable({
    id: 'canvas',
  });

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    // Dropping from sidebar
    if (active.data.current?.isSidebar) {
        const type = active.data.current.type;
        const newBlock = {
            id: uuidv4(),
            type,
            content: getDefaultContent(type),
            styles: getDefaultStyles(type)
        };
        
        // If dropped over a sortable item, insert after it
        // If dropped over container, append
        if (over.id === 'canvas') {
            const newBlocks = [...blocks, newBlock];
            setBlocks(newBlocks);
            onChange(newBlocks);
            setSelectedBlockId(newBlock.id);
        } else {
            const overIndex = blocks.findIndex((b) => b.id === over.id);
            const newBlocks = [...blocks];
            newBlocks.splice(overIndex + 1, 0, newBlock);
            setBlocks(newBlocks);
            onChange(newBlocks);
            setSelectedBlockId(newBlock.id);
        }
        return;
    }

    // Reordering
    if (active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      
      const newBlocks = arrayMove(blocks, oldIndex, newIndex);
      setBlocks(newBlocks);
      onChange(newBlocks);
    }
  };

  const getDefaultContent = (type) => {
      switch(type) {
          case 'header': return { text: 'Novo Título', level: 'h2' };
          case 'text': return { html: '<p>Digite seu texto aqui...</p>' };
          case 'image': return { url: '', caption: '' };
          case 'video': return { url: '' };
          case 'signature': return { label: 'Assinar Agora' };
          case 'separator': return { style: 'solid' };
          case 'button': return { text: 'Clique Aqui', url: '#' };
          default: return {};
      }
  };

  const getDefaultStyles = (type) => {
      return {
          padding: '20px',
          margin: '0px',
          textAlign: 'left',
          backgroundColor: 'transparent',
          color: 'inherit'
      };
  };

  const moveBlock = (id, direction) => {
    const index = blocks.findIndex(b => b.id === id);
    if (index === -1) return;
    
    if (direction === 'up' && index > 0) {
        const newBlocks = arrayMove(blocks, index, index - 1);
        setBlocks(newBlocks);
        onChange(newBlocks);
    } else if (direction === 'down' && index < blocks.length - 1) {
        const newBlocks = arrayMove(blocks, index, index + 1);
        setBlocks(newBlocks);
        onChange(newBlocks);
    }
  };

  const updateBlock = (id, updates) => {
      const newBlocks = blocks.map(b => b.id === id ? { ...b, ...updates } : b);
      setBlocks(newBlocks);
      onChange(newBlocks);
  };

  const removeBlock = (id) => {
      const newBlocks = blocks.filter(b => b.id !== id);
      setBlocks(newBlocks);
      onChange(newBlocks);
      if (selectedBlockId === id) setSelectedBlockId(null);
  };

  const selectedBlock = blocks.find(b => b.id === selectedBlockId);
  const activeSidebarItem = activeId ? defaultBlocks.find(b => `sidebar-${b.type}` === activeId) : null;

  return (
    <div className="flex h-[calc(100vh-200px)] border rounded-lg overflow-hidden bg-background">
        {/* Sidebar - Blocks */}
        <div className="w-64 border-r bg-muted/30 p-4 flex flex-col gap-4 z-10">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Elementos</h3>
            <div className="grid grid-cols-2 gap-2">
                {defaultBlocks.map((block) => (
                    <Card 
                        key={block.type}
                        className="p-3 flex flex-col items-center gap-2 hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer active:scale-95 border shadow-sm hover:shadow-md"
                        onClick={(e) => {
                            e.stopPropagation();
                            addBlock(block.type);
                        }}
                    >
                        <block.icon className="w-6 h-6" />
                        <span className="text-xs font-medium">{block.label}</span>
                    </Card>
                ))}
            </div>
        </div>

        {/* Canvas */}
        <DndContext 
            sensors={sensors} 
            collisionDetection={closestCorners} 
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
        <div className="flex-1 bg-muted/10 overflow-y-auto p-8 relative" id="canvas-container">
            <div 
              className={`max-w-2xl mx-auto min-h-[500px] bg-card shadow-sm border rounded-lg p-4 transition-all duration-200`}
            >
                <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                    {blocks.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                            <Plus className="w-8 h-8 mb-2 opacity-50" />
                            <p>Clique nos elementos para adicionar</p>
                        </div>
                    ) : (
                        blocks.map((block) => (
                            <SortableBlock 
                                key={block.id} 
                                block={block} 
                                isSelected={selectedBlockId === block.id}
                                onSelect={() => setSelectedBlockId(block.id)}
                                onRemove={() => removeBlock(block.id)}
                                onMoveUp={() => moveBlock(block.id, 'up')}
                                onMoveDown={() => moveBlock(block.id, 'down')}
                            />
                        ))
                    )}
                </SortableContext>
            </div>
        </div>
        
        <DragOverlay dropAnimation={null} zIndex={1000}>
            {activeId ? (
                blocks.find(b => b.id === activeId) ? (
                    <div className="opacity-90 w-[600px] bg-card p-4 rounded-lg shadow-xl border-2 border-primary cursor-grabbing scale-105 pointer-events-none">
                    <BlockRenderer block={blocks.find(b => b.id === activeId)} />
                    </div>
                ) : null
            ) : null}
        </DragOverlay>

        </DndContext>

        {/* Sidebar - Properties */}
        <div className="w-80 border-l bg-background p-4 overflow-y-auto z-10">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-4">Propriedades</h3>
            {selectedBlock ? (
                <BlockProperties 
                    block={selectedBlock} 
                    onChange={(updates) => updateBlock(selectedBlock.id, updates)} 
                />
            ) : (
                <div className="text-center text-muted-foreground py-10">
                    <LayoutTemplate className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>Selecione um elemento para editar suas propriedades</p>
                </div>
            )}
        </div>
      </div>
  );
};

export default PetitionBuilder;
