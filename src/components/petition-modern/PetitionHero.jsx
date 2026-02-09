import React from 'react';
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Edit, MapPin } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from '../../contexts/SupabaseAuthContext';
import { Button } from '../ui/button';

const PetitionHero = ({ 
  title, 
  createdAt, 
  location = "Floresta, PE", 
  imageUrl, 
  gallery,
  petition,
  user,
  onEdit
}) => {
  const formattedDate = createdAt 
    ? format(new Date(createdAt), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
    : format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR });

  // Fallback image if none provided
  const displayImage = gallery && gallery.length > 0 ? gallery[0] : (imageUrl || '/images/thumbnail.jpg');

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Meta */}
      <div className="flex flex-wrap items-center gap-3 w-full">
        <Badge variant="secondary" className="bg-primary/10 font-semibold text-primary hover:bg-primary/20">
          PETIÇÃO
        </Badge>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            {formattedDate}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            {location}
          </span>
          <div className="ml-auto">
          {user && (user.id === petition.author_id || user.app_metadata?.role === 'admin') && (
                  <Button 
                      variant="outline" 
                      className="max-w-[200px]"
                      onClick={onEdit}
                  >
                      <Edit className="w-4 h-4 mr-2" />
                      Editar Página
                  </Button>
              )}
        </div>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-balance  text-xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-4xl">
        {title}
      </h1>

      {/* Hero Image */}
      <div className="flex w-full justify-center bg-transparent">
        <div className="relative w-full max-w-[800px] overflow-hidden rounded-2xl shadow-2xl">
          <img
            src={displayImage}
            alt={title}
            className="h-full max-h-[450px] w-full object-cover object-center lg:max-h-[400px]"
          />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/10 to-transparent" />
        </div>
      </div>
    </div>
  );
};

export default PetitionHero;
