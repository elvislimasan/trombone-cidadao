import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Clock, Megaphone, Newspaper, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Component to display updates posted by the petition creator.
 * Renders a list of updates in a modern carousel style.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Array} props.updates - Array of update objects
 * @param {React.ReactNode} [props.action] - Optional action element to display in header
 */
const PetitionUpdates = ({ updates, action }) => {
  if (!updates || updates.length === 0) return null;

  // Sort updates by date (newest first)
  const sortedUpdates = [...updates].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const [api, setApi] = useState(null);

  // Auto-scroll effect
  useEffect(() => {
    if (!api) return;

    const intervalId = setInterval(() => {
      api.scrollNext();
    }, 5000); // Auto-scroll every 5 seconds
    
    return () => clearInterval(intervalId);
  }, [api]);

  return (
    <div className="py-12 relative overflow-hidden" data-testid="petition-updates">
      {/* Background Decorative Icons */}
      <div className="absolute inset-0 pointer-events-none select-none opacity-[0.03] text-foreground">
          <Megaphone className="absolute -top-6 -left-6 w-48 h-48 -rotate-12" />
          <Sparkles className="absolute top-1/3 right-0 w-32 h-32 rotate-45" />
          <Newspaper className="absolute -bottom-12 left-1/3 w-56 h-56 rotate-6" />
      </div>

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4 mb-8 px-8 md:px-12">
            <div className="flex items-center gap-2">
                <div className="h-8 w-1.5 bg-primary rounded-full shadow-[0_0_15px_rgba(var(--primary),0.5)]" />
                <h3 className="text-2xl font-bold text-foreground tracking-tight">
                    Novidades da Campanha
                </h3>
            </div>
            {action && (
                <div className="shrink-0">
                    {action}
                </div>
            )}
        </div> 
      </div>
        <div className="w-full px-8 md:px-12">
            <Carousel 
                opts={{
                    align: "start",
                    loop: true,
                }}
                setApi={setApi}
                className="w-full"
            >
                <CarouselContent className="-ml-2 md:-ml-4">
                    {sortedUpdates.map((update) => (
                        <CarouselItem key={update.id} className="pl-2 md:pl-4 md:basis-1/2 lg:basis-1/2">
                            <Card className="h-full border-0 shadow-lg bg-card/40 backdrop-blur-md hover:bg-card/60 transition-all duration-300 group overflow-hidden ring-1 ring-white/10">
                                <CardContent className="p-0 h-full flex flex-col">
                                    {update.image_url ? (
                                        <div className="relative w-full h-48 overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent z-10" />
                                            <img 
                                                src={update.image_url} 
                                                alt={update.title} 
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                                loading="lazy" 
                                            />
                                            <div className="absolute bottom-3 left-4 z-20 flex items-center gap-2 text-xs font-medium text-white/90">
                                                <div className="bg-black/40 px-2.5 py-1 rounded-md backdrop-blur-md border border-white/10 shadow-sm flex items-center">
                                                    <Clock className="w-3.5 h-3.5 mr-1.5 text-primary" />
                                                    {formatDistanceToNow(new Date(update.created_at), { addSuffix: true, locale: ptBR })}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="px-6 pt-6 pb-2 relative">
                                            <Newspaper className="absolute -right-6 -top-6 w-32 h-32 text-primary/5 rotate-12 pointer-events-none" />
                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium relative z-10">
                                                <Clock className="w-3.5 h-3.5" />
                                                {formatDistanceToNow(new Date(update.created_at), { addSuffix: true, locale: ptBR })}
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div className="p-6 flex flex-col flex-grow relative z-10">
                                        <h4 className="text-xl font-bold text-foreground mb-3 leading-tight group-hover:text-primary transition-colors">
                                            {update.title}
                                        </h4>

                                        <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground line-clamp-3 flex-grow">
                                            <p className="whitespace-pre-line leading-relaxed">
                                                {update.content}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </CarouselItem>
                    ))}
                </CarouselContent>
                <CarouselPrevious className="-left-4 md:-left-12" />
                <CarouselNext className="-right-4 md:-right-12" />
            </Carousel>
        </div>
        
    </div>
  );
};

PetitionUpdates.propTypes = {
  updates: PropTypes.array,
  action: PropTypes.node,
};

export default PetitionUpdates;
