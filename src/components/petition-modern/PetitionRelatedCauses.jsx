import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, MapPin, Users, ChevronLeft, ChevronRight } from "lucide-react";

const PetitionRelatedCauses = ({ causes = [] }) => {
  if (!causes || causes.length === 0) {
    return null;
  }

  return (
    <section className="mt-8 md:mt-16 border-t pt-8 md:pt-12 px-4">
      <div className="mb-6 md:mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl md:text-3xl font-bold text-foreground">
            Outras causas que precisam de você
          </h2>
          <p className="mt-1 md:mt-2 text-sm md:text-base text-muted-foreground">
            Junte-se a milhares de pessoas que estão fazendo a diferença hoje.
          </p>
        </div>
        <Link 
          to="/abaixo-assinados" 
          className="group flex items-center gap-1 text-xs md:text-sm font-medium text-primary hover:underline"
        >
          Ver todas as petições
          <ArrowRight className="h-3.5 w-3.5 md:h-4 md:w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      <div className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {causes.map((cause) => {
          const signaturesCount = cause.signatures?.[0]?.count || 0;
          const goal = cause.goal || 100;
          const progress = Math.min((signaturesCount / goal) * 100, 100);
          
          return (
            <Card
              key={cause.id}
              className="group overflow-hidden border-0 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-lg flex flex-col h-full"
            >
              <div className="relative aspect-video overflow-hidden shrink-0">
                <img
                  src={cause.image_url || "/placeholder.svg"}
                  alt={cause.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute left-2 md:left-3 top-2 md:top-3 z-10">
                  <div className="bg-white/90 backdrop-blur-md px-2 py-0.5 md:px-2.5 md:py-1 rounded-full text-[10px] md:text-[11px] font-bold shadow-sm flex items-center gap-1 md:gap-1.5 text-slate-700 border border-white/20">
                    <Users className="h-3 w-3 md:h-3.5 md:w-3.5 text-primary" />
                    <span>{signaturesCount}</span>
                  </div>
                </div>
              </div>

              <CardContent className="p-4 md:p-5 flex flex-col flex-1">
                <h3 className="line-clamp-2 text-base md:text-lg font-semibold text-foreground transition-colors group-hover:text-primary mb-1.5 md:mb-2 leading-tight">
                  <Link to={`/abaixo-assinado/${cause.id}`}>
                    {cause.title}
                  </Link>
                </h3>
                <div 
                    className="line-clamp-2 text-xs md:text-sm text-muted-foreground mb-3 md:mb-4 flex-1"
                    dangerouslySetInnerHTML={{ __html: cause.description || '' }}
                />

                <div className="mt-auto space-y-3 md:space-y-4">
                  <div className="space-y-1.5 md:space-y-2">
                    <div className="flex items-center justify-between text-[10px] md:text-xs text-muted-foreground">
                      <span>{Math.round(progress)}% da meta</span>
                      <span>Meta: {goal}</span>
                    </div>
                    <Progress value={progress} className="h-1 md:h-1.5" />
                  </div>

                  <div className="flex items-center justify-between pt-1 md:pt-2">
                    <span className="flex items-center gap-1 text-[10px] md:text-xs text-muted-foreground">
                      <MapPin className="h-2.5 w-2.5 md:h-3 md:w-3" />
                      Floresta, PE
                    </span>
                    <Button asChild variant="outline" size="sm" className="h-8 md:h-9 text-[11px] md:text-xs text-primary hover:bg-primary hover:text-white bg-transparent px-2 md:px-3">
                        <Link to={`/abaixo-assinado/${cause.id}`}>
                        Ver e Assinar
                        </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
};

export default PetitionRelatedCauses;
