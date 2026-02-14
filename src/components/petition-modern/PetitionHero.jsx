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
  const displayImage = gallery && gallery.length > 0 ? gallery[0] : (imageUrl || '/abaixo-assinado.jpg');

  // Check permissions for editing
  const isAuthor = user && user.id === petition.author_id;
  const isAdmin = user?.app_metadata?.role === 'admin';
  const isPublic = ['open', 'victory', 'closed'].includes(petition.status);
  
  // Only show edit button if user is admin OR if they are author and petition is NOT public
  const canEdit = isAdmin || (isAuthor && !isPublic);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'open':
        return <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-200">ABAIXO-ASSINADO</Badge>;
      case 'victory':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-200">VITÓRIA</Badge>;
      case 'rejected':
        return <Badge variant="secondary" className="bg-red-100 text-red-800 hover:bg-red-200">REJEITADA</Badge>;
      case 'closed':
        return <Badge variant="secondary" className="bg-gray-100 text-gray-800 hover:bg-gray-200">ENCERRADA</Badge>;
      case 'draft':
        return <Badge variant="secondary" className="bg-slate-100 text-slate-800 hover:bg-slate-200">RASCUNHO</Badge>;
      case 'pending_moderation':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">EM ANÁLISE</Badge>;
      default:
        return <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">PETIÇÃO</Badge>;
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Breadcrumb & Meta */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-3 w-full">
        <div className="flex flex-wrap items-center gap-x-2 md:gap-x-3 gap-y-1.5 md:gap-y-2">
          {getStatusBadge(petition.status)}
          <div className="flex flex-wrap items-center gap-x-3 md:gap-x-4 gap-y-1 text-[10px] md:text-sm text-muted-foreground break-words overflow-hidden">
            <span className="flex items-center gap-1 md:gap-1.5">
              <CalendarDays className="h-3 w-3 md:h-4 md:w-4 shrink-0" />
              {formattedDate}
            </span>
            <span className="flex items-center gap-1 md:gap-1.5">
              <MapPin className="h-3 w-3 md:h-4 md:w-4 shrink-0" />
              {location}
            </span>
          </div>
        </div>
        
        {canEdit && (
          <div className="sm:ml-auto">
            <Button 
                variant="outline" 
                size="sm"
                className="w-full sm:w-auto h-8 md:h-9 text-xs md:text-sm"
                onClick={onEdit}
            >
                <Edit className="w-3 md:w-3.5 h-3 md:h-3.5 mr-1.5 md:mr-2" />
                {isAdmin && isPublic ? 'Gerenciar (Admin)' : 'Editar Página'}
            </Button>
          </div>
        )}
      </div>

      {/* Title */}
      <h1 className="text-balance break-words text-lg md:text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-foreground max-w-full overflow-hidden">
        {title}
      </h1>

      {/* Hero Image */}
      <div className="flex w-full justify-center bg-transparent">
        <div className="relative w-full max-w-[800px] overflow-hidden rounded-xl md:rounded-2xl shadow-xl md:shadow-2xl">
          <img
            src={displayImage}
            alt={title}
            className="h-full max-h-[250px] sm:max-h-[350px] md:max-h-[450px] w-full object-cover object-center"
          />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/10 to-transparent" />
        </div>
      </div>
    </div>
  );
};

export default PetitionHero;
