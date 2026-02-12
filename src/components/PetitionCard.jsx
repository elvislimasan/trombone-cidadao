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
        <div className="h-48 overflow-hidden bg-muted relative shrink-0">
          {petition.image_url ? (
            <img 
              src={petition.image_url} 
              alt={petition.title} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/5">
              <FileSignature className="w-12 h-12 text-primary/20" />
            </div>
          )}
          <div className="absolute top-3 left-3 z-10">
            <div className="bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-bold shadow-sm flex items-center gap-1.5 text-slate-700 border border-white/20">
               <Users className="w-3.5 h-3.5 text-primary" />
               <span>{petition.signatures?.[0]?.count || 0}</span>
            </div>
          </div>
        </div>
        <CardContent className="p-5 flex flex-col flex-1">
          <h3 className="font-bold text-lg leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
            {petition.title}
          </h3>
          <p className="text-muted-foreground text-sm line-clamp-3 mb-4 flex-1">
            {petition.description}
          </p>
          
          <div className="space-y-2 mt-auto">
            <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
              <div 
                className="bg-primary h-full rounded-full transition-all duration-500" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{Math.round(progress)}% da meta</span>
              <span>Meta: {petition.goal}</span>
            </div>
            
            <button 
              className="w-full mt-3 flex items-center justify-center gap-2 py-2 rounded-md bg-primary/10 text-primary hover:bg-primary/20 font-semibold text-sm transition-colors"
            >
              <FileSignature className="w-4 h-4" />
              Ver e Assinar
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PetitionCard;
