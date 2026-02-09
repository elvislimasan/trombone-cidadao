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
    <section className="mt-16 border-t pt-12 px-4">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
            Outras causas que precisam de você
          </h2>
          <p className="mt-2 text-muted-foreground">
            Junte-se a milhares de pessoas que estão fazendo a diferença hoje.
          </p>
        </div>
        <Link 
          to="/abaixo-assinados" 
          className="group flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Ver todas as petições
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                <Badge className="absolute right-3 top-3 bg-white/90 text-foreground hover:bg-white">
                  <Users className="mr-1 h-3 w-3" />
                  {signaturesCount}
                </Badge>
              </div>

              <CardContent className="p-5 flex flex-col flex-1">
                <h3 className="line-clamp-2 text-lg font-semibold text-foreground transition-colors group-hover:text-primary mb-2">
                  <Link to={`/abaixo-assinado/${cause.id}`}>
                    {cause.title}
                  </Link>
                </h3>
                <div 
                    className="line-clamp-2 text-sm text-muted-foreground mb-4 flex-1"
                    dangerouslySetInnerHTML={{ __html: cause.description || '' }}
                />

                <div className="mt-auto space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{Math.round(progress)}% da meta</span>
                      <span>Meta: {goal}</span>
                    </div>
                    <Progress value={progress} className="h-1.5" />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      Floresta, PE
                    </span>
                    <Button asChild variant="outline" size="sm" className="text-primary hover:bg-primary hover:text-white bg-transparent">
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
