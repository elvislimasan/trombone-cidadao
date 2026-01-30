import React from 'react';
import { Button } from '@/components/ui/button';
import { X, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';

const GalleryEditor = ({ images = [], onChange }) => {
  const handleRemove = (index) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    onChange(newImages);
  };

  const handleMove = (index, direction) => {
    if (
      (direction === -1 && index === 0) || 
      (direction === 1 && index === images.length - 1)
    ) return;

    const newImages = [...images];
    const temp = newImages[index];
    newImages[index] = newImages[index + direction];
    newImages[index + direction] = temp;
    onChange(newImages);
  };

  if (images.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
      {images.map((url, index) => (
        <div key={`${url}-${index}`} className="relative group border rounded-lg overflow-hidden bg-background">
          <div className="aspect-video w-full relative">
            <img 
              src={url} 
              alt={`Gallery ${index + 1}`} 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button 
                variant="secondary" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => handleMove(index, -1)}
                disabled={index === 0}
              >
                <ArrowUp className="w-4 h-4" />
              </Button>
              <Button 
                variant="secondary" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => handleMove(index, 1)}
                disabled={index === images.length - 1}
              >
                <ArrowDown className="w-4 h-4" />
              </Button>
              <Button 
                variant="destructive" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => handleRemove(index)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default GalleryEditor;
