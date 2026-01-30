import React, { useState, useCallback, useEffect } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PetitionGallery = ({ images }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const scrollPrev = useCallback(() => emblaApi && emblaApi.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi && emblaApi.scrollNext(), [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
  }, [emblaApi, onSelect]);

  if (!images || images.length === 0) return null;

  if (images.length === 1) {
    return (
      <div className="relative aspect-video rounded-xl overflow-hidden shadow-lg mb-2">
        <img 
          src={images[0]} 
          alt="Campaign Main" 
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="relative group mb-2">
      <div className="overflow-hidden rounded-xl shadow-lg aspect-video" ref={emblaRef}>
        <div className="flex">
          {images.map((src, index) => (
            <div className="flex-[0_0_100%] min-w-0 relative" key={index}>
              <img 
                src={src} 
                alt={`Slide ${index + 1}`} 
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>

      <Button 
        variant="secondary" 
        size="icon" 
        className="absolute left-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background"
        onClick={(e) => { e.stopPropagation(); scrollPrev(); }}
      >
        <ChevronLeft className="w-6 h-6" />
      </Button>

      <Button 
        variant="secondary" 
        size="icon" 
        className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-background"
        onClick={(e) => { e.stopPropagation(); scrollNext(); }}
      >
        <ChevronRight className="w-6 h-6" />
      </Button>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {images.map((_, index) => (
          <button
            key={index}
            className={`w-2 h-2 rounded-full transition-all ${
              index === selectedIndex ? "bg-white w-6" : "bg-white/50"
            }`}
            onClick={() => emblaApi && emblaApi.scrollTo(index)}
          />
        ))}
      </div>
    </div>
  );
};

export default PetitionGallery;
