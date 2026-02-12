import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { FileSignature, Users, Heart } from 'lucide-react';

const PetitionCard = ({ petition, onClick, onDonate }) => {
  const progress = Math.min(((petition.signatures?.[0]?.count || 0) / (petition.goal || 100)) * 100, 100);
  
  return (
    <div 
      onClick={onClick}
      className="group block h-full cursor-pointer"
    >
      <Card className="h-full overflow-hidden hover:shadow-lg transition-all duration-300 border-border/60 group-hover:border-primary/50 flex flex-col">
        <div className="h-32 sm:h-40 md:h-48 overflow-hidden bg-muted relative shrink-0">
          {petition.image_url ? (
            <img 
              src={petition.image_url} 
              alt={petition.title} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/5">
              <FileSignature className="w-8 h-8 md:w-12 md:h-12 text-primary/20" />
            </div>
          )}
          <div className="absolute top-2 left-2 z-10">
            <div className="bg-white/90 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] md:text-[11px] font-bold shadow-sm flex items-center gap-1 text-slate-700 border border-white/20">
               <Users className="w-3 h-3 md:w-3.5 md:h-3.5 text-primary" />
               <span>{petition.signatures?.[0]?.count || 0}</span>
            </div>
          </div>
        </div>
        <CardContent className="p-3 md:p-5 flex flex-col flex-1">
          <h3 className="font-bold text-sm md:text-lg leading-tight mb-1.5 md:mb-2 group-hover:text-primary transition-colors line-clamp-2">
            {petition.title}
          </h3>
          <p className="text-muted-foreground text-[12px] md:text-sm line-clamp-2 md:line-clamp-3 mb-3 md:mb-4 flex-1">
            {petition.description}
          </p>
          
          <div className="space-y-1.5 md:space-y-2 mt-auto">
            <div className="w-full bg-muted h-1.5 md:h-2 rounded-full overflow-hidden">
              <div 
                className="bg-primary h-full rounded-full transition-all duration-500" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] md:text-xs text-muted-foreground">
              <span>{Math.round(progress)}%</span>
              <span>Meta: {petition.goal}</span>
            </div>
            
            <button 
              className="w-full mt-2 md:mt-3 flex items-center justify-center gap-1.5 py-1.5 md:py-2 rounded-md bg-primary/10 text-primary hover:bg-primary/20 font-semibold text-[12px] md:text-sm transition-colors"
            >
              <FileSignature className="w-3.5 h-3.5 md:w-4 md:h-4" />
              Ver e Assinar
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PetitionCard;
